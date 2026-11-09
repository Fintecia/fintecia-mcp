import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EfosLookup, normalizeRfc } from "./public/efos.js";
import {
  validateDownloadArgs,
  type DescargaTipo,
  type DownloadPhase,
  type DownloadedCfdi,
  type DownloadArgs,
} from "./sat/parse.js";
import { UploadClient } from "./sat/upload.js";
import {
  InMemoryFielProvider,
  type FielMaterial,
  type FielProvider,
} from "./sat/fielProvider.js";
import { InMemoryJobStore, type DownloadJob, type JobStore } from "./sat/jobs.js";

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
  const fielProvider = deps.fielProvider ?? new InMemoryFielProvider();
  const jobStore = deps.jobStore ?? new InMemoryJobStore();

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

  // Everything else keeps a stub until its task lands.
  for (const name of [
    "sat_debts_check",
    "cfdi_verify",
    "fintecia_profile",
    "fintecia_transactions",
    "fintecia_cfdi",
    "fintecia_financials",
    "fintecia_reconciliation",
    "fintecia_tax_summary",
    "fintecia_risk_report",
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

  const all: DownloadedCfdi[] = [];
  for (const tipo of tipos) {
    const cfdis = await client.descargar(
      material,
      { desde: args.desde, hasta: args.hasta },
      tipo,
    );
    all.push(...cfdis);
  }

  // No invoices → nothing to upload; complete the job as an empty result.
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
      cfdiCount: all.length,
    },
  });
}

async function uploadBatch(
  deps: HandlerDeps,
  taxpayerRfc: string,
  cfdis: DownloadedCfdi[],
): Promise<{ accepted: number; rejected: Array<{ uuid: string; reason: string }> }> {
  if (!deps.uploadBaseUrl) {
    throw new Error("uploadBaseUrl no configurado (definí FINTECIA_API_URL)");
  }
  const idToken = await (deps.getAuthToken?.() ?? Promise.resolve(null));
  if (!idToken) {
    throw new Error("No autenticado: falta el idToken del device flow (T3)");
  }
  const client = new UploadClient({
    baseUrl: deps.uploadBaseUrl,
    idToken,
    fetchFn: deps.fetchFn,
  });
  return client.upload({ taxpayerRfc, cfdis });
}
