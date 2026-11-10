import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * FIEL storage — multi-taxpayer, keyed by RFC.
 *
 * Security model (S2): the .key is the private material and NEVER leaves the
 * machine nor is logged. The stored `.key` PEM is already password-encrypted
 * with the user's FIEL password; the password itself is held ONLY in the OS
 * keychain (never in the file store, never logged, never uploaded). The .cer
 * is public.
 *
 * FileFielStore is the cross-platform base and the Linux fallback. The OS
 * keychain (macOS Keychain / Windows DPAPI / Linux libsecret) is a follow-up
 * refinement behind the same FielStore port (T1b).
 */

export interface FielCredentials {
  rfc: string;
  certPem: string; // .cer content (public)
  keyPem: string; // .key content (private, password-encrypted PEM)
}

export interface FielStore {
  store(fiel: FielCredentials): Promise<void>;
  load(rfc: string): Promise<FielCredentials | null>;
  list(): Promise<string[]>; // stored RFCs (multi-taxpayer)
  remove(rfc: string): Promise<void>;
}

const CERT_FILE = "certificate.cer";
const KEY_FILE = "private.key";

function sanitizeRfc(rfc: string): string {
  // RFC is alphanumeric; defensive guard against path traversal.
  if (!/^[A-ZÑ&0-9]{12,13}$/.test(rfc)) {
    throw new Error(`invalid RFC for storage: ${rfc}`);
  }
  return rfc;
}

export class FileFielStore implements FielStore {
  constructor(private readonly baseDir: string = defaultBaseDir()) {}

  private dirFor(rfc: string): string {
    return path.join(this.baseDir, sanitizeRfc(rfc));
  }

  async store(fiel: FielCredentials): Promise<void> {
    const dir = this.dirFor(fiel.rfc);
    await fs.mkdir(dir, { recursive: true });
    // 0600: owner-only — the .key must not be world-readable.
    await fs.writeFile(path.join(dir, CERT_FILE), fiel.certPem, { mode: 0o600 });
    await fs.writeFile(path.join(dir, KEY_FILE), fiel.keyPem, { mode: 0o600 });
  }

  async load(rfc: string): Promise<FielCredentials | null> {
    const dir = this.dirFor(rfc);
    try {
      const [certPem, keyPem] = await Promise.all([
        fs.readFile(path.join(dir, CERT_FILE), "utf8"),
        fs.readFile(path.join(dir, KEY_FILE), "utf8"),
      ]);
      return { rfc, certPem, keyPem };
    } catch {
      return null;
    }
  }

  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => /^[A-ZÑ&0-9]{12,13}$/.test(name))
        .sort();
    } catch {
      return [];
    }
  }

  async remove(rfc: string): Promise<void> {
    await fs.rm(this.dirFor(rfc), { recursive: true, force: true });
  }
}

function defaultBaseDir(): string {
  return path.join(os.homedir(), ".fintecia", "fiel");
}
