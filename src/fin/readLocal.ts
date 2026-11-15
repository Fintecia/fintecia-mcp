/**
 * S4 — read-local: búsqueda por metadata + detail (XML crudo) desde los zips
 * locales. El detalle (XML crudo) lee el zip puntual, no la caché de metadata
 * (`cfdiIndex.ts`), porque el backend elimina el XML tras procesar.
 */
import path from "node:path";
import { extractXmlEntries } from "./cfdiIndex.js";
import type { CfdiIndexEntry } from "./cfdiIndex.js";

// Campos de búsqueda por metadata (S4). Sólo estos cinco, tal como define la
// spec — no se indexa ni se busca el resto (emisorRfc/receptorRfc/fecha/total
// son contexto de presentación, no criterio de búsqueda).
const SEARCH_FIELDS = ["emisorNombre", "receptorNombre", "serie", "folio", "uuid"] as const;

/** Match case-insensitive de `query` contra los cinco campos de metadata. */
export function matchesQuery(entry: CfdiIndexEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return SEARCH_FIELDS.some((field) => {
    const value = entry[field];
    return typeof value === "string" && value.toLowerCase().includes(q);
  });
}

/** Filtra por `query` y aplica `limit` (sin query = lista todo). */
export function searchEntries(
  entries: CfdiIndexEntry[],
  query: string,
  limit?: number,
): CfdiIndexEntry[] {
  const matches = entries.filter((e) => matchesQuery(e, query));
  return typeof limit === "number" ? matches.slice(0, limit) : matches;
}

/** Lee el XML crudo de un CFDI indexado desde su zip puntual. */
export async function readCfdiXml(
  downloadsDir: string,
  entry: CfdiIndexEntry,
): Promise<string> {
  const zipPath = path.join(downloadsDir, entry.requestKey, entry.tipo, entry.zipFile);
  const xmls = await extractXmlEntries(zipPath);
  const found = xmls.find((x) => x.name === entry.entryName);
  if (!found) {
    throw new Error(`XML ${entry.entryName} no encontrado en ${entry.zipFile}`);
  }
  return found.xml;
}
