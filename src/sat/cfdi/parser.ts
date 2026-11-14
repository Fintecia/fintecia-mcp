/**
 * CFDI XML → CfdiData parser. This is a byte-for-byte port of the backend's
 * `functions/src/cfdi/cfdiParser.ts` (`parseCfdiXml` + its sub-parsers), the
 * source of truth for the A1 byte-equivalence invariant. Same field names,
 * same null handling, same sub-parser order, same `fast-xml-parser` config.
 *
 * Do NOT "improve" this file — any drift from the backend corrupts the
 * accounting (journal entries diverge). If the backend changes, port it.
 */
import { XMLParser } from "fast-xml-parser";
import type {
  CfdiData,
  CfdiRelacionados,
  Concepto,
  NominaComplemento,
  NominaDeduccion,
  PagosComplemento,
  TaxLine,
} from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

const MAX_PER_TAX_ENTRIES = 6;

function detectVersion(xmlString: string): "4.0" | "3.3" | "3.2" {
  if (xmlString.includes("/cfd/4")) return "4.0";
  if (xmlString.includes("/cfd/3")) return "3.3";
  return "3.2";
}

function parseComprobanteAttributes(
  attrs: Record<string, any>,
  version: string,
): Partial<CfdiData> {
  const exportacionAttr = version === "4.0" ? (attrs["@_Exportacion"] || null) : null;

  return {
    version: attrs["@_Version"] || version,
    serie: attrs["@_Serie"] || null,
    folio: attrs["@_Folio"] || null,
    fecha: attrs["@_Fecha"],
    formaPago: attrs["@_FormaPago"] || null,
    subtotal: parseFloat(attrs["@_SubTotal"]) || 0,
    descuento: parseFloat(attrs["@_Descuento"]) || 0,
    moneda: attrs["@_Moneda"] || "MXN",
    tipoCambio: attrs["@_TipoCambio"] ? parseFloat(attrs["@_TipoCambio"]) : null,
    total: parseFloat(attrs["@_Total"]) || 0,
    tipoDeComprobante: attrs["@_TipoDeComprobante"],
    metodoPago: attrs["@_MetodoPago"] || null,
    lugarExpedicion: attrs["@_LugarExpedicion"] || null,
    exportacion: exportacionAttr,
  };
}

function parseEmisor(
  emisor: Record<string, any>,
): { emisorRfc: string; emisorNombre: string | null; emisorRegimenFiscal: string } {
  return {
    emisorRfc: emisor["@_Rfc"],
    emisorNombre: emisor["@_Nombre"] || null,
    emisorRegimenFiscal: emisor["@_RegimenFiscal"],
  };
}

function parseReceptor(
  receptor: Record<string, any>,
  version: string,
): {
  receptorRfc: string;
  receptorNombre: string | null;
  receptorDomicilioFiscalReceptor: string | null;
  receptorRegimenFiscalReceptor: string | null;
  receptorUsoCFDI: string | null;
} {
  const isV4 = version === "4.0";

  return {
    receptorRfc: receptor["@_Rfc"],
    receptorNombre: isV4 ? (receptor["@_Nombre"] || null) : null,
    receptorDomicilioFiscalReceptor:
      isV4 ? (receptor["@_DomicilioFiscalReceptor"] || null) : null,
    receptorRegimenFiscalReceptor:
      isV4 ? (receptor["@_RegimenFiscalReceptor"] || null) : null,
    receptorUsoCFDI: receptor["@_UsoCFDI"] || null,
  };
}

function parseConceptos(
  conceptos: Record<string, any> | Record<string, any>[],
  version: string,
): Concepto[] {
  const items = Array.isArray(conceptos)
    ? conceptos
    : conceptos["cfdi:Concepto"]
      ? Array.isArray(conceptos["cfdi:Concepto"])
        ? conceptos["cfdi:Concepto"]
        : [conceptos["cfdi:Concepto"]]
      : [];

  const isV4 = version === "4.0";

  return items.map((item: Record<string, any>) => ({
    claveProdServ: item["@_ClaveProdServ"],
    cantidad: parseFloat(item["@_Cantidad"]) || 0,
    claveUnidad: item["@_ClaveUnidad"],
    descripcion: item["@_Descripcion"],
    valorUnitario: parseFloat(item["@_ValorUnitario"]) || 0,
    importe: parseFloat(item["@_Importe"]) || 0,
    objetoImp: isV4 ? (item["@_ObjetoImp"] || null) : null,
  }));
}

function parseTimbreFiscalDigital(
  complemento: Record<string, any>,
): {
  uuid: string;
  fechaTimbrado: string;
  rfcProvCertif: string;
  selloCFD: string | null;
  noCertificadoSAT: string | null;
  selloSAT: string | null;
} | null {
  const tfd =
    complemento?.["tfd:TimbreFiscalDigital"] ||
    complemento?.["cfdi:Complemento"]?.["tfd:TimbreFiscalDigital"];

  if (!tfd) return null;

  const uuid = tfd["@_UUID"];
  if (!uuid) {
    throw new Error("Invalid TimbreFiscalDigital: missing UUID attribute");
  }

  return {
    uuid,
    fechaTimbrado: tfd["@_FechaTimbrado"],
    rfcProvCertif: tfd["@_RfcProvCertif"],
    selloCFD: tfd["@_SelloCFD"] || null,
    noCertificadoSAT: tfd["@_NoCertificadoSAT"] || null,
    selloSAT: tfd["@_SelloSAT"] || null,
  };
}

function parseImpuestos(
  impuestos: Record<string, any> | null,
): {
  totalImpuestosTrasladados: number | null;
  totalImpuestosRetenidos: number | null;
} {
  if (!impuestos) {
    return { totalImpuestosTrasladados: null, totalImpuestosRetenidos: null };
  }

  const totalTrasladados = impuestos["@_TotalImpuestosTrasladados"]
    ? parseFloat(impuestos["@_TotalImpuestosTrasladados"])
    : null;
  const totalRetenidos = impuestos["@_TotalImpuestosRetenidos"]
    ? parseFloat(impuestos["@_TotalImpuestosRetenidos"])
    : null;

  return {
    totalImpuestosTrasladados: totalTrasladados,
    totalImpuestosRetenidos: totalRetenidos,
  };
}

function parseCfdiRelacionados(
  node: Record<string, any> | undefined,
): CfdiRelacionados | null {
  if (!node) return null;

  const tipoRelacion = node["@_TipoRelacion"];
  if (!tipoRelacion) return null;

  const relacionados = node["cfdi:CfdiRelacionado"];
  const items = Array.isArray(relacionados)
    ? relacionados
    : relacionados
      ? [relacionados]
      : [];

  const uuids = items
    .map((r: Record<string, any>) => r["@_UUID"] as string)
    .filter(Boolean);

  return { tipoRelacion, uuids };
}

function parsePagosComplemento(
  complemento: Record<string, any> | undefined,
): PagosComplemento | null {
  if (!complemento) return null;

  // CFDI 4.0 uses pago20, 3.3 uses pago10. Try all known namespaces.
  const pagosNode =
    complemento["pago20:Pagos"] ||
    complemento["pago10:Pagos"] ||
    complemento["pagos:Pagos"] ||
    complemento["Pagos"];
  if (!pagosNode) return null;

  const pagosRaw =
    pagosNode["pago20:Pago"] ||
    pagosNode["pago10:Pago"] ||
    pagosNode["pagos:Pago"] ||
    pagosNode["Pago"];
  const pagosList = Array.isArray(pagosRaw) ? pagosRaw : pagosRaw ? [pagosRaw] : [];

  return {
    version: pagosNode["@_Version"] || "1.0",
    pagos: pagosList.map((pago: Record<string, any>) => {
      const doctosRaw =
        pago["pago20:DoctoRelacionado"] ||
        pago["pago10:DoctoRelacionado"] ||
        pago["pagos:DoctoRelacionado"] ||
        pago["DoctoRelacionado"];
      const doctosList = Array.isArray(doctosRaw)
        ? doctosRaw
        : doctosRaw
          ? [doctosRaw]
          : [];

      return {
        fechaPago: pago["@_FechaPago"] || "",
        formaDePagoP: pago["@_FormaDePagoP"] || "",
        monedaP: pago["@_MonedaP"] || "MXN",
        tipoCambioP: pago["@_TipoCambioP"]
          ? parseFloat(pago["@_TipoCambioP"])
          : null,
        monto: parseFloat(pago["@_Monto"]) || 0,
        doctosRelacionados: doctosList.map((d: Record<string, any>) => ({
          idDocumento: d["@_IdDocumento"] || "",
          monedaDR: d["@_MonedaDR"] || "MXN",
          tipoCambioDR: d["@_TipoCambioDR"]
            ? parseFloat(d["@_TipoCambioDR"])
            : null,
          metodoDePagoDR: d["@_MetodoDePagoDR"] || "",
          numParcialidad: d["@_NumParcialidad"] || null,
          impSaldoAnt: d["@_ImpSaldoAnt"]
            ? parseFloat(d["@_ImpSaldoAnt"])
            : null,
          impPagado: parseFloat(d["@_ImpPagado"]) || 0,
          impSaldoInsoluto: d["@_ImpSaldoInsoluto"]
            ? parseFloat(d["@_ImpSaldoInsoluto"])
            : null,
        })),
      };
    }),
  };
}

/**
 * Parse the Nomina 1.2 complemento (SAT-REQ-43). Returns null when no Nomina
 * element is present. Deducciones are capped at MAX_PER_TAX_ENTRIES.
 */
function parseNominaComplemento(
  complemento: Record<string, any> | undefined,
): NominaComplemento | null {
  if (!complemento) return null;

  const nominaNode =
    complemento["nomina12:Nomina"] ||
    complemento["nomina:Nomina"] ||
    complemento["Nomina"];
  if (!nominaNode) return null;

  const deduccionesNode =
    nominaNode["nomina12:Deducciones"] ||
    nominaNode["nomina:Deducciones"] ||
    nominaNode["Deducciones"];

  let deducciones: NominaDeduccion[] = [];
  if (deduccionesNode) {
    const raw =
      deduccionesNode["nomina12:Deduccion"] ||
      deduccionesNode["nomina:Deduccion"] ||
      deduccionesNode["Deduccion"];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    deducciones = list.slice(0, MAX_PER_TAX_ENTRIES).map((d: Record<string, any>) => ({
      tipoDeduccion: d["@_TipoDeduccion"] || "",
      importe: parseFloat(d["@_Importe"]) || 0,
      concepto: d["@_Concepto"] || undefined,
    }));
  }

  return {
    totalPercepciones: parseFloat(nominaNode["@_TotalPercepciones"]) || 0,
    totalDeducciones: parseFloat(nominaNode["@_TotalDeducciones"]) || 0,
    totalOtrosPagos: parseFloat(nominaNode["@_TotalOtrosPagos"]) || 0,
    deducciones,
  };
}

function parseTrasladados(impuestos: Record<string, any> | null | undefined): TaxLine[] {
  if (!impuestos) return [];
  const trasladosNode =
    impuestos["cfdi:Traslados"] || impuestos["Traslados"];
  if (!trasladosNode) return [];
  const raw =
    trasladosNode["cfdi:Traslado"] || trasladosNode["Traslado"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.slice(0, MAX_PER_TAX_ENTRIES).map((t: Record<string, any>) => ({
    impuesto: t["@_Impuesto"] || "",
    importe: parseFloat(t["@_Importe"]) || 0,
  }));
}

function parseRetenciones(impuestos: Record<string, any> | null | undefined): TaxLine[] {
  if (!impuestos) return [];
  const retencionesNode =
    impuestos["cfdi:Retenciones"] || impuestos["Retenciones"];
  if (!retencionesNode) return [];
  const raw =
    retencionesNode["cfdi:Retencion"] || retencionesNode["Retencion"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.slice(0, MAX_PER_TAX_ENTRIES).map((t: Record<string, any>) => ({
    impuesto: t["@_Impuesto"] || "",
    importe: parseFloat(t["@_Importe"]) || 0,
  }));
}

/**
 * Parse a CFDI XML string into `CfdiData`. Byte-equivalent to the backend's
 * `parseCfdiXml` (no cancellation context — the MCP parses raw XML and the
 * extract never carries cancellation fields).
 */
export function parseCfdiXml(xmlString: string): CfdiData {
  const version = detectVersion(xmlString);
  const parsed = parser.parse(xmlString);

  const comprobante =
    parsed["cfdi:Comprobante"] || parsed["Comprobante"];
  if (!comprobante) {
    throw new Error("Invalid CFDI XML: missing Comprobante element");
  }

  const attrs = comprobante;
  const comprobanteData = parseComprobanteAttributes(attrs, version);

  const emisor = parseEmisor(attrs["cfdi:Emisor"] || attrs["Emisor"]);
  const receptor = parseReceptor(
    attrs["cfdi:Receptor"] || attrs["Receptor"],
    version
  );

  const conceptosRaw =
    attrs["cfdi:Conceptos"] || attrs["Conceptos"];
  const conceptos = parseConceptos(conceptosRaw, version);

  const complemento = attrs["cfdi:Complemento"] || attrs["Complemento"];
  const tfd = parseTimbreFiscalDigital(complemento);

  const impuestos = attrs["cfdi:Impuestos"] || attrs["Impuestos"];
  const impuestosData = parseImpuestos(impuestos);

  const cfdiRelacionados = parseCfdiRelacionados(
    attrs["cfdi:CfdiRelacionados"]
  );

  const pagosComplemento = parsePagosComplemento(complemento);
  const nomina = parseNominaComplemento(complemento);
  const trasladados = parseTrasladados(impuestos);
  const retenciones = parseRetenciones(impuestos);

  if (!tfd) {
    throw new Error("Invalid CFDI XML: missing TimbreFiscalDigital");
  }

  return {
    ...comprobanteData,
    ...emisor,
    ...receptor,
    conceptos,
    ...impuestosData,
    trasladados,
    retenciones,
    nomina,
    ...tfd,
    cfdiRelacionados,
    pagosComplemento,
    motivoCancelacion: null,
    estatus: "vigente",
    fechaCancelacion: null,
  } as CfdiData;
}
