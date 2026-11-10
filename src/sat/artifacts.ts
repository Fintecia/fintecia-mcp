import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Disk-backed persistence for downloaded SAT packages (CFDI zips).
 *
 * Why (L22 bug): `runDownloadJob` kept the zips ONLY in memory; a failed
 * upload lost the real SAT download — and the SAT limits re-downloads. Each
 * package is persisted to disk BEFORE upload, so a retry can re-upload without
 * a new DescargaMasiva request.
 *
 * Security: owner-only (0700 dirs / 0600 files). The data is the user's own
 * CFDI zips on their own machine (the e-firma already lives locally), but the
 * files still must not be world-readable.
 */

export interface DownloadArtifactStore {
  /** Persist one downloaded package (base64 zip) and return its path. */
  save(requestKey: string, tipo: string, index: number, zipBase64: string): Promise<string>;
  /** True if persisted packages exist for this request + tipo. */
  has(requestKey: string, tipo: string): Promise<boolean>;
  /** Load persisted packages (base64) for this request + tipo, in order. */
  load(requestKey: string, tipo: string): Promise<string[]>;
  /** Delete every package under a request key (after a successful upload). */
  remove(requestKey: string): Promise<void>;
}

// RFC charset (A-Z, digits, Ñ, &) + `_` + `-` (dates). No `.` or `/`, so a
// key can never traverse the base dir.
const SEGMENT_RE = /^[A-Za-z0-9Ñ&_\-]+$/;

function safe(segment: string): string {
  if (!SEGMENT_RE.test(segment)) {
    throw new Error(`invalid artifact segment: ${segment}`);
  }
  return segment;
}

/** Deterministic on-disk key for a download request (rfc + period). */
export function buildRequestKey(rfc: string, desde: string, hasta: string): string {
  return `${rfc}_${desde}_${hasta}`;
}

export class FileDownloadArtifactStore implements DownloadArtifactStore {
  constructor(private readonly baseDir: string = defaultBaseDir()) {}

  private dirFor(requestKey: string, tipo: string): string {
    return path.join(this.baseDir, safe(requestKey), safe(tipo));
  }

  async save(
    requestKey: string,
    tipo: string,
    index: number,
    zipBase64: string,
  ): Promise<string> {
    const dir = this.dirFor(requestKey, tipo);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${String(index).padStart(3, "0")}.zip`);
    await fs.writeFile(file, Buffer.from(zipBase64, "base64"), { mode: 0o600 });
    return file;
  }

  async has(requestKey: string, tipo: string): Promise<boolean> {
    const dir = this.dirFor(requestKey, tipo);
    try {
      const entries = await fs.readdir(dir);
      return entries.some((e) => e.endsWith(".zip"));
    } catch {
      return false;
    }
  }

  async load(requestKey: string, tipo: string): Promise<string[]> {
    const dir = this.dirFor(requestKey, tipo);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const zips = entries.filter((e) => e.endsWith(".zip")).sort();
    const result: string[] = [];
    for (const entry of zips) {
      const buf = await fs.readFile(path.join(dir, entry));
      result.push(buf.toString("base64"));
    }
    return result;
  }

  async remove(requestKey: string): Promise<void> {
    await fs.rm(path.join(this.baseDir, safe(requestKey)), {
      recursive: true,
      force: true,
    });
  }
}

function defaultBaseDir(): string {
  return path.join(os.homedir(), ".fintecia", "mcp", "downloads");
}
