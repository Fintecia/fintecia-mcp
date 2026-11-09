import {
  DateTimePeriod,
  DocumentStatus,
  DownloadType,
  Fiel,
  FielRequestBuilder,
  HttpsWebClient,
  QueryParameters,
  RequestType,
  Service,
} from "@nodecfdi/sat-ws-descarga-masiva";
import { inspectFiel } from "../fiel/fiel.js";
import type { FielMaterial } from "./fielProvider.js";
import {
  type DescargaTipo,
  type DownloadPhase,
  type Period,
} from "./parse.js";

/**
 * DescargaMasiva client (T2) — runs the 4-step flow against the SAT using the
 * LOCAL e-firma (the key never leaves the machine).
 *
 *   Autentica (token, short-lived — handled by the library during query)
 *   → Solicitud (SolicitaDescarga, emitidos/recibidos, per period)
 *   → Verificación (poll for package ids)
 *   → Descarga (zip of CFDI XMLs)
 *
 * nodecfdi (`@nodecfdi/sat-ws-descarga-masiva`) is ESM-only: this whole module
 * is a nodecfdi seam, tested via `tsx` smoke (never jest). Pure parsing/arg
 * validation lives in `parse.ts` and IS jest-tested.
 */

export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_MAX_POLL_ATTEMPTS = 120; // ~10 minutes at 5s

export interface DescargaClientOptions {
  /** Per HTTP call timeout (ms) passed to nodecfdi's HttpsWebClient. */
  timeoutMs?: number;
  /** Delay between VerificaSolicitudDescarga polls. */
  pollIntervalMs?: number;
  /** Max verify attempts before giving up. */
  maxPollAttempts?: number;
  /** Progress callback (Autentica → Solicitud → Verificación → Descarga). */
  onPhase?: (phase: DownloadPhase) => void;
}

export class DescargaClient {
  constructor(private readonly options: DescargaClientOptions = {}) {}

  /**
   * Run the full flow and return the downloaded package ZIPs (base64) — NOT
   * extracted: the client uploads the ZIPs as-is and the backend reuses its
   * own `ingestZipBuffer` (same as the web app's `processCfdiZip`). A period
   * with no invoices yields an empty array, not an error.
   */
  async descargar(
    material: FielMaterial,
    periodo: Period,
    tipo: DescargaTipo,
  ): Promise<string[]> {
    const { fiel } = inspectFiel(material.cer, material.key, material.password);

    const service = createService(fiel, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    // Autentica + Solicitud (the library authenticates + signs inside query()).
    this.options.onPhase?.("autentica");
    const params = buildQueryParameters(periodo, tipo);
    const queryResult = await service.query(params);
    if (!queryResult.getStatus().isAccepted()) {
      throw new Error(
        `SAT rechazó la solicitud: ${queryResult.getStatus().getMessage()}`,
      );
    }
    const requestId = queryResult.getRequestId();

    // Verificación — poll until the SAT marks the request Finished.
    this.options.onPhase?.("verificacion");
    const packageIds = await pollPackages(service, requestId, {
      intervalMs: this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      maxAttempts: this.options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
    });

    // Descarga — one zip per package id.
    this.options.onPhase?.("descarga");
    const zips: string[] = [];
    for (const packageId of packageIds) {
      const result = await service.download(packageId);
      if (!result.getStatus().isAccepted()) {
        throw new Error(
          `SAT rechazó la descarga del paquete ${packageId}: ${result.getStatus().getMessage()}`,
        );
      }
      zips.push(result.getPackageContent());
    }
    return zips;
  }
}

/** Build a configured nodecfdi Service for a validated FIEL. */
export function createService(fiel: Fiel, timeoutMs: number): Service {
  const requestBuilder = new FielRequestBuilder(fiel);
  const webClient = new HttpsWebClient(undefined, undefined, timeoutMs);
  return new Service(requestBuilder, webClient);
}

/** Build the SolicitaDescarga query parameters for a period + tipo. */
export function buildQueryParameters(periodo: Period, tipo: DescargaTipo): QueryParameters {
  const downloadType = new DownloadType(tipo === "emitidos" ? "issued" : "received");
  const period = DateTimePeriod.createFromValues(
    `${periodo.desde} 00:00:00`,
    `${periodo.hasta} 23:59:59`,
  );
  const requestType = new RequestType("xml");
  const parameters = QueryParameters.create(period, downloadType, requestType);
  // SAT rule: received+XML queries must use DocumentStatus "active" (the
  // default "Todos" is rejected for received XML downloads). Mirrors the
  // Fintecia backend (`requestSubmitter.ts`).
  if (tipo === "recibidos") {
    parameters.withDocumentStatus(new DocumentStatus("active"));
  }
  return parameters;
}

async function pollPackages(
  service: Service,
  requestId: string,
  opts: { intervalMs: number; maxAttempts: number },
): Promise<string[]> {
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    const result = await service.verify(requestId);
    if (!result.getStatus().isAccepted()) {
      throw new Error(`SAT verificó con error: ${result.getStatus().getMessage()}`);
    }
    const statusRequest = result.getStatusRequest();
    if (statusRequest.isTypeOf("Finished")) {
      return result.getPackageIds();
    }
    // EmptyResult: the period has no invoices for this tipo — a NORMAL empty
    // result, not an error (mirrors the backend's poller).
    if (statusRequest.isTypeOf("Rejected") && result.getCodeRequest().getEntryId() === "EmptyResult") {
      return [];
    }
    if (
      statusRequest.isTypeOf("Failure") ||
      statusRequest.isTypeOf("Rejected") ||
      statusRequest.isTypeOf("Expired")
    ) {
      throw new Error(`SAT rechazó la solicitud ${requestId}: ${statusRequest.getEntryId()}`);
    }
    // Accepted / InProgress → wait before the next verify.
    await sleep(opts.intervalMs);
  }
  throw new Error(
    `SAT no terminó la solicitud ${requestId} tras ${opts.maxAttempts} intentos`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
