import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FileDownloadArtifactStore,
  buildRequestKey,
} from "../../src/sat/artifacts.js";

let dir: string;
let store: FileDownloadArtifactStore;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fintecia-artifacts-"));
  store = new FileDownloadArtifactStore(dir);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("buildRequestKey", () => {
  test("combines rfc and period into a deterministic key", () => {
    expect(buildRequestKey("AAA010101AAA", "2026-01-01", "2026-01-31")).toBe(
      "AAA010101AAA_2026-01-01_2026-01-31",
    );
  });
});

describe("FileDownloadArtifactStore", () => {
  test("save + load round-trips base64 packages in order", async () => {
    const key = buildRequestKey("AAA010101AAA", "2026-01-01", "2026-01-31");
    await store.save(key, "emitidos", 0, "UEsDBAoAAAAA");
    await store.save(key, "emitidos", 1, "UEsDBAoAAAAB");
    expect(await store.has(key, "emitidos")).toBe(true);
    expect(await store.load(key, "emitidos")).toEqual(["UEsDBAoAAAAA", "UEsDBAoAAAAB"]);
  });

  test("has returns false when nothing persisted", async () => {
    expect(await store.has("X_2026-01-01_2026-01-31", "emitidos")).toBe(false);
  });

  test("load returns [] when nothing persisted", async () => {
    expect(await store.load("X_2026-01-01_2026-01-31", "emitidos")).toEqual([]);
  });

  test("remove deletes the whole request dir", async () => {
    const key = buildRequestKey("AAA010101AAA", "2026-01-01", "2026-01-31");
    await store.save(key, "emitidos", 0, "UEsDBAoAAAAA");
    await store.remove(key);
    expect(await store.has(key, "emitidos")).toBe(false);
  });

  test("rejects a path-traversal request key", async () => {
    await expect(store.save("../etc", "emitidos", 0, "UEsDBAoAAAAA")).rejects.toThrow(
      /invalid/,
    );
  });

  test("written files are owner-only (0600)", async () => {
    const key = buildRequestKey("AAA010101AAA", "2026-01-01", "2026-01-31");
    const file = await store.save(key, "emitidos", 0, "UEsDBAoAAAAA");
    const stat = await fs.stat(file);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
