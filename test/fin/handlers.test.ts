import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { createHandlers, resolveFinancialsPeriodKey } from "../../src/handlers.js";
import { TOOLS } from "../../src/tools.js";

// handlers.ts imports `./fiel/fiel.js` (for cfdi_download's razonSocial),
// which is the only top-level nodecfdi (ESM-only) import in the handler graph.
// Stub it so jest never pulls nodecfdi — read-local doesn't need it.
jest.mock("../../src/fiel/fiel.js", () => ({
  extractRazonSocial: () => null,
}));

const FIXTURES = path.resolve("test/fixtures");

function text(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

async function seedDownloads(): Promise<{ dir: string; indexFile: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fintecia-handlers-"));
  const indexFile = path.join(dir, "index.json");
  const zipDir = path.join(dir, "AAA010101AAA_2026-01-01_2026-01-31", "emitidos");
  await fs.mkdir(zipDir, { recursive: true });
  const xml = await fs.readFile(path.join(FIXTURES, "cfdi-ingreso-40.xml"), "utf8");
  const zip = new JSZip();
  zip.file("cfdi-1.xml", xml);
  await fs.writeFile(
    path.join(zipDir, "000.zip"),
    await zip.generateAsync({ type: "nodebuffer" }),
  );
  return { dir, indexFile };
}

describe("read-local handler wiring (S4)", () => {
  let dir: string;
  let indexFile: string;
  beforeEach(async () => {
    ({ dir, indexFile } = await seedDownloads());
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("tools are registered read-only", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain("cfdi_local_search");
    expect(names).toContain("cfdi_local_detail");
    const defs = TOOLS.filter((t) =>
      ["cfdi_local_search", "cfdi_local_detail"].includes(t.name),
    );
    for (const d of defs) {
      expect(d.annotations.destructiveHint).toBeUndefined();
      expect(d.annotations.readOnlyHint).toBe(true);
    }
  });

  test("cfdi_local_search lists metadata from local zips (no backend)", async () => {
    const handlers = createHandlers({ cfdiLocalDir: dir, cfdiIndexFile: indexFile });
    const result = JSON.parse(text(await handlers.get("cfdi_local_search")!({})));
    expect(result.count).toBe(1);
    expect(result.cfdis[0].emisorNombre).toBe("EMISOR TEST SA DE CV");
    expect(result.cfdis[0].uuid).toBe("6128396f-c09b-4ec6-8697-43d6e6ec1e51");
  });

  test("cfdi_local_search filters by metadata query", async () => {
    const handlers = createHandlers({ cfdiLocalDir: dir, cfdiIndexFile: indexFile });
    const hit = JSON.parse(text(await handlers.get("cfdi_local_search")!({ query: "EMISOR TEST" })));
    const miss = JSON.parse(text(await handlers.get("cfdi_local_search")!({ query: "NO EXISTE" })));
    expect(hit.count).toBe(1);
    expect(miss.count).toBe(0);
  });

  test("cfdi_local_detail returns the raw XML", async () => {
    const handlers = createHandlers({ cfdiLocalDir: dir, cfdiIndexFile: indexFile });
    const xml = text(
      await handlers.get("cfdi_local_detail")!({
        uuid: "6128396f-c09b-4ec6-8697-43d6e6ec1e51",
      }),
    );
    expect(xml).toContain("cfdi:Comprobante");
    expect(xml).toContain("EMISOR TEST SA DE CV");
  });

  test("cfdi_local_detail throws for an unknown uuid", async () => {
    const handlers = createHandlers({ cfdiLocalDir: dir, cfdiIndexFile: indexFile });
    await expect(
      handlers.get("cfdi_local_detail")!({ uuid: "missing-uuid" }),
    ).rejects.toThrow(/no encontrado/);
  });
});

describe("resolveFinancialsPeriodKey (#195)", () => {
  test("periodKey explícito (año) tiene precedencia sobre hasta", () => {
    expect(resolveFinancialsPeriodKey({ periodKey: "2025", hasta: "2026-01-01" })).toBe("2025");
  });

  test("periodKey trimestre pasa tal cual", () => {
    expect(resolveFinancialsPeriodKey({ periodKey: "2025-Q4" })).toBe("2025-Q4");
  });

  test("periodKey mes pasa tal cual", () => {
    expect(resolveFinancialsPeriodKey({ periodKey: "2025-11" })).toBe("2025-11");
  });

  test("sin periodKey, hasta se trunca a mes (compat)", () => {
    expect(resolveFinancialsPeriodKey({ hasta: "2025-01-15" })).toBe("2025-01");
  });

  test("sin nada → undefined (default del backend)", () => {
    expect(resolveFinancialsPeriodKey({})).toBeUndefined();
  });
});
