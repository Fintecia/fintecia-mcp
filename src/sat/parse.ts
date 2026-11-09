/**
 * Pure CFDI XML parsing + download argument validation.
 *
 * Deliberately nodecfdi-free so jest can test these functions directly:
 * nodecfdi is ESM-only and its runtime import belongs to the `descarga.ts`
 * seam (smoke-tested via tsx, never jest).
 */

/** Tipo del CFDI ya normalizado para el cuerpo del upload (contrato congelado). */
export type CfdiTipo = "emitido" | "recibido";

/** Tipo de descarga que el usuario solicita (plural, como en el schema del tool). */
export type DescargaTipo = "emitidos" | "recibidos";

/** Tipo aceptado por el tool `cfdi_download` (incluye el agregado "ambos"). */
export type ToolTipo = "emitidos" | "recibidos" | "ambos";

/** Fase de un job de descarga (Autentica → Solicitud → Verificación → Descarga → upload). */
export type DownloadPhase =
  | "autentica"
  | "solicitud"
  | "verificacion"
  | "descarga"
  | "upload";

export interface Period {
  /** Fecha de inicio, YYYY-MM-DD. */
  desde: string;
  /** Fecha de fin, YYYY-MM-DD. */
  hasta: string;
}

export interface DownloadArgs {
  tipo: ToolTipo;
  desde: string;
  hasta: string;
  rfc: string;
}

/** Un CFDI descargado, listo para el upload (contrato congelado del backend). */
export interface DownloadedCfdi {
  xml: string;
  uuid: string;
  emisorRfc: string;
  receptorRfc: string;
  total: number;
  fecha: string;
  tipo: CfdiTipo;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Validate and normalize a download period.
 *
 * Strict: uses Date.UTC + round-trip so impossible dates like 2026-02-30
 * (which `new Date("...")` silently rolls over) are rejected.
 */
export function validatePeriod(desde: string, hasta: string): Period {
  const start = parseDateStrict(desde, "desde");
  const end = parseDateStrict(hasta, "hasta");
  if (start > end) {
    throw new Error("desde debe ser anterior o igual a hasta");
  }
  return { desde, hasta };
}

function parseDateStrict(value: string, label: string): number {
  const m = DATE_RE.exec(value);
  if (!m) {
    throw new Error(`${label} debe tener formato YYYY-MM-DD`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new Error(`${label} no es una fecha válida: ${value}`);
  }
  return date.getTime();
}

/** Validate the raw tool input for `cfdi_download` into a normalized shape. */
export function validateDownloadArgs(input: Record<string, unknown>): DownloadArgs {
  const tipo = input.tipo;
  if (tipo !== "emitidos" && tipo !== "recibidos" && tipo !== "ambos") {
    throw new Error("tipo debe ser emitidos, recibidos o ambos");
  }
  const { desde, hasta } = validatePeriod(String(input.desde ?? ""), String(input.hasta ?? ""));
  const rfc = normalizeRfc(String(input.rfc ?? ""));
  return { tipo, desde, hasta, rfc };
}

function normalizeRfc(rfc: string): string {
  const value = rfc.trim().toUpperCase();
  if (!/^[A-ZÑ&0-9]{12,13}$/.test(value)) {
    throw new Error(`RFC inválido: ${rfc}`);
  }
  return value;
}

/**
 * Parse a CFDI XML into a `DownloadedCfdi`.
 *
 * Reads namespace-prefix-agnostic element/attribute pairs (the SAT always
 * ships `cfdi:Comprobante`, `cfdi:Emisor`, `cfdi:Receptor` and
 * `tfd:TimbreFiscalDigital`). Throws when a required field is missing so a
 * malformed CFDI is surfaced rather than silently uploaded.
 */
export function parseCfdiXml(xml: string, tipo: CfdiTipo): DownloadedCfdi {
  const uuid = readAttribute(xml, "TimbreFiscalDigital", "UUID");
  const emisorRfc = readAttribute(xml, "Emisor", "Rfc");
  const receptorRfc = readAttribute(xml, "Receptor", "Rfc");
  const totalRaw = readAttribute(xml, "Comprobante", "Total");
  const fecha = readAttribute(xml, "Comprobante", "Fecha");

  if (!uuid) throw new Error("CFDI sin UUID (TimbreFiscalDigital)");
  if (!emisorRfc) throw new Error("CFDI sin RFC emisor");
  if (!receptorRfc) throw new Error("CFDI sin RFC receptor");
  if (!fecha) throw new Error("CFDI sin fecha de emisión");

  const total = Number(totalRaw);
  if (totalRaw == null || totalRaw.trim() === "" || !Number.isFinite(total)) {
    throw new Error("CFDI sin total válido");
  }

  return {
    xml,
    uuid: uuid.toLowerCase(),
    emisorRfc,
    receptorRfc,
    total,
    fecha,
    tipo,
  };
}

/**
 * Read a named attribute from the first opening tag whose local element name
 * matches (allowing an optional `prefix:` namespace).
 */
function readAttribute(xml: string, elementLocal: string, attribute: string): string | null {
  const tag = matchElementTag(xml, elementLocal);
  if (!tag) return null;
  const attrRe = new RegExp(`\\b${escapeRe(attribute)}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = attrRe.exec(tag);
  return m ? m[1] : null;
}

function matchElementTag(xml: string, elementLocal: string): string | null {
  const re = new RegExp(`<([A-Za-z_][\\w.-]*:)?${escapeRe(elementLocal)}\\b[^>]*>`, "i");
  const m = re.exec(xml);
  return m ? m[0] : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
