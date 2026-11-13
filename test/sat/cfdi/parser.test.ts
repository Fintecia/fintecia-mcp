import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCfdiXml } from "../../../src/sat/cfdi/parser.js";

const FIXTURES = path.resolve("test/fixtures");

function load(base: string): { xml: string; golden: unknown } {
  const xml = readFileSync(path.join(FIXTURES, `${base}.xml`), "utf8");
  const golden = JSON.parse(readFileSync(path.join(FIXTURES, `${base}.golden.json`), "utf8"));
  return { xml, golden };
}

/**
 * A1 — byte-equivalence invariant. The MCP parser must produce the exact same
 * `CfdiData` as the backend `parseCfdiXml` (functions/src/cfdi/cfdiParser.ts)
 * for the same XML, so `cfdiToEntry` derives identical journal entries.
 * The `.golden.json` files were derived by running the BACKEND parser over the
 * same fixture XML (see `derive-golden.cjs` in the parent task notes).
 */
describe("parseCfdiXml byte-equivalence (A1)", () => {
  for (const base of ["cfdi-ingreso-40", "cfdi-nomina-40", "cfdi-pago-40"]) {
    it(`matches the backend golden for ${base}`, () => {
      const { xml, golden } = load(base);
      expect(parseCfdiXml(xml)).toEqual(golden);
    });

    it(`is byte-stable (JSON.stringify) for ${base}`, () => {
      const { xml, golden } = load(base);
      expect(JSON.stringify(parseCfdiXml(xml))).toBe(JSON.stringify(golden));
    });
  }

  it("throws on missing Comprobante element", () => {
    expect(() => parseCfdiXml(`<?xml version="1.0"?><Root></Root>`)).toThrow(
      "Invalid CFDI XML: missing Comprobante element",
    );
  });

  it("throws on missing TimbreFiscalDigital", () => {
    const xml = `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2024-01-15T10:30:00" SubTotal="0" Total="0" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="XAXX010101000" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="AAA010101AAA"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="H87" Descripcion="Test" ValorUnitario="0" Importe="0"/>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;
    expect(() => parseCfdiXml(xml)).toThrow(
      "Invalid CFDI XML: missing TimbreFiscalDigital",
    );
  });
});
