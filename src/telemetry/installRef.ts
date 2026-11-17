import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Install REF — the acquisition referrer (a GA4 `client_id`) written by the
 * landing's install.sh into `~/.fintecia/install-ref`. Reported as telemetry
 * `source.channel` for acquisition/funnel attribution.
 *
 * Returns `null` when the file is missing, empty, or unreadable (direct or
 * unknown acquisition). Cached after the first read: it is read once per
 * process, mirroring `installId.ts`.
 */

let cached: string | null | undefined;

export function getInstallRef(): string | null {
  if (cached !== undefined) return cached;

  const file = path.join(os.homedir(), ".fintecia", "install-ref");
  let value: string | null = null;
  try {
    const raw = readFileSync(file, "utf8").trim();
    if (raw) value = raw;
  } catch {
    // missing or unreadable → null (no referrer)
  }

  cached = value;
  return value;
}
