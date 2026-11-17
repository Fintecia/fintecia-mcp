import { randomUUID } from "node:crypto";
import { getInstallId } from "./installId.js";
import { getInstallRef } from "./installRef.js";

/**
 * First-party telemetry. The MCP buffers anonymous events (install-id +
 * session-id + tool name + outcome — NO raw args, NO PII) and flushes them to
 * the Fintecia backend, which ingests them into BigQuery (T7 backend).
 *
 * `source.channel` carries the install REF (a GA4 `client_id` written by the
 * landing's install.sh) for acquisition/funnel attribution.
 *
 * Best-effort and fire-and-forget: telemetry NEVER blocks or fails a tool.
 */

/**
 * Where an install came from. `agent` is the MCP host that launched this
 * server (Claude Desktop / Cursor / OpenCode / ChatGPT desktop / "unknown");
 * `channel` is the install REF — the GA4 `client_id` written by the landing's
 * install.sh to `~/.fintecia/install-ref` (see installRef.ts) — used for
 * funnel attribution. `null` when the REF is absent (direct/unknown).
 */
export interface TelemetrySource {
  agent: string;
  channel: string | null;
}

export interface TelemetryEvent {
  installId: string;
  sessionId: string;
  source: TelemetrySource;
  event: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface TelemetryClientConfig {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  maxBatchSize?: number;
  /**
   * The MCP host identity. Either a static (already-resolved) name, or a lazy
   * resolver read at emit time — after the `initialize` handshake has populated
   * `clientInfo`. The resolver form is what `createServer` wires to
   * `server.server.getClientVersion()`; the static form stays verbatim.
   */
  agent?: string | (() => string | undefined);
  /**
   * Install acquisition channel — the GA4 `client_id` from the landing's
   * install.sh, via `~/.fintecia/install-ref`. When `undefined`, it is
   * auto-resolved once via `getInstallRef()`; pass `null` to force "no
   * channel". Populates `source.channel` for funnel attribution.
   */
  channel?: string | null;
  /**
   * Telemetry opt-out (product decision, flujo-adquisicion.md §3c): default ON.
   * When `false`, `emit()` is a no-op — events are neither buffered nor flushed.
   * Production derives it from the `FINTECIA_TELEMETRY` env var (`off` / `0`).
   */
  enabled?: boolean;
}

const DEFAULT_MAX_BATCH = 20;

/**
 * Canonicalizes a client name read from the `initialize` handshake for the
 * `source.agent` field: trimmed and lowercased. Falls back to `"unknown"` when
 * absent/empty — `clientInfo` is SHOULD, not MUST (spec PR #3002), so not all
 * clients send it.
 */
export function normalizeAgent(name: string | undefined): string {
  const normalized = name?.trim().toLowerCase();
  return normalized || "unknown";
}

export class TelemetryClient {
  private readonly events: TelemetryEvent[] = [];
  private readonly installId = getInstallId();
  private readonly sessionId = randomUUID();
  private readonly agent: string | (() => string | undefined);
  private readonly enabled: boolean;
  private readonly channel: string | null;
  private flushing = false;

  constructor(private readonly config: TelemetryClientConfig = {}) {
    this.agent = config.agent ?? "unknown";
    this.enabled = config.enabled ?? true;
    this.channel = config.channel === undefined ? getInstallRef() : config.channel;
    // Flush any buffered events on shutdown (best-effort).
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => void this.flush());
    }
  }

  private resolveAgent(): string {
    return typeof this.agent === "function" ? normalizeAgent(this.agent()) : this.agent;
  }

  emit(event: string, data?: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.events.push({
      installId: this.installId,
      sessionId: this.sessionId,
      source: { agent: this.resolveAgent(), channel: this.channel },
      event,
      timestamp: new Date().toISOString(),
      data,
    });
    if (this.events.length >= (this.config.maxBatchSize ?? DEFAULT_MAX_BATCH)) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.events.length === 0 || !this.config.baseUrl || this.flushing) return;
    this.flushing = true;
    const batch = this.events.splice(0);
    try {
      const fn = this.config.fetchFn ?? fetch;
      await fn(`${this.config.baseUrl}/api/v1/telemetry/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      // best-effort: a telemetry failure is never surfaced.
    } finally {
      this.flushing = false;
    }
  }
}
