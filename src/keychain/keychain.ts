import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * OS keychain abstraction — stores the FIEL password so `cfdi_download` can
 * sign without re-prompting. The .cer/.key live in FileFielStore; only the
 * PASSWORD is keychain-held (the OS secure store is the one place it may be
 * persisted). Fallback (no keyring) returns null → re-prompt via onboarding.
 */

export interface Keychain {
  set(key: string, secret: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

const SERVICE = "fintecia-mcp";

/** macOS Keychain via `security` CLI. */
class MacKeychain implements Keychain {
  async set(key: string, secret: string): Promise<void> {
    await execFileAsync("security", [
      "add-generic-password",
      "-a", key,
      "-s", SERVICE,
      "-w", secret,
      "-U",
    ]);
  }
  async get(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-a", key,
        "-s", SERVICE,
        "-w",
      ]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
  async delete(key: string): Promise<void> {
    await execFileAsync("security", [
      "delete-generic-password",
      "-a", key,
      "-s", SERVICE,
    ]).catch(() => {});
  }
}

/** Windows DPAPI via PowerShell (ProtectData / UnprotectData). */
class WinKeychain implements Keychain {
  async set(key: string, secret: string): Promise<void> {
    const b64 = Buffer.from(secret, "utf8").toString("base64");
    await execFileAsync("powershell", [
      "-NoProfile", "-Command",
      `Add-Type -AssemblyName System.Security; ` +
        `[IO.File]::WriteAllBytes($env:LOCALAPPDATA + '\\fintecia-${sanitizeWin(key)}', ` +
        `[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes('${b64}'), $null, 'CurrentUser'))`,
    ]);
  }
  async get(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("powershell", [
        "-NoProfile", "-Command",
        `Add-Type -AssemblyName System.Security; ` +
          `$b=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($env:LOCALAPPDATA + '\\fintecia-${sanitizeWin(key)}'), $null, 'CurrentUser'); ` +
          `[Text.Encoding]::UTF8.GetString($b)`,
      ]);
      const b64 = stdout.trim();
      return b64 ? Buffer.from(b64, "base64").toString("utf8") : null;
    } catch {
      return null;
    }
  }
  async delete(key: string): Promise<void> {
    await execFileAsync("powershell", [
      "-NoProfile", "-Command",
      `Remove-Item ($env:LOCALAPPDATA + '\\fintecia-${sanitizeWin(key)}') -ErrorAction SilentlyContinue`,
    ]).catch(() => {});
  }
}

/** Linux libsecret via `secret-tool`. */
class LinuxKeychain implements Keychain {
  async set(key: string, secret: string): Promise<void> {
    // Throw on failure (consistent with Mac/Win): the caller must surface the
    // keyring error instead of silently dropping the password and leaving the
    // FIEL in an unrecoverable "stored but no password" state.
    execFileSync("secret-tool", [
      "store", "--label=fintecia-mcp", "service", SERVICE, "account", key,
    ], { input: secret });
  }
  async get(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("secret-tool", [
        "lookup", "service", SERVICE, "account", key,
      ]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
  async delete(key: string): Promise<void> {
    await execFileAsync("secret-tool", [
      "clear", "service", SERVICE, "account", key,
    ]).catch(() => {});
  }
}

/** No keyring available (e.g. headless Linux): nothing is persisted. */
class NullKeychain implements Keychain {
  async set(): Promise<void> {}
  async get(): Promise<string | null> {
    return null;
  }
  async delete(): Promise<void> {}
}

/** Pure platform → adapter selection (unit-testable). */
export function detectKeychain(platform: NodeJS.Platform): Keychain {
  switch (platform) {
    case "darwin":
      return new MacKeychain();
    case "win32":
      return new WinKeychain();
    case "linux":
      return new LinuxKeychain();
    default:
      return new NullKeychain();
  }
}

export function fielKeychainKey(rfc: string): string {
  return `fiel:${rfc.toUpperCase()}`;
}

function sanitizeWin(key: string): string {
  return key.replace(/[^A-Za-z0-9-]/g, "-");
}
