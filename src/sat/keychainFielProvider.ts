import type { FielProvider, FielMaterial } from "./fielProvider.js";
import type { FielStore } from "../fiel/store.js";
import { type Keychain, fielKeychainKey } from "../keychain/keychain.js";

/**
 * Keychain-backed FielProvider: loads the .cer + .key from the FielStore and
 * the password from the OS keychain. Returns null when the FIEL or the
 * password is missing (the download then surfaces a clear "re-run onboarding"
 * error rather than guessing).
 */
export class KeychainFielProvider implements FielProvider {
  constructor(
    private readonly fielStore: FielStore,
    private readonly keychain: Keychain,
  ) {}

  async load(rfc: string): Promise<FielMaterial | null> {
    const rfcUpper = rfc.toUpperCase();
    const creds = await this.fielStore.load(rfcUpper);
    if (!creds) return null;

    const password = await this.keychain.get(fielKeychainKey(rfcUpper));
    if (password === null) return null;

    return { cer: creds.certPem, key: creds.keyPem, password };
  }
}

/** Persist the FIEL password into the keychain (called during onboarding). */
export async function saveFielPassword(
  keychain: Keychain,
  rfc: string,
  password: string,
): Promise<void> {
  await keychain.set(fielKeychainKey(rfc), password);
}
