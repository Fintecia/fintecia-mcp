/**
 * Extracto contable (S3) — the exact accounting subset of `CfdiData`, plus the
 * S7 seal-presence check. Metadata and signature fields never reach the
 * extract (they never leave the machine).
 */
import { SelloSatError } from "./types.js";
import type { CfdiData, ExtractoContable } from "./types.js";

/**
 * S3 field list, in spec order (byte-stable for JSON serialization). The
 * verification tuple (S5: uuid + emisorRfc + receptorRfc + total) is covered
 * by these fields.
 */
export const S3_FIELDS: readonly string[] = [
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
];

/** Derive the accounting extract (S3 subset) from a full `CfdiData`. */
export function toExtractoContable(cfdi: CfdiData): ExtractoContable {
  return {
    tipoDeComprobante: cfdi.tipoDeComprobante,
    fecha: cfdi.fecha,
    emisorRfc: cfdi.emisorRfc,
    emisorRegimenFiscal: cfdi.emisorRegimenFiscal,
    receptorRfc: cfdi.receptorRfc,
    receptorRegimenFiscalReceptor: cfdi.receptorRegimenFiscalReceptor,
    receptorUsoCFDI: cfdi.receptorUsoCFDI,
    subtotal: cfdi.subtotal,
    descuento: cfdi.descuento,
    total: cfdi.total,
    moneda: cfdi.moneda,
    tipoCambio: cfdi.tipoCambio,
    metodoPago: cfdi.metodoPago,
    formaPago: cfdi.formaPago,
    totalImpuestosTrasladados: cfdi.totalImpuestosTrasladados,
    totalImpuestosRetenidos: cfdi.totalImpuestosRetenidos,
    trasladados: cfdi.trasladados,
    retenciones: cfdi.retenciones,
    conceptos: cfdi.conceptos,
    pagosComplemento: cfdi.pagosComplemento,
    nomina: cfdi.nomina,
    cfdiRelacionados: cfdi.cfdiRelacionados,
    uuid: cfdi.uuid,
  };
}

/**
 * S7 — deterministic seal-presence gate. A CFDI with an absent/empty
 * `selloSAT` or `noCertificadoSAT` is rejected before any crypto runs (and
 * never produces an extract).
 */
export function assertSealPresent(cfdi: CfdiData): void {
  if (!cfdi.selloSAT) {
    throw new SelloSatError("selloSAT ausente o inválido");
  }
  if (!cfdi.noCertificadoSAT) {
    throw new SelloSatError("selloSAT ausente o inválido: falta noCertificadoSAT");
  }
}
