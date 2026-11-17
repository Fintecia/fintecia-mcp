import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

/**
 * Non-blocking update check. At startup (TTL 1/day) it compares the installed
 * `fintecia` version against `npm view fintecia version` and, when a newer one
 * exists, writes a notice to stderr (never stdout — the stdio JSON-RPC channel
 * must stay clean) so the agent can surface it to the user.
 *
 * Best-effort: it never throws, never blocks startup, and no-ops on any
 * failure. Opt-out via `FINTECIA_UPDATE_CHECK=off|0`.
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

/** Overridable dependencies so tests never hit npm or the real filesystem. */
export interface UpdateCheckDeps {
  getLatestVersion: () => Promise<string | null>;
  getInstalledVersion: () => string | null;
  readLastCheck: () => number | null;
  writeLastCheck: (ts: number) => void;
  now: () => number;
}

function updateCheckFile(): string {
  return join(os.homedir(), ".fintecia", "update-check");
}

function defaultGetLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    // `timeout` kills the child and errors after ~3s so a hung registry can
    // never block startup or leave a stray process behind.
    execFile(
      "npm",
      ["view", "fintecia", "version"],
      { timeout: FETCH_TIMEOUT_MS },
      (error, stdout) => {
        if (error) return resolve(null);
        const version = stdout.trim();
        resolve(version || null);
      },
    );
  });
}

function defaultGetInstalledVersion(): string | null {
  // `__dirname` is the module directory under a CJS loader (the jest
  // transform). The ESM production build (dist/) has no `__dirname`, so the
  // entrypoint (index.ts) resolves the version from import.meta.url — the same
  // pattern as server.ts PKG_VERSION — and passes it in explicitly.
  if (typeof __dirname === "undefined") return null;
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

function defaultReadLastCheck(): number | null {
  try {
    const raw = readFileSync(updateCheckFile(), "utf8").trim();
    const ts = Number.parseInt(raw, 10);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function defaultWriteLastCheck(ts: number): void {
  try {
    mkdirSync(join(os.homedir(), ".fintecia"), { recursive: true });
    writeFileSync(updateCheckFile(), String(ts), { mode: 0o600 });
  } catch {
    // best-effort; a failed write just means a re-check next startup
  }
}

const defaultDeps: UpdateCheckDeps = {
  getLatestVersion: defaultGetLatestVersion,
  getInstalledVersion: defaultGetInstalledVersion,
  readLastCheck: defaultReadLastCheck,
  writeLastCheck: defaultWriteLastCheck,
  now: () => Date.now(),
};

/**
 * Numeric compare of `MAJOR.MINOR.PATCH`. Prerelease (`-…`) and build (`+…`)
 * suffixes are ignored; missing/undefined parts count as 0; non-numeric parts
 * parse to 0. Returns true only when `latest` is strictly greater.
 */
export function isNewerVersion(installed: string, latest: string): boolean {
  const [iMajor, iMinor, iPatch] = parseVersion(installed);
  const [lMajor, lMinor, lPatch] = parseVersion(latest);

  if (lMajor !== iMajor) return lMajor > iMajor;
  if (lMinor !== iMinor) return lMinor > iMinor;
  return lPatch > iPatch;
}

function parseVersion(version: string): [number, number, number] {
  const core = version.trim().split("-")[0].split("+")[0];
  const [major = "0", minor = "0", patch = "0"] = core.split(".");
  return [toInt(major), toInt(minor), toInt(patch)];
}

function toInt(part: string): number {
  const n = Number.parseInt(part, 10);
  return Number.isNaN(n) ? 0 : n;
}

function isUpdateCheckDisabled(): boolean {
  const v = process.env.FINTECIA_UPDATE_CHECK;
  return v === "off" || v === "0";
}

/**
 * Check for a newer version and, when one exists, print a non-blocking notice
 * to stderr. Fire-and-forget; never throws.
 */
export async function checkForUpdate(deps: Partial<UpdateCheckDeps> = {}): Promise<void> {
  if (isUpdateCheckDisabled()) return;

  const resolved: UpdateCheckDeps = { ...defaultDeps, ...deps };
  const nowMs = resolved.now();

  const last = resolved.readLastCheck();
  if (last !== null && nowMs - last < TTL_MS) return;

  // Persist the check timestamp up front so a failure doesn't spam a fresh
  // notice on every startup (cache + TTL).
  resolved.writeLastCheck(nowMs);

  const installed = resolved.getInstalledVersion();
  if (!installed) return;

  let latest: string | null;
  try {
    latest = await resolved.getLatestVersion();
  } catch {
    latest = null;
  }
  if (!latest) return;

  if (isNewerVersion(installed, latest)) {
    console.error(
      `hay una versión nueva (v${installed} → v${latest}). Actualiza con: npm install -g fintecia`,
    );
  }
}
