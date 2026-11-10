import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";

/**
 * Anonymous install ID — a stable UUID persisted in ~/.fintecia/install-id.
 * Used to attribute telemetry + measure MCP→signup conversion (the ID is
 * later matched to the account at registration). No PII.
 */

let cached: string | null = null;

export function getInstallId(): string {
  if (cached) return cached;

  const file = path.join(os.homedir(), ".fintecia", "install-id");
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (/^[0-9a-f-]{36}$/.test(existing)) {
      cached = existing;
      return existing;
    }
  } catch {
    // no file yet → generate
  }

  const id = randomUUID();
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, id, { mode: 0o600 });
  } catch {
    // best-effort persistence; a fresh ID next run is acceptable
  }
  cached = id;
  return id;
}
