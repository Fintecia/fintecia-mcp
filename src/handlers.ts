import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EfosLookup, normalizeRfc } from "./public/efos.js";
import { buildExpresionImpresa, VerificationClient } from "./public/verify.js";
import {
  validateDownloadArgs,
  type DescargaTipo,
  type DownloadPhase,
  type DownloadArgs,
} from "./sat/parse.js";
import { UploadClient, type UploadRejection } from "./sat/upload.js";
import {
  InMemoryFielProvider,
  type FielMaterial,
  type FielProvider,
} from "./sat/fielProvider.js";
import { InMemoryJobStore, type DownloadJob, type JobStore } from "./sat/jobs.js";
import { ReadClient } from "./fin/read.js";

/**
 * Tool handlers. Real implementations are wired here as they land (T1b+);
 * un-implemented tools keep a stub that names the pending task.
 *
 * The e-firma NEVER leaves the machine: `cfdi_download` resolves the FIEL
 * material locally through a `FielProvider` (`.cer` + `.key` + re-entered
 * password) and only uploads the resulting CFDIs to Fintecia.
 */

export type ToolResult = { content: Array<{ type: "text"; text: string }> };
export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

export interface HandlerDeps {
  /** Local FIEL resolver. T1b wires the keychain; T2 ships the in-memory stub. */
  fielProvider?: FielProvider;
  /** Download job registry (in-memory in T2). */
  jobStore?: JobStore;
  /** Fintecia backend base URL for the upload endpoint (FINTECIA_API_URL). */
  uploadBaseUrl?: string;
  /** Resolves the current Firebase ID token (T3 wires the device-flow session). */
  getAuthToken?: () => Promise<string | null>;
  /** Injectable fetch for the upload client (tests). */
  fetchFn?: typeof fetch;
}

function loadEfos(): EfosLookup {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const json = readFileSync(
    path.join(here, "public", "data", "efos.fixture.json"),
    "utf8",
  );
  return EfosLookup.fromJson(JSON.parse(json));
}

function loadDebts(): EfosLookup {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const json = readFileSync(
    path.join(here, "public", "data", "debts.fixture.json"),
    "utf8",
  );
  return EfosLookup.fromJson(JSON.parse(json));
}

function stub(name: string): ToolHandler {
  return async () => ({
    content: [
      {
        type: "text",
        text: `[fintecia-mcp] "${name}" is defined but not yet implemented (T1–T8).`,
      },
    ],
  });
}

function text(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}

function json(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function createHandlers(deps: HandlerDeps = {}): Map<string, ToolHandler> {
  const efos = loadEfos();
  const debts = loadDebts();
  const fielProvider = deps.fielProvider ?? new InMemoryFielProvider();
  const jobStore = deps.jobStore ?? new InMemoryJobStore();

  const readClient = new ReadClient({
    baseUrl: deps.uploadBaseUrl ?? "",
    getAuthToken: deps.getAuthToken ?? (async () => null),
    fetchFn: deps.fetchFn,
  });

  const handlers = new Map<string, ToolHandler>();

  handlers.set("sat_efos_check", async (input) => {
    const rfc = normalizeRfc(String(input.rfc ?? ""));
    const entry = efos.check(rfc);
    if (!entry) {
      return text(
        `RFC ${rfc}: no aparece en el listado 69-B (operaciones presuntamente inexistentes).`,
      );
    }
    const oficio = entry.oficio ? ` · oficio ${entry.oficio}` : "";
    return text(
      `RFC ${entry.rfc}: ${entry.situacion.toUpperCase()}${oficio} — ${entry.nombre}.`,
    );
  });

  handlers.set("sat_debts_check", async (input) => {
    const rfc = normalizeRfc(String(input.rfc ?? ""));
    const entry = debts.check(rfc);
    if (!entry) {
      return text(
        `RFC ${rfc}: no aparece en el listado art. 69 (créditos fiscales firmes).`,
      );
    }
    return text(
      `RFC ${entry.rfc}: crédito fiscal firme (art. 69) — ${entry.nombre}.`,
    );
  });

  handlers.set("cfdi_verify", async (input) => {
    const uuid = String(input.uuid ?? "");
    const emisorRfc = String(input.emisorRfc ?? "");
    const receptorRfc = String(input.receptorRfc ?? "");
    const total = Number(input.total);

    if (!uuid || !emisorRfc || !receptorRfc || !Number.isFinite(total)) {
      return text(
        "cfdi_verify: se requieren uuid, emisorRfc, receptorRfc y total (o xmlBase64).",
      );
    }

    const expresion = buildExpresionImpresa({ emisorRfc, receptorRfc, total, uuid });
    const client = new VerificationClient(deps.fetchFn ?? fetch);
    const result = await client.consulta(expresion);

    const efos = result.validacionEfos
      ? ` · ValidacionEFOS ${result.validacionEfos}`
      : "";
    return text(
      `CFDI ${uuid}: ${result.estado}${efos}${result.codigoEstatus ? ` · ${result.codigoEstatus}` : ""}.`,
    );
  });

  handlers.set("cfdi_download", async (input) => {
    const args = validateDownloadArgs(input);
    const material = await fielProvider.load(args.rfc);
    if (!material) {
      throw new Error(
        `No hay e-firma local registrada para el RFC ${args.rfc}. ` +
          `Conectá la e-firma primero (vinculación T1b).`,
      );
    }
    const job = jobStore.create({
      tipo: args.tipo,
      desde: args.desde,
      hasta: args.hasta,
      rfc: args.rfc,
    });
    // Async by contract: fire the download+upload in the background, surface
    // the job id immediately. Failures land on the job (not lost): the agent
    // reads them via cfdi_download_status.
    void runDownloadJob(job, material, args, { deps, jobStore }).catch((err) => {
      jobStore.update(job.jobId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date().toISOString(),
      });
    });
    return json({
      jobId: job.jobId,
      status: "running",
      tipo: args.tipo,
      desde: args.desde,
      hasta: args.hasta,
      rfc: args.rfc,
    });
  });

  handlers.set("cfdi_download_status", async (input) => {
    const jobId = String(input.jobId ?? "");
    const job = jobStore.get(jobId);
    if (!job) {
      throw new Error(`Job no encontrado: ${jobId}`);
    }
    return json(job);
  });

  handlers.set("cfdi_sync_status", async () => {
    const last = jobStore.lastCompleted();
    if (!last) {
      return text("Sin descargas completadas en esta sesión.");
    }
    return json({
      lastCompletedAt: last.finishedAt,
      lastDownload: {
        rfc: last.rfc,
        tipo: last.tipo,
        desde: last.desde,
        hasta: last.hasta,
        accepted: last.result?.accepted ?? 0,
        rejected: last.result?.rejected ?? 0,
        cfdiCount: last.result?.cfdiCount ?? 0,
      },
    });
  });

  handlers.set("fintecia_financials", async (input) => {
    const taxpayerRfc = String(input.taxpayerRfc ?? "");
    return json(
      await readClient.read("/api/v1/mcp/financials", taxpayerRfc, {
        ...(typeof input.hasta === "string"
          ? { periodKey: input.hasta.slice(0, 7) }
          : {}),
      }),
    );
  });

  handlers.set("fintecia_reconciliation", async (input) => {
    const taxpayerRfc = String(input.taxpayerRfc ?? "");
    return json(await readClient.read("/api/v1/mcp/reconciliation", taxpayerRfc));
  });

  handlers.set("fintecia_cfdi", async (input) => {
    const taxpayerRfc = String(input.taxpayerRfc ?? "");
    const { taxpayerRfc: _t, ...filters } = input;
    return json(await readClient.read("/api/v1/mcp/cfdi", taxpayerRfc, filters));
  });

  handlers.set("fintecia_risk_report", async (input) => {
    const taxpayerRfc = String(input.taxpayerRfc ?? "");
    return json(await readClient.read("/api/v1/mcp/risk-report", taxpayerRfc));
  });

  handlers.set("fintecia_profile", async () => {
    return json(await readClient.readRaw("/api/v1/mcp/profile"));
  });

  handlers.set("fintecia_tax_summary", async (input) => {
    const taxpayerRfc = String(input.taxpayerRfc ?? "");
    const periodKey = String(input.periodo ?? "");
    return json(
      await readClient.read("/api/v1/mcp/tax-summary", taxpayerRfc, { periodKey }),
    );
  });

  // Everything else keeps a stub until its task lands.
  for (const name of [
    "fintecia_transactions",
    "fintecia_risk_check",
    "fintecia_deductibility",
  ]) {
    if (!handlers.has(name)) handlers.set(name, stub(name));
  }

  return handlers;
}

/**
 * Background download + upload orchestration. Lazy-imports the nodecfdi seam
 * so jest (which loads handlers.ts) never pulls nodecfdi at runtime.
 */
async function runDownloadJob(
  job: DownloadJob,
  material: FielMaterial,
  args: DownloadArgs,
  ctx: { deps: HandlerDeps; jobStore: JobStore },
): Promise<void> {
  const { deps, jobStore } = ctx;
  const { DescargaClient } = await import("./sat/descarga.js");

  const tipos: DescargaTipo[] =
    args.tipo === "ambos" ? ["emitidos", "recibidos"] : [args.tipo];

  const client = new DescargaClient({
    onPhase: (phase: DownloadPhase) => jobStore.update(job.jobId, { phase }),
  });

  const all: string[] = [];
  for (const tipo of tipos) {
    const zips = await client.descargar(
      material,
      { desde: args.desde, hasta: args.hasta },
      tipo,
    );
    all.push(...zips);
  }

  // No packages → nothing to upload; complete the job as an empty result.
  if (all.length === 0) {
    jobStore.update(job.jobId, {
      status: "completed",
      phase: "upload",
      finishedAt: new Date().toISOString(),
      result: { accepted: 0, rejected: 0, cfdiCount: 0 },
    });
    return;
  }

  jobStore.update(job.jobId, { phase: "upload" });
  const uploadResult = await uploadBatch(deps, args.rfc, all);

  jobStore.update(job.jobId, {
    status: "completed",
    phase: "upload",
    finishedAt: new Date().toISOString(),
    result: {
      accepted: uploadResult.accepted,
      rejected: uploadResult.rejected.length,
      cfdiCount: uploadResult.totalFiles,
    },
  });
}

async function uploadBatch(
  deps: HandlerDeps,
  taxpayerRfc: string,
  zips: string[],
): Promise<{ accepted: number; rejected: UploadRejection[]; totalFiles: number }> {
  if (!deps.uploadBaseUrl) {
    throw new Error("uploadBaseUrl no configurado (definí FINTECIA_API_URL)");
  }
  const idToken = await (deps.getAuthToken?.() ?? Promise.resolve(null));
  if (!idToken) {
    throw new Error("No autenticado: falta el idToken (loopback / fintecia_login)");
  }
  const client = new UploadClient({
    baseUrl: deps.uploadBaseUrl,
    idToken,
    fetchFn: deps.fetchFn,
  });

  let accepted = 0;
  let totalFiles = 0;
  const rejected: UploadRejection[] = [];
  for (const zip of zips) {
    const result = await client.upload({ taxpayerRfc, zipBase64: zip });
    accepted += result.accepted;
    totalFiles += result.totalFiles ?? 0;
    rejected.push(...result.rejected);
  }
  return { accepted, rejected, totalFiles };
}
