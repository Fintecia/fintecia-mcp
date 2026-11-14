import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCfdiXml } from "../../../src/sat/cfdi/parser.js";
import {
  S3_FIELDS,
  assertSealPresent,
  toExtractoContable,
} from "../../../src/sat/cfdi/extract.js";

const FIXTURES = path.resolve("test/fixtures");

function loadExtractGolden(base: string): unknown {
  return JSON.parse(
    readFileSync(path.join(FIXTURES, `${base}.extract.golden.json`), "utf8"),
  );
}

/**
 * S3 — the extract is the exact accounting subset of `CfdiData`. Metadata
 * (serie/folio/nombres/lugarExpedicion/exportacion/domicilio) and signature
 * fields (selloCFD/selloSAT/noCertificadoSAT/rfcProvCertif/fechaTimbrado) are
 * NOT part of the extract. The verification tuple (S5: uuid + emisorRfc +
 * receptorRfc + total) is preserved because those fields are in the subset.
 */
describe("toExtractoContable (S3 subset)", () => {
  it("exposes exactly the S3 field list, in spec order", () => {
    expect(S3_FIELDS).toEqual([
      "tipoDeComprobante",
      "fecha",
      "emisorRfc",
      "emisorRegimenFiscal",
      "receptorRfc",
      "receptorRegimenFiscalReceptor",
      "receptorUsoCFDI",
      "subtotal",
      "descuento",
      "total",
      "moneda",
      "tipoCambio",
      "metodoPago",
      "formaPago",
      "totalImpuestosTrasladados",
      "totalImpuestosRetenidos",
      "trasladados",
      "retenciones",
      "conceptos",
      "pagosComplemento",
      "nomina",
      "cfdiRelacionados",
      "uuid",
    ]);
  });

  for (const base of ["cfdi-ingreso-40", "cfdi-nomina-40", "cfdi-pago-40"]) {
    it(`matches the backend extract golden for ${base}`, () => {
      const xml = readFileSync(path.join(FIXTURES, `${base}.xml`), "utf8");
      const extract = toExtractoContable(parseCfdiXml(xml));
      expect(extract).toEqual(loadExtractGolden(base));
      // The extract object carries EXACTLY the S3 keys, in spec order.
      expect(Object.keys(extract)).toEqual(S3_FIELDS);
    });
  }

  it("never leaks signature fields into the extract", () => {
    const xml = readFileSync(path.join(FIXTURES, "cfdi-ingreso-40.xml"), "utf8");
    const extract = toExtractoContable(parseCfdiXml(xml)) as unknown as Record<string, unknown>;
    for (const forbidden of [
      "selloCFD",
      "selloSAT",
      "noCertificadoSAT",
      "rfcProvCertif",
      "fechaTimbrado",
      "serie",
      "folio",
      "emisorNombre",
      "receptorNombre",
      "lugarExpedicion",
      "exportacion",
      "receptorDomicilioFiscalReceptor",
    ]) {
      expect(extract).not.toHaveProperty(forbidden);
    }
  });
});

describe("assertSealPresent (S7)", () => {
  it("accepts a CFDI with selloSAT + noCertificadoSAT", () => {
    const xml = readFileSync(path.join(FIXTURES, "cfdi-ingreso-40.xml"), "utf8");
    expect(() => assertSealPresent(parseCfdiXml(xml))).not.toThrow();
  });

  it("rejects a CFDI with an absent selloSAT", () => {
    const xml = readFileSync(path.join(FIXTURES, "cfdi-ingreso-40.xml"), "utf8")
      .replace('SelloSAT="c2VsbG8tc2F0"', "")
      .replace('SelloCFD="c2VsbG8tY2Zk" ', "");
    expect(() => assertSealPresent(parseCfdiXml(xml))).toThrow(/selloSAT/);
  });

  it("rejects a CFDI with an absent noCertificadoSAT", () => {
    const xml = readFileSync(path.join(FIXTURES, "cfdi-ingreso-40.xml"), "utf8")
      .replace('NoCertificadoSAT="00001000000508664968" ', "");
    expect(() => assertSealPresent(parseCfdiXml(xml))).toThrow(/selloSAT/);
  });
});
