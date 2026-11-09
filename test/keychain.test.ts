import {
  detectKeychain,
  fielKeychainKey,
  type Keychain,
} from "../src/keychain/keychain.js";
import { KeychainFielProvider } from "../src/sat/keychainFielProvider.js";
import type { FielStore, FielCredentials } from "../src/fiel/store.js";

const noopKeychain: Keychain = {
  set: async () => {},
  get: async () => null,
  delete: async () => {},
};

function mockStore(load: () => Promise<FielCredentials | null>): FielStore {
  return {
    load,
    store: async () => {},
    list: async () => [],
    remove: async () => {},
  };
}

describe("keychain", () => {
  test("fielKeychainKey is rfc-scoped and uppercased", () => {
    expect(fielKeychainKey("abc")).toBe("fiel:ABC");
  });

  test("detectKeychain returns an adapter for every platform", () => {
    for (const p of ["darwin", "win32", "linux", "freebsd"] as NodeJS.Platform[]) {
      const k = detectKeychain(p);
      expect(typeof k.get).toBe("function");
      expect(typeof k.set).toBe("function");
      expect(typeof k.delete).toBe("function");
    }
  });

  test("KeychainFielProvider loads material when the password is present", async () => {
    const provider = new KeychainFielProvider(
      mockStore(async () => ({ rfc: "ABC", certPem: "CER", keyPem: "KEY" })),
      { ...noopKeychain, get: async () => "secret" },
    );
    expect(await provider.load("abc")).toEqual({
      cer: "CER",
      key: "KEY",
      password: "secret",
    });
  });

  test("KeychainFielProvider returns null when the password is missing", async () => {
    const provider = new KeychainFielProvider(
      mockStore(async () => ({ rfc: "ABC", certPem: "CER", keyPem: "KEY" })),
      noopKeychain,
    );
    expect(await provider.load("abc")).toBeNull();
  });

  test("KeychainFielProvider returns null when the FIEL is not stored", async () => {
    const provider = new KeychainFielProvider(
      mockStore(async () => null),
      { ...noopKeychain, get: async () => "x" },
    );
    expect(await provider.load("abc")).toBeNull();
  });
});
