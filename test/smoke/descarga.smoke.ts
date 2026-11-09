// Smoke test for the DescargaClient nodecfdi seam (runs via tsx; no SAT network).
// Verifies: service construction and query-parameter building — the two
// nodecfdi seams — without talking to the real SAT. CFDI XML parsing is NOT
// tested here: the client uploads the ZIP and the backend parses it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { inspectFiel } from "../../src/fiel/fiel.js";
import { buildQueryParameters, createService } from "../../src/sat/descarga.js";

const cer = readFileSync(path.resolve("test/fixtures/fiel.cer"), "utf8");
const key = readFileSync(path.resolve("test/fixtures/fiel.key"), "utf8");

const { fiel } = inspectFiel(cer, key, "");

// 1. Service seam: FielRequestBuilder + HttpsWebClient + Service all construct.
const service = createService(fiel, 60_000);
for (const method of ["query", "verify", "download"] as const) {
  if (typeof service[method] !== "function") {
    throw new Error(`createService no expone ${method}`);
  }
}

// 2. Query parameters: emitidos → issued (RfcEmisor); recibidos → received
//    (RfcReceptor) with DocumentStatus active ("1").
const emitidos = buildQueryParameters(
  { desde: "2026-01-01", hasta: "2026-01-31" },
  "emitidos",
);
if (emitidos.getDownloadType().value() !== "RfcEmisor") {
  throw new Error(`expected RfcEmisor, got ${emitidos.getDownloadType().value()}`);
}

const recibidos = buildQueryParameters(
  { desde: "2026-01-01", hasta: "2026-01-31" },
  "recibidos",
);
if (recibidos.getDownloadType().value() !== "RfcReceptor") {
  throw new Error(`expected RfcReceptor, got ${recibidos.getDownloadType().value()}`);
}
if (recibidos.getDocumentStatus().value() !== "1") {
  throw new Error(
    `expected active document status ("1"), got ${recibidos.getDocumentStatus().value()}`,
  );
}

console.log(`OK: descarga seam (service + query params) — RFC=${fiel.getRfc()}`);
