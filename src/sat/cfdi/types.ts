/**
 * Shared CFDI types for the local parse pipeline.
 *
 * The `CfdiData` shape is a byte-for-byte port of the backend's
 * `functions/src/cfdi/cfdiParser.ts` (the source of truth for the A1
 * byte-equivalence invariant). Field names, null handling, and sub-parser
 * ordering must stay identical — drift here corrupts the accounting.
 */

/** SAT c_TipoDeduccion entry (Nomina 1.2 complemento Deducciones/Deduccion). */
export interface NominaDeduccion {
  tipoDeduccion: string;
  importe: number;
  concepto?: string;
}

/** SAT Nomina 1.2 complemento (nomina12:Nomina). Null when no Nomina complement is present. */
export interface NominaComplemento {
  totalPercepciones: number;
  totalDeducciones: number;
  totalOtrosPagos: number;
  deducciones: NominaDeduccion[];
}

/** Per-tax line extracted from cfdi:Traslado / cfdi:Retencion. */
export interface TaxLine {
  impuesto: string;
  importe: number;
}

export interface Concepto {
  claveProdServ: string;
  cantidad: number;
  claveUnidad: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  objetoImp: string | null;
}

export interface PagosComplemento {
  version: string;
  pagos: Array<{
    fechaPago: string;
    formaDePagoP: string;
    monedaP: string;
    tipoCambioP: number | null;
    monto: number;
    doctosRelacionados: Array<{
      idDocumento: string;
      monedaDR: string;
      tipoCambioDR: number | null;
      metodoDePagoDR: string;
      numParcialidad: string | null;
      impSaldoAnt: number | null;
      impPagado: number;
      impSaldoInsoluto: number | null;
    }>;
  }>;
}

export interface CfdiRelacionados {
  tipoRelacion: string;
  uuids: string[];
}

/**
 * Full parsed CFDI (port of the backend `CfdiData`). Contains the signature
 * fields (`selloCFD`/`selloSAT`/`noCertificadoSAT`/`rfcProvCertif`/
 * `fechaTimbrado`) IN MEMORY for seal validation — they are dropped when the
 * accounting extract is derived, so they never leave the machine.
 */
export interface CfdiData {
  version: string;
  serie: string | null;
  folio: string | null;
  fecha: string;
  formaPago: string | null;
  subtotal: number;
  descuento: number;
  moneda: string;
  tipoCambio: number | null;
  total: number;
  tipoDeComprobante: string;
  metodoPago: string | null;
  lugarExpedicion: string | null;
  exportacion: string | null;
  emisorRfc: string;
  emisorNombre: string | null;
  emisorRegimenFiscal: string;
  receptorRfc: string;
  receptorNombre: string | null;
  receptorDomicilioFiscalReceptor: string | null;
  receptorRegimenFiscalReceptor: string | null;
  receptorUsoCFDI: string | null;
  conceptos: Concepto[];
  totalImpuestosTrasladados: number | null;
  totalImpuestosRetenidos: number | null;
  trasladados: TaxLine[];
  retenciones: TaxLine[];
  nomina: NominaComplemento | null;
  uuid: string;
  fechaTimbrado: string;
  rfcProvCertif: string;
  selloCFD: string | null;
  noCertificadoSAT: string | null;
  selloSAT: string | null;
  cfdiRelacionados: CfdiRelacionados | null;
  estatus: "vigente" | "cancelado";
  fechaCancelacion: string | null;
  motivoCancelacion: string | null;
  pagosComplemento: PagosComplemento | null;
}

/**
 * S3 — extracto contable. The exact accounting subset of `CfdiData` that the
 * backend `cfdiToEntry` consumes (plus the S5 verification tuple: uuid +
 * emisorRfc + receptorRfc + total, which are already fields of this subset).
 * Metadata and signature fields are intentionally absent.
 */
export interface ExtractoContable {
  tipoDeComprobante: string;
  fecha: string;
  emisorRfc: string;
  emisorRegimenFiscal: string;
  receptorRfc: string;
  receptorRegimenFiscalReceptor: string | null;
  receptorUsoCFDI: string | null;
  subtotal: number;
  descuento: number;
  total: number;
  moneda: string;
  tipoCambio: number | null;
  metodoPago: string | null;
  formaPago: string | null;
  totalImpuestosTrasladados: number | null;
  totalImpuestosRetenidos: number | null;
  trasladados: TaxLine[];
  retenciones: TaxLine[];
  conceptos: Concepto[];
  pagosComplemento: PagosComplemento | null;
  nomina: NominaComplemento | null;
  cfdiRelacionados: CfdiRelacionados | null;
  uuid: string;
}

/**
 * S7 — selloSAT validator (driven port). Verifies the SAT seal over the
 * cadena original of the TimbreFiscalDigital. Resolves when the seal is
 * valid; throws `SelloSatError` when it is absent/invalid. The concrete
 * nodecfdi implementation lives in `seal.ts`; callers (and tests) inject it
 * so the pure orchestration stays jest-testable.
 */
export type SealVerifier = (
  xml: string,
  noCertificadoSAT: string,
  selloSAT: string,
) => Promise<void>;

/** Raised when the selloSAT is absent or does not verify (S7). */
export class SelloSatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelloSatError";
  }
}
