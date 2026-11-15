import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { parseCfdiXml } from "../../src/sat/cfdi/parser.js";
import {
  CfdiIndexStore,
  buildIndex,
  listDownloadedZips,
  toIndexEntry,
} from "../../src/fin/cfdiIndex.js";

const FIXTURES = path.resolve("test/fixtures");

async function zipOf(entries: Array<{ name: string; xml: string }>): Promise<Buffer> {
  const zip = new JSZip();
  for (const e of entries) zip.file(e.name, e.xml);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function readFixture(base: string): Promise<string> {
  return fs.readFile(path.join(FIXTURES, `${base}.xml`), "utf8");
}

// Three fixtures with distinct metadata:
//   ingreso: EMISOR TEST SA DE CV / RECEPTOR TEST SA DE CV, serie A, folio 12345
//   nomina:  EMPLEADOR SA DE CV / EMPLEADO PEREZ,        serie N, folio 1
//   pago:    RECEPTOR TEST SA DE CV / EMISOR TEST SA DE CV, serie P, folio 1
async function seed(downloadsDir: string): Promise<void> {
  const dir = path.join(
    downloadsDir,
    "AAA010101AAA_2026-01-01_2026-01-31",
    "emitidos",
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "000.zip"),
    await zipOf([
      { name: "cfdi-1.xml", xml: await readFixture("cfdi-ingreso-40") },
      { name: "cfdi-2.xml", xml: await readFixture("cfdi-nomina-40") },
    ]),
  );
  await fs.writeFile(
    path.join(dir, "001.zip"),
    await zipOf([{ name: "cfdi-3.xml", xml: await readFixture("cfdi-pago-40") }]),
  );
}

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fintecia-cfdi-index-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("listDownloadedZips", () => {
  test("enumerates <requestKey>/<tipo>/<NNN>.zip in stable order", async () => {
    await seed(dir);
    const zips = await listDownloadedZips(dir);
    expect(zips.map((z) => `${z.requestKey}/${z.tipo}/${z.zipFile}`)).toEqual([
      "AAA010101AAA_2026-01-01_2026-01-31/emitidos/000.zip",
      "AAA010101AAA_2026-01-01_2026-01-31/emitidos/001.zip",
    ]);
  });

  test("returns [] when the directory does not exist", async () => {
    expect(await listDownloadedZips(path.join(dir, "missing"))).toEqual([]);
  });

  test("ignores non-zip files and path-traversal segments", async () => {
    const base = path.join(dir, "AAA010101AAA_2026-01-01_2026-01-31", "emitidos");
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(path.join(base, "000.zip"), await zipOf([]));
    await fs.writeFile(path.join(base, "notes.txt"), "ignore me");
    // A sibling segment that would traverse if not validated.
    await fs.mkdir(path.join(dir, "..evil"), { recursive: true });
    const zips = await listDownloadedZips(dir);
    expect(zips.map((z) => z.zipFile)).toEqual(["000.zip"]);
  });
});

describe("toIndexEntry", () => {
  test("maps metadata + provenance (S4 subset)", async () => {
    const cfdi = parseCfdiXml(await readFixture("cfdi-ingreso-40"));
    const entry = toIndexEntry(cfdi, {
      tipo: "emitidos",
      requestKey: "AAA010101AAA_2026-01-01_2026-01-31",
      zipFile: "000.zip",
      entryName: "cfdi-1.xml",
    });
    expect(entry).toEqual({
      uuid: "6128396f-c09b-4ec6-8697-43d6e6ec1e51",
      emisorNombre: "EMISOR TEST SA DE CV",
      receptorNombre: "RECEPTOR TEST SA DE CV",
      emisorRfc: "XAXX010101000",
      receptorRfc: "AAA010101AAA",
      serie: "A",
      folio: "12345",
      fecha: "2024-01-15T10:30:00",
      total: 2171.2,
      tipoDeComprobante: "I",
      tipo: "emitidos",
      requestKey: "AAA010101AAA_2026-01-01_2026-01-31",
      zipFile: "000.zip",
      entryName: "cfdi-1.xml",
    });
  });
});

describe("buildIndex", () => {
  test("extracts metadata from every CFDI across zips", async () => {
    await seed(dir);
    const entries = await buildIndex(dir);
    expect(entries).toHaveLength(3);
    const byUuid = new Map(entries.map((e) => [e.uuid, e]));
    expect(byUuid.get("6128396f-c09b-4ec6-8697-43d6e6ec1e51")?.serie).toBe("A");
    expect(byUuid.get("33333333-3333-3333-3333-333333333333")?.emisorNombre).toBe(
      "EMPLEADOR SA DE CV",
    );
    expect(byUuid.get("44444444-4444-4444-4444-444444444444")?.tipoDeComprobante).toBe("P");
  });

  test("skips unparseable XML entries without crashing", async () => {
    const dir2 = path.join(dir, "AAA010101AAA_2026-01-01_2026-01-31", "emitidos");
    await fs.mkdir(dir2, { recursive: true });
    await fs.writeFile(
      path.join(dir2, "000.zip"),
      await zipOf([
        { name: "ok.xml", xml: await readFixture("cfdi-ingreso-40") },
        { name: "bad.xml", xml: "<Root></Root>" },
      ]),
    );
    const entries = await buildIndex(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0].entryName).toBe("ok.xml");
  });

  test("skips a corrupt zip without crashing", async () => {
    const dir2 = path.join(dir, "AAA010101AAA_2026-01-01_2026-01-31", "emitidos");
    await fs.mkdir(dir2, { recursive: true });
    await fs.writeFile(path.join(dir2, "000.zip"), Buffer.from("not a zip"));
    expect(await buildIndex(dir)).toEqual([]);
  });
});

describe("CfdiIndexStore", () => {
  function indexFile(): string {
    // Inside the temp downloads dir (unique per test, cleaned by afterEach).
    // A plain file at the root is ignored by the zip scanner (only dirs descend).
    return path.join(dir, "index.json");
  }

  test("builds and persists the index on first read", async () => {
    await seed(dir);
    const store = new CfdiIndexStore({ downloadsDir: dir, indexFile: indexFile() });
    const entries = await store.entries();
    expect(entries).toHaveLength(3);
    const cached = JSON.parse(await fs.readFile(indexFile(), "utf8"));
    expect(cached.entries).toHaveLength(3);
    expect(typeof cached.fingerprint).toBe("string");
  });

  test("serves the cached index (no re-scan) when zips are unchanged", async () => {
    await seed(dir);
    const file = indexFile();
    const store = new CfdiIndexStore({ downloadsDir: dir, indexFile: file });
    await store.entries();

    // Rewrite the cache with a fake entry, keeping the fingerprint. If
    // entries() re-scanned the zips it would return 3 real entries; returning
    // the fake proves it hit the cache.
    const cached = JSON.parse(await fs.readFile(file, "utf8"));
    const fake = { ...cached.entries[0], uuid: "fake-uuid-0000-0000-000000000000" };
    await fs.writeFile(file, JSON.stringify({ fingerprint: cached.fingerprint, entries: [fake] }));

    const entries = await store.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0].uuid).toBe("fake-uuid-0000-0000-000000000000");
  });

  test("rebuilds when a new zip appears", async () => {
    await seed(dir);
    const store = new CfdiIndexStore({ downloadsDir: dir, indexFile: indexFile() });
    await store.entries(); // 3

    const dir2 = path.join(dir, "BBB010101BBB_2026-01-01_2026-01-31", "recibidos");
    await fs.mkdir(dir2, { recursive: true });
    await fs.writeFile(
      path.join(dir2, "000.zip"),
      await zipOf([{ name: "cfdi-4.xml", xml: await readFixture("cfdi-nomina-40") }]),
    );

    expect(await store.entries()).toHaveLength(4);
  });

  test("rebuild() re-scans and ignores a stale cache", async () => {
    await seed(dir);
    const file = indexFile();
    const store = new CfdiIndexStore({ downloadsDir: dir, indexFile: file });
    await store.entries();

    // Corrupt the cache file; rebuild() must re-scan rather than fail.
    await fs.writeFile(file, "not json");
    expect(await store.rebuild()).toHaveLength(3);
  });
});
