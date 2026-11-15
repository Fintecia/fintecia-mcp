/**
 * S4 — índice local de metadata de CFDI (read-local, A3).
 *
 * Los zips de DescargaMasiva persisten en
 * `~/.fintecia/mcp/downloads/<rfc>_<desde>_<hasta>/<tipo>/<NNN>.zip`
 * (`src/sat/artifacts.ts`) y NO se borran tras el upload. Para listar/buscar
 * rápido, este módulo extrae la metadata de cada CFDI (reusando el parser de
 * `src/sat/cfdi/`) y persiste un índice JSON cacheable — en vez de escanear
 * todos los zips por request. El detail (XML crudo) sí lee el zip puntual
 * (`readLocal.ts`).
 *
 * El índice es un DERIVADO de los zips locales: nunca se envía al backend
 * (FEP (a) ya no persiste esta metadata) y puede regenerarse en cualquier
 * momento con `rebuild()`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { parseCfdiXml } from "../sat/cfdi/parser.js";
import type { CfdiData } from "../sat/cfdi/types.js";

// RFC charset (A-Z, dígitos, Ñ, &) + `_` + `-`. Espejo de `artifacts.ts`
// `safe()`: una clave de directorio jamás debe poder atravesar la base.
const SEGMENT_RE = /^[A-Za-z0-9Ñ&_\-]+$/;

/**
 * Metadata (S4) + procedencia de un CFDI, tal como se indexa para read-local.
 * Los campos de búsqueda son `emisorNombre`, `receptorNombre`, `serie`,
 * `folio` y `uuid`; el resto es contexto de presentación + la ruta para leer
 * el XML crudo en el detail.
 */
export interface CfdiIndexEntry {
  uuid: string;
  emisorNombre: string | null;
  receptorNombre: string | null;
  emisorRfc: string;
  receptorRfc: string;
  serie: string | null;
  folio: string | null;
  fecha: string;
  total: number;
  tipoDeComprobante: string;
  /** Procedencia: zip local + entry que guarda el XML crudo (para el detail). */
  tipo: string;
  requestKey: string;
  zipFile: string;
  entryName: string;
}

/** Directorio raíz de los zips locales (espejo de `artifacts.ts` `defaultBaseDir`). */
export function defaultDownloadsDir(): string {
  return path.join(os.homedir(), ".fintecia", "mcp", "downloads");
}

/** Archivo del índice cacheable de metadata. */
export function defaultIndexFile(): string {
  return path.join(os.homedir(), ".fintecia", "mcp", "cfdi-index.json");
}

export interface CfdiSource {
  tipo: string;
  requestKey: string;
  zipFile: string;
  entryName: string;
}

/** Deriva la entrada de índice (S4) desde un `CfdiData` parseado + su zip. */
export function toIndexEntry(cfdi: CfdiData, source: CfdiSource): CfdiIndexEntry {
  return {
    uuid: cfdi.uuid,
    emisorNombre: cfdi.emisorNombre,
    receptorNombre: cfdi.receptorNombre,
    emisorRfc: cfdi.emisorRfc,
    receptorRfc: cfdi.receptorRfc,
    serie: cfdi.serie,
    folio: cfdi.folio,
    fecha: cfdi.fecha,
    total: cfdi.total,
    tipoDeComprobante: cfdi.tipoDeComprobante,
    ...source,
  };
}

export interface ZipLocation {
  requestKey: string;
  tipo: string;
  zipFile: string;
  absPath: string;
}

/**
 * Enumera los zips locales: `<downloadsDir>/<requestKey>/<tipo>/<NNN>.zip`,
 * en orden estable (requestKey → tipo → zipFile). Los segmentos se validan
 * contra `SEGMENT_RE` (igual que `artifacts.ts`) para descartar cualquier
 * directorio que pudiera atravesar la base.
 */
export async function listDownloadedZips(downloadsDir: string): Promise<ZipLocation[]> {
  const result: ZipLocation[] = [];
  let requestKeys: string[];
  try {
    requestKeys = await fs.readdir(downloadsDir);
  } catch {
    return [];
  }
  requestKeys.sort();
  for (const requestKey of requestKeys) {
    if (!SEGMENT_RE.test(requestKey)) continue;
    const requestDir = path.join(downloadsDir, requestKey);
    if (!(await isDir(requestDir))) continue;
    const tipos = (await fs.readdir(requestDir)).sort();
    for (const tipo of tipos) {
      if (!SEGMENT_RE.test(tipo)) continue;
      const tipoDir = path.join(requestDir, tipo);
      if (!(await isDir(tipoDir))) continue;
      const zips = (await fs.readdir(tipoDir))
        .filter((f) => f.endsWith(".zip"))
        .sort();
      for (const zipFile of zips) {
        result.push({ requestKey, tipo, zipFile, absPath: path.join(tipoDir, zipFile) });
      }
    }
  }
  return result;
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Unzip y devuelve el XML crudo de cada entry `.xml` (en orden de nombre). */
export async function extractXmlEntries(
  zipPath: string,
): Promise<Array<{ name: string; xml: string }>> {
  const buf = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const out: Array<{ name: string; xml: string }> = [];
  for (const name of Object.keys(zip.files).sort()) {
    const file = zip.files[name];
    if (file.dir) continue;
    if (!name.toLowerCase().endsWith(".xml")) continue;
    out.push({ name, xml: await file.async("string") });
  }
  return out;
}

/**
 * Construye el índice completo parseando cada CFDI de los zips locales. Un
 * zip corrupto/ilegible y un XML no-CFDI/malformado se saltan (índice parcial
 * > ninguno); el XML crudo igual queda en disco para un detail manual.
 */
export async function buildIndex(downloadsDir: string): Promise<CfdiIndexEntry[]> {
  const entries: CfdiIndexEntry[] = [];
  for (const loc of await listDownloadedZips(downloadsDir)) {
    let xmls: Array<{ name: string; xml: string }>;
    try {
      xmls = await extractXmlEntries(loc.absPath);
    } catch {
      continue;
    }
    for (const { name, xml } of xmls) {
      try {
        const cfdi = parseCfdiXml(xml);
        entries.push(
          toIndexEntry(cfdi, {
            tipo: loc.tipo,
            requestKey: loc.requestKey,
            zipFile: loc.zipFile,
            entryName: name,
          }),
        );
      } catch {
        // XML no-CFDI / sin TimbreFiscalDigital: se salta.
      }
    }
  }
  return entries;
}

/** Fingerprint del estado actual de los zips (path + size + mtimeMs). */
export async function computeFingerprint(downloadsDir: string): Promise<string> {
  const parts: string[] = [];
  for (const loc of await listDownloadedZips(downloadsDir)) {
    let stat: string;
    try {
      const s = await fs.stat(loc.absPath);
      stat = `${s.size}:${s.mtimeMs}`;
    } catch {
      stat = "missing";
    }
    parts.push(`${loc.requestKey}/${loc.tipo}/${loc.zipFile}:${stat}`);
  }
  return parts.join("\n");
}

export interface CfdiIndexStoreOptions {
  downloadsDir: string;
  indexFile: string;
}

interface PersistedIndex {
  fingerprint: string;
  entries: CfdiIndexEntry[];
}

/**
 * Caché del índice de metadata. `entries()` reusa el índice persistido cuando
 * el fingerprint de los zips no cambió (A3: no escanear por request); un cambio
 * en los zips o un índice faltante/corrupto dispara un rebuild transparente.
 */
export class CfdiIndexStore {
  constructor(private readonly opts: CfdiIndexStoreOptions) {}

  async entries(): Promise<CfdiIndexEntry[]> {
    const fingerprint = await computeFingerprint(this.opts.downloadsDir);
    const cached = await this.readCache();
    if (cached && cached.fingerprint === fingerprint) {
      return cached.entries;
    }
    return this.rebuild();
  }

  /** Reescanea los zips y regenera + persiste el índice (ignora la caché). */
  async rebuild(): Promise<CfdiIndexEntry[]> {
    const entries = await buildIndex(this.opts.downloadsDir);
    const fingerprint = await computeFingerprint(this.opts.downloadsDir);
    await this.writeCache({ fingerprint, entries });
    return entries;
  }

  private async readCache(): Promise<PersistedIndex | null> {
    try {
      const raw = await fs.readFile(this.opts.indexFile, "utf8");
      const parsed = JSON.parse(raw) as PersistedIndex;
      if (typeof parsed.fingerprint !== "string" || !Array.isArray(parsed.entries)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeCache(cache: PersistedIndex): Promise<void> {
    await fs.mkdir(path.dirname(this.opts.indexFile), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.opts.indexFile, JSON.stringify(cache), { mode: 0o600 });
  }
}
