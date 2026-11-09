// Smoke test for the DescargaClient nodecfdi seam (runs via tsx; no SAT network).
// Verifies: service construction, query-parameter building, and zip → CFDI
// extraction — the three nodecfdi seams — without talking to the real SAT.
import { readFileSync } from "node:fs";
import path from "node:path";
import { inspectFiel } from "../../src/fiel/fiel.js";
import {
  buildQueryParameters,
  createService,
  extractCfdisFromZip,
} from "../../src/sat/descarga.js";

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

// 3. Zip → CFDI extraction seam using the committed fixture package.
const zipBase64 = readFileSync(
  path.resolve("test/fixtures/sat-package.zip"),
).toString("base64");
const cfdis = await extractCfdisFromZip(zipBase64, "emitido");
if (cfdis.length !== 1) {
  throw new Error(`expected 1 CFDI, got ${cfdis.length}`);
}
const c = cfdis[0];
if (c.uuid !== "6128396f-c09b-4ec6-8697-43d6e6ec1e51") {
  throw new Error(`unexpected uuid ${c.uuid}`);
}
if (c.emisorRfc !== "AAA010101AAA") {
  throw new Error(`unexpected emisor ${c.emisorRfc}`);
}
if (c.receptorRfc !== "BBB010101BBB") {
  throw new Error(`unexpected receptor ${c.receptorRfc}`);
}
if (c.total !== 1000) {
  throw new Error(`unexpected total ${c.total}`);
}
if (c.tipo !== "emitido") {
  throw new Error(`unexpected tipo ${c.tipo}`);
}

console.log(
  `OK: descarga seam (service + query params + zip extraction) — RFC=${fiel.getRfc()}`,
);
