// Smoke test for the cfdi_* + public-lookup handler wiring (runs via tsx / ESM).
//
// Only the non-network paths are covered: the SAT public-list lookups use an
// injected fetchFn (no live backend), and the SAT flow itself is the
// descarga.smoke.ts seam + a manual run.
import { createHandlers } from "../../src/handlers.js";
import { InMemoryJobStore } from "../../src/sat/jobs.js";
import { InMemoryFielProvider } from "../../src/sat/fielProvider.js";

function text(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

async function rejects(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  if (!caught) {
    throw new Error(`expected rejection matching ${pattern}, but it resolved`);
  }
  const message = caught instanceof Error ? caught.message : String(caught);
  if (!pattern.test(message)) {
    throw new Error(`expected rejection matching ${pattern}, got: ${message}`);
  }
}

const handlers = createHandlers();

for (const name of ["cfdi_download", "cfdi_download_status", "cfdi_sync_status", "fintecia_efirmas"] as const) {
  if (!handlers.has(name)) {
    throw new Error(`createHandlers no expone ${name}`);
  }
}

// cfdi_download rejects invalid input (before any nodecfdi import).
await rejects(
  handlers.get("cfdi_download")!({ tipo: "nope", desde: "2026-01-01", hasta: "2026-01-31", rfc: "AAA010101AAA" }),
  /tipo/,
);

// cfdi_download rejects when unauthenticated (before touching SAT / FIEL).
await rejects(
  createHandlers().get("cfdi_download")!({
    tipo: "emitidos",
    desde: "2026-01-01",
    hasta: "2026-01-31",
    rfc: "AAA010101AAA",
  }),
  /Iniciá sesión primero/,
);

// cfdi_download rejects when no FIEL is registered for the RFC (with auth present).
await rejects(
  createHandlers({
    fielProvider: new InMemoryFielProvider(),
    getAuthToken: async () => "test-id-token",
  }).get("cfdi_download")!({
    tipo: "emitidos",
    desde: "2026-01-01",
    hasta: "2026-01-31",
    rfc: "AAA010101AAA",
  }),
  /e-firma/,
);

// cfdi_download_status reports a known job.
const store = new InMemoryJobStore();
const job = store.create({ tipo: "emitidos", desde: "2026-01-01", hasta: "2026-01-31", rfc: "AAA010101AAA" });
const statusResult = await createHandlers({ jobStore: store }).get("cfdi_download_status")!({ jobId: job.jobId });
const status = JSON.parse(text(statusResult));
if (status.jobId !== job.jobId || status.status !== "running") {
  throw new Error(`unexpected cfdi_download_status payload: ${text(statusResult)}`);
}

// cfdi_download_status throws for an unknown job.
await rejects(handlers.get("cfdi_download_status")!({ jobId: "missing" }), /no encontrado/);

// cfdi_sync_status reports the last completed download.
store.update(job.jobId, {
  status: "completed",
  finishedAt: "2026-01-31T10:00:00Z",
  result: { accepted: 5, rejected: 1, cfdiCount: 6 },
});
const syncResult = await createHandlers({ jobStore: store }).get("cfdi_sync_status")!({});
const sync = JSON.parse(text(syncResult));
if (sync.lastCompletedAt !== "2026-01-31T10:00:00Z" || sync.lastDownload.accepted !== 5) {
  throw new Error(`unexpected cfdi_sync_status payload: ${text(syncResult)}`);
}

// cfdi_sync_status reports no downloads when empty.
const empty = text(await createHandlers().get("cfdi_sync_status")!({}));
if (!/Sin descargas/.test(empty)) {
  throw new Error(`unexpected empty cfdi_sync_status: ${empty}`);
}

// sat_efos_check now hits the backend (auth, not e-firma) — no local fixture.
// Without a session it must reject (never return stale fixture data).
await rejects(
  handlers.get("sat_efos_check")!({ rfc: "AAA120730823" }),
  /Iniciá sesión/,
);

// With a session + backend, sat_efos_check returns the backend entry.
const efosBackend = createHandlers({
  getAuthToken: async () => "id-token",
  fetchFn: (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      found: true,
      entry: { rfc: "AAA120730823", nombre: "A SA", situacion: "definitivo" },
    }),
  })) as unknown as typeof fetch,
}).get("sat_efos_check")!({ rfc: "aaa120730823" });
if (!/DEFINITIVO/.test(text(await efosBackend))) {
  throw new Error(`unexpected sat_efos_check backend output: ${text(await efosBackend)}`);
}

// fintecia_efirmas returns the list from the listEfirmas dep (empty by default).
const efirmasEmpty = JSON.parse(text(await createHandlers().get("fintecia_efirmas")!({})));
if (!Array.isArray(efirmasEmpty.efirmas)) {
  throw new Error(`unexpected fintecia_efirmas: ${JSON.stringify(efirmasEmpty)}`);
}
const withList = createHandlers({
  listEfirmas: async () => [{ rfc: "AAA010101AAA", hasPassword: true }],
});
const efirmasList = JSON.parse(text(await withList.get("fintecia_efirmas")!({})));
if (efirmasList.efirmas[0]?.rfc !== "AAA010101AAA" || efirmasList.efirmas[0]?.hasPassword !== true) {
  throw new Error(`unexpected fintecia_efirmas list: ${JSON.stringify(efirmasList)}`);
}

console.log("OK: cfdi_download / cfdi_download_status / cfdi_sync_status / fintecia_efirmas wiring");
