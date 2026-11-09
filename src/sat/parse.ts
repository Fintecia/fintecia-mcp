/**
 * Pure download argument validation (nodecfdi-free, jest-testable).
 *
 * CFDI XML parsing is NOT done here: the client uploads the ZIP as-is and the
 * backend reuses its own parser (`cfdi/cfdiParser.ts` via `ingestZipBuffer`).
 */

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
