/**
 * SAT ConsultaCFDIService — verifies a CFDI's status (vigente/cancelado/no
 * encontrado) plus whether the emitter is on the 69-B/EFOS list
 * (ValidacionEFOS). Public SOAP service, no auth, no FIEL.
 *
 * The QR on a CFDI encodes the 4 fields (emisor RFC, receptor RFC, total,
 * UUID) as `?re=..&rr=..&tt=..&id=..` — the "expresión impresa".
 */

const SERVICE_URL = "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc";
const SOAP_ACTION = "http://tempuri.org/IConsultaCFDIService/Consulta";

export interface ConsultaInput {
  uuid?: string;
  emisorRfc?: string;
  receptorRfc?: string;
  total?: number;
  xmlBase64?: string;
}

export interface ConsultaResult {
  estado: string; // "Vigente" | "Cancelado" | "No Encontrado" | "Error"
  codigoEstatus: string; // "S - ..." | "N - 601" | "N - 602"
  esCancelable?: string;
  estatusCancelacion?: string;
  validacionEfos?: string; // "200" = not on EFOS; "100".."104" = on EFOS
}

/** Build the QR "expresión impresa" from the 4 fields. */
export function buildExpresionImpresa(i: {
  emisorRfc: string;
  receptorRfc: string;
  total: number;
  uuid: string;
}): string {
  const tt = i.total.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return `?re=${encodeURIComponent(i.emisorRfc)}&rr=${encodeURIComponent(i.receptorRfc)}&tt=${tt}&id=${encodeURIComponent(i.uuid)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildConsultaEnvelope(expresionImpresa: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><Consulta xmlns="http://tempuri.org/"><expresionImpresa>${escapeXml(expresionImpresa)}</expresionImpresa></Consulta></soap:Body></soap:Envelope>`;
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`, "i"));
  return m ? m[1].trim() : undefined;
}

/** Parse the SOAP response into a ConsultaResult (pure, testable). */
export function parseConsultaResponse(xml: string): ConsultaResult {
  const codigoEstatus = tag(xml, "CodigoEstatus") ?? "";
  const estado = tag(xml, "Estado") ?? "Error";
  return {
    estado,
    codigoEstatus,
    esCancelable: tag(xml, "EsCancelable"),
    estatusCancelacion: tag(xml, "EstatusCancelacion"),
    validacionEfos: tag(xml, "ValidacionEFOS"),
  };
}

export class VerificationClient {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async consulta(expresionImpresa: string): Promise<ConsultaResult> {
    const res = await this.fetchFn(SERVICE_URL, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        SOAPAction: SOAP_ACTION,
      },
      body: buildConsultaEnvelope(expresionImpresa),
    });
    const xml = await res.text();
    return parseConsultaResponse(xml);
  }
}
