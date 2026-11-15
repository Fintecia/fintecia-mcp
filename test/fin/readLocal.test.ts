import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import type { CfdiIndexEntry } from "../../src/fin/cfdiIndex.js";
import {
  matchesQuery,
  readCfdiXml,
  searchEntries,
} from "../../src/fin/readLocal.js";

const FIXTURES = path.resolve("test/fixtures");

function entry(overrides: Partial<CfdiIndexEntry> = {}): CfdiIndexEntry {
  return {
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
    ...overrides,
  };
}

describe("matchesQuery", () => {
  test("is case-insensitive and trims", () => {
    expect(matchesQuery(entry(), "  emisor test  ")).toBe(true);
  });

  test("matches each of the five metadata fields", () => {
    expect(matchesQuery(entry(), "EMISOR TEST")).toBe(true); // emisorNombre
    expect(matchesQuery(entry(), "receptor test")).toBe(true); // receptorNombre
    expect(matchesQuery(entry(), "12345")).toBe(true); // folio
    expect(matchesQuery(entry(), "6128396f")).toBe(true); // uuid (partial)
    expect(matchesQuery(entry({ serie: "A", folio: null }), "A")).toBe(true); // serie
  });

  test("does not match non-metadata fields (RFCs/total)", () => {
    expect(matchesQuery(entry(), "XAXX010101000")).toBe(false); // emisorRfc not a search field
    expect(matchesQuery(entry(), "2171.2")).toBe(false); // total not a search field
  });

  test("empty query matches everything", () => {
    expect(matchesQuery(entry(), "")).toBe(true);
    expect(matchesQuery(entry(), "   ")).toBe(true);
  });
});

describe("searchEntries", () => {
  const entries = [
    entry(),
    entry({
      uuid: "33333333-3333-3333-3333-333333333333",
      emisorNombre: "EMPLEADOR SA DE CV",
      receptorNombre: "EMPLEADO PEREZ",
      serie: "N",
      folio: "1",
    }),
    entry({
      uuid: "44444444-4444-4444-4444-444444444444",
      emisorNombre: "RECEPTOR TEST SA DE CV",
      receptorNombre: "EMISOR TEST SA DE CV",
      serie: "P",
      folio: "1",
    }),
  ];

  test("filters by metadata", () => {
    expect(searchEntries(entries, "EMPLEADOR")).toHaveLength(1);
    // "TEST SA DE CV" appears in ingreso (emisor+receptor) and pago, not nomina.
    expect(searchEntries(entries, "TEST SA DE CV")).toHaveLength(2);
    expect(searchEntries(entries, "PEREZ")).toHaveLength(1);
  });

  test("returns all when query is empty", () => {
    expect(searchEntries(entries, "")).toHaveLength(3);
  });

  test("applies limit", () => {
    expect(searchEntries(entries, "TEST SA DE CV", 2)).toHaveLength(2);
  });
});

describe("readCfdiXml", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "fintecia-read-local-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("returns the raw XML from the source zip", async () => {
    const xml = await fs.readFile(path.join(FIXTURES, "cfdi-ingreso-40.xml"), "utf8");
    const zipDir = path.join(dir, "AAA010101AAA_2026-01-01_2026-01-31", "emitidos");
    await fs.mkdir(zipDir, { recursive: true });
    const zip = new JSZip();
    zip.file("cfdi-1.xml", xml);
    await fs.writeFile(
      path.join(zipDir, "000.zip"),
      await zip.generateAsync({ type: "nodebuffer" }),
    );

    const result = await readCfdiXml(dir, entry());
    expect(result).toBe(xml);
  });

  test("throws when the entry name is missing from the zip", async () => {
    const zipDir = path.join(dir, "AAA010101AAA_2026-01-01_2026-01-31", "emitidos");
    await fs.mkdir(zipDir, { recursive: true });
    const zip = new JSZip();
    zip.file("other.xml", "<a/>");
    await fs.writeFile(
      path.join(zipDir, "000.zip"),
      await zip.generateAsync({ type: "nodebuffer" }),
    );

    await expect(readCfdiXml(dir, entry())).rejects.toThrow(/no encontrado/);
  });
});
