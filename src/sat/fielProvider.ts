/**
 * FIEL material provider (T2).
 *
 * The FIEL password is NEVER persisted — it is re-entered per signing session.
 * `load(rfc)` returns the `.cer` + `.key` (password-encrypted PEM) plus the
 * password supplied for this session. The key/password must never be logged
 * nor leave the machine.
 *
 * T1b wires the OS keychain / onboarding behind this same port; T2 ships only
 * the interface + a minimal in-memory implementation so the download flow is
 * fully typed and testable.
 */

export interface FielMaterial {
  /** .cer content (public). */
  cer: string;
  /** .key content (private, password-encrypted PEM). */
  key: string;
  /** Password to decrypt the .key (re-entered per session, never persisted). */
  password: string;
}

export interface FielProvider {
  load(rfc: string): Promise<FielMaterial | null>;
}

export class InMemoryFielProvider implements FielProvider {
  private readonly entries = new Map<string, FielMaterial>();

  set(rfc: string, material: FielMaterial): void {
    this.entries.set(rfc.toUpperCase(), material);
  }

  async load(rfc: string): Promise<FielMaterial | null> {
    return this.entries.get(rfc.toUpperCase()) ?? null;
  }
}
