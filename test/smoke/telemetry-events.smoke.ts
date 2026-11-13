// Smoke test for the activation telemetry events emitted by the download flow:
// download_started / download_completed / upload_completed / first_use_completed.
//
// Runs via tsx (the handler orchestrates a nodecfdi seam), so the SAT download
// client is injected as a fake (no SAT network) and the upload fetch is
// injected. Asserts the events fire with the right non-PII payloads and that no
// RFC / raw args leak into any payload.
import { createHandlers } from "../../src/handlers.js";
import { InMemoryJobStore } from "../../src/sat/jobs.js";
import { InMemoryFielProvider } from "../../src/sat/fielProvider.js";
import { FileDownloadArtifactStore } from "../../src/sat/artifacts.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type Captured = { event: string; data?: Record<string, unknown> };

async function waitFor(check: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timeout waiting for job completion");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const dir = mkdtempSync(path.join(tmpdir(), "telemetry-events-"));

try {
  const events: Captured[] = [];
  const emit = (event: string, data?: Record<string, unknown>) => events.push({ event, data });

  const fielProvider = new InMemoryFielProvider();
  fielProvider.set("AAA010101AAA", { cer: "fake-cer", key: "fake-key", password: "" });

  const jobStore = new InMemoryJobStore();

  const handlers = createHandlers({
    fielProvider,
    jobStore,
    artifactStore: new FileDownloadArtifactStore(dir),
    getAuthToken: async () => "test-id-token",
    uploadBaseUrl: "https://invalid.example",
    emit,
    descargaClient: {
      descargar: async () => ["ZmFrZQ=="], // base64("fake") — one fake package
    },
    fetchFn: (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accepted: 1, rejected: [], totalFiles: 1 }),
    })) as unknown as typeof fetch,
  });

  const result = await handlers.get("cfdi_download")!({
    tipo: "emitidos",
    desde: "2026-01-01",
    hasta: "2026-01-31",
    rfc: "AAA010101AAA",
  });
  const { jobId } = JSON.parse(result.content[0].text);

  // download_started fires synchronously in the handler (before the async job).
  const started = events.find((e) => e.event === "download_started");
  if (!started || started.data?.jobId !== jobId) {
    throw new Error(`download_started missing or wrong payload: ${JSON.stringify(events)}`);
  }

  await waitFor(() => jobStore.get(jobId)?.status === "completed");

  const byName = (name: string) => events.filter((e) => e.event === name);

  const completed = byName("download_completed");
  if (completed.length !== 1 || completed[0].data?.jobId !== jobId || completed[0].data?.packages !== 1) {
    throw new Error(`download_completed wrong payload: ${JSON.stringify(events)}`);
  }

  const firstUse = byName("first_use_completed");
  if (firstUse.length !== 1 || firstUse[0].data?.jobId !== jobId) {
    throw new Error(`first_use_completed wrong payload: ${JSON.stringify(events)}`);
  }

  const uploaded = byName("upload_completed");
  if (
    uploaded.length !== 1 ||
    uploaded[0].data?.jobId !== jobId ||
    uploaded[0].data?.accepted !== 1 ||
    uploaded[0].data?.rejected !== 0 ||
    uploaded[0].data?.cfdiCount !== 1
  ) {
    throw new Error(`upload_completed wrong payload: ${JSON.stringify(events)}`);
  }

  // No RFC / raw args / PII may leak into any telemetry payload.
  for (const e of events) {
    if (JSON.stringify(e).includes("AAA010101AAA")) {
      throw new Error(`telemetry leaked RFC: ${JSON.stringify(e)}`);
    }
  }

  console.log(`OK: download_started/download_completed/upload_completed/first_use_completed (jobId=${jobId})`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
