import {
  parseCfdiXml,
  validatePeriod,
  validateDownloadArgs,
} from "../../src/sat/parse.js";

const UUID = "6128396f-c09b-4ec6-8697-43d6e6ec1e51";

const XML = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-01-15T12:34:56" SubTotal="862.07" Moneda="MXN" Total="1000.00" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR SA"/>
  <cfdi:Receptor Rfc="BBB010101BBB" Nombre="RECEPTOR SA"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${UUID}" FechaTimbrado="2026-01-15T12:35:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe("parseCfdiXml", () => {
  test("extracts uuid, emisor, receptor, total, fecha and tipo", () => {
    const c = parseCfdiXml(XML, "emitido");
    expect(c.uuid).toBe(UUID);
    expect(c.emisorRfc).toBe("AAA010101AAA");
    expect(c.receptorRfc).toBe("BBB010101BBB");
    expect(c.total).toBe(1000);
    expect(c.fecha).toBe("2026-01-15T12:34:56");
    expect(c.tipo).toBe("emitido");
    expect(c.xml).toBe(XML);
  });

  test("lowercases the uuid", () => {
    const xml = XML.replace(UUID, UUID.toUpperCase());
    expect(parseCfdiXml(xml, "recibido").uuid).toBe(UUID);
  });

  test("throws when the timbre has no uuid", () => {
    const xml = XML.replace(`UUID="${UUID}"`, `UUID=""`);
    expect(() => parseCfdiXml(xml, "emitido")).toThrow(/UUID/);
  });

  test("throws without emisor Rfc", () => {
    const xml = XML.replace(`<cfdi:Emisor Rfc="AAA010101AAA"`, `<cfdi:Emisor Nombre="X"`);
    expect(() => parseCfdiXml(xml, "emitido")).toThrow(/emisor/);
  });

  test("throws without receptor Rfc", () => {
    const xml = XML.replace(`<cfdi:Receptor Rfc="BBB010101BBB"`, `<cfdi:Receptor Nombre="Y"`);
    expect(() => parseCfdiXml(xml, "emitido")).toThrow(/receptor/);
  });

  test("throws without a valid total", () => {
    const xml = XML.replace(`Total="1000.00"`, `Total=""`);
    expect(() => parseCfdiXml(xml, "emitido")).toThrow(/total/);
  });

  test("throws without fecha", () => {
    const xml = XML.replace(`Fecha="2026-01-15T12:34:56"`, `Fecha=""`);
    expect(() => parseCfdiXml(xml, "emitido")).toThrow(/fecha/);
  });
});

describe("validatePeriod", () => {
  test("accepts a valid YYYY-MM-DD range", () => {
    expect(validatePeriod("2026-01-01", "2026-01-31")).toEqual({
      desde: "2026-01-01",
      hasta: "2026-01-31",
    });
  });

  test("accepts desde == hasta", () => {
    expect(validatePeriod("2026-01-15", "2026-01-15")).toEqual({
      desde: "2026-01-15",
      hasta: "2026-01-15",
    });
  });

  test("rejects malformed dates", () => {
    expect(() => validatePeriod("01/01/2026", "2026-01-31")).toThrow(/YYYY-MM-DD/);
    expect(() => validatePeriod("2026-1-1", "2026-01-31")).toThrow(/YYYY-MM-DD/);
  });

  test("rejects impossible dates (rollover)", () => {
    expect(() => validatePeriod("2026-02-30", "2026-03-01")).toThrow(/fecha/);
    expect(() => validatePeriod("2026-13-01", "2026-03-01")).toThrow(/fecha/);
  });

  test("rejects desde > hasta", () => {
    expect(() => validatePeriod("2026-02-01", "2026-01-31")).toThrow(/anterior/);
  });
});

describe("validateDownloadArgs", () => {
  test("normalizes tipo/desde/hasta/rfc", () => {
    const a = validateDownloadArgs({
      tipo: "emitidos",
      desde: "2026-01-01",
      hasta: "2026-01-31",
      rfc: " aaa010101aaa ",
    });
    expect(a).toEqual({
      tipo: "emitidos",
      desde: "2026-01-01",
      hasta: "2026-01-31",
      rfc: "AAA010101AAA",
    });
  });

  test("accepts ambos", () => {
    const a = validateDownloadArgs({
      tipo: "ambos",
      desde: "2026-01-01",
      hasta: "2026-01-31",
      rfc: "AAA010101AAA",
    });
    expect(a.tipo).toBe("ambos");
  });

  test("rejects invalid tipo", () => {
    expect(() =>
      validateDownloadArgs({
        tipo: "nope",
        desde: "2026-01-01",
        hasta: "2026-01-31",
        rfc: "AAA010101AAA",
      }),
    ).toThrow(/tipo/);
  });

  test("rejects invalid rfc", () => {
    expect(() =>
      validateDownloadArgs({
        tipo: "emitidos",
        desde: "2026-01-01",
        hasta: "2026-01-31",
        rfc: "123",
      }),
    ).toThrow(/RFC/);
  });
});
