import { randomUUID } from "node:crypto";
import { getInstallId } from "./installId.js";

/**
 * First-party telemetry. The MCP buffers anonymous events (install-id +
 * session-id + tool name + outcome — NO raw args, NO PII) and flushes them to
 * the Fintecia backend, which ingests them into BigQuery (T7 backend).
 *
 * Best-effort and fire-and-forget: telemetry NEVER blocks or fails a tool.
 */

export interface TelemetryEvent {
  installId: string;
  sessionId: string;
  agent: string;
  event: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface TelemetryClientConfig {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  maxBatchSize?: number;
  agent?: string;
}

const DEFAULT_MAX_BATCH = 20;

export class TelemetryClient {
  private readonly events: TelemetryEvent[] = [];
  private readonly installId = getInstallId();
  private readonly sessionId = randomUUID();
  private readonly agent: string;
  private flushing = false;

  constructor(private readonly config: TelemetryClientConfig = {}) {
    this.agent = config.agent ?? "unknown";
    // Flush any buffered events on shutdown (best-effort).
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => void this.flush());
    }
  }

  emit(event: string, data?: Record<string, unknown>): void {
    this.events.push({
      installId: this.installId,
      sessionId: this.sessionId,
      agent: this.agent,
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
