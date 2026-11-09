import { FileFielStore } from "../src/fiel/store.js";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CER = readFileSync(
  path.resolve(process.cwd(), "test/fixtures/fiel.cer"),
  "utf8",
);
const KEY = readFileSync(
  path.resolve(process.cwd(), "test/fixtures/fiel.key"),
  "utf8",
);

describe("FileFielStore (multi-taxpayer)", () => {
  let dir: string;
  let store: FileFielStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "fiel-store-"));
    store = new FileFielStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("round-trips a FIEL keyed by RFC", async () => {
    await store.store({ rfc: "ABC831011XYZ", certPem: CER, keyPem: KEY });

    const loaded = await store.load("ABC831011XYZ");
    expect(loaded).not.toBeNull();
    expect(loaded!.certPem).toBe(CER);
    expect(loaded!.keyPem).toBe(KEY);
  });

  test("lists multiple taxpayers", async () => {
    await store.store({ rfc: "AAA010101AAA", certPem: CER, keyPem: KEY });
    await store.store({ rfc: "XYZ010101000", certPem: CER, keyPem: KEY });
    expect(await store.list()).toEqual(["AAA010101AAA", "XYZ010101000"]);
  });

  test("remove deletes a taxpayer", async () => {
    await store.store({ rfc: "AAA010101AAA", certPem: CER, keyPem: KEY });
    await store.remove("AAA010101AAA");
    expect(await store.load("AAA010101AAA")).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  test("rejects invalid RFC (path traversal guard)", async () => {
    await expect(
      store.store({ rfc: "../../etc", certPem: CER, keyPem: KEY }),
    ).rejects.toThrow(/invalid RFC/);
  });

  test("writes the private key owner-only (0600)", async () => {
    await store.store({ rfc: "ABC831011XYZ", certPem: CER, keyPem: KEY });
    const { stat } = await import("node:fs/promises");
    const keyPath = path.join(dir, "ABC831011XYZ", "private.key");
    const mode = (await stat(keyPath)).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
