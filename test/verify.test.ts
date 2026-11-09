import {
  buildExpresionImpresa,
  buildConsultaEnvelope,
  parseConsultaResponse,
} from "../src/public/verify.js";

describe("cfdi_verify (ConsultaCFDIService)", () => {
  test("buildExpresionImpresa encodes the QR fields", () => {
    const e = buildExpresionImpresa({
      emisorRfc: "XIA190128J61",
      receptorRfc: "EKU9003173C9",
      total: 1160.0,
      uuid: "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
    });
    expect(e).toContain("re=XIA190128J61");
    expect(e).toContain("rr=EKU9003173C9");
    expect(e).toContain("tt=1160");
    expect(e).toContain("id=XXXXXXXX");
  });

  test("buildConsultaEnvelope escapes and wraps the expresion", () => {
    const env = buildConsultaEnvelope("?re=X&rr=Y");
    expect(env).toContain("<Consulta");
    expect(env).toContain("&amp;");
  });

  test("parseConsultaResponse extracts estado + EFOS", () => {
    const xml =
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body><ConsultaResponse xmlns="http://tempuri.org/"><ConsultaResult>` +
      `<CodigoEstatus>S - Comprobante obtenido satisfactoriamente</CodigoEstatus>` +
      `<Estado>Vigente</Estado><EsCancelable>Cancelable sin aceptación</EsCancelable>` +
      `<EstatusCancelacion></EstatusCancelacion><ValidacionEFOS>200</ValidacionEFOS>` +
      `</ConsultaResult></ConsultaResponse></soap:Body></soap:Envelope>`;
    const r = parseConsultaResponse(xml);
    expect(r.estado).toBe("Vigente");
    expect(r.validacionEfos).toBe("200");
    expect(r.codigoEstatus).toContain("S -");
  });

  test("parseConsultaResponse returns Error on unknown", () => {
    expect(parseConsultaResponse("<x/>").estado).toBe("Error");
  });
});
