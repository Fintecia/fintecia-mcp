import { randomUUID } from "node:crypto";
import type { DownloadPhase } from "./parse.js";

/**
 * In-memory download job registry (T2).
 *
 * `cfdi_download` is async by contract: it starts a job and returns a job id;
 * `cfdi_download_status` polls it. T2 keeps jobs in memory (a restart loses
 * them); persistence is a later task. No nodecfdi here — jest-safe.
 */

export type DownloadJobStatus = "running" | "completed" | "failed";

export interface DownloadJobResult {
  accepted: number;
  rejected: number;
  cfdiCount: number;
}

export interface DownloadJob {
  jobId: string;
  status: DownloadJobStatus;
  phase: DownloadPhase;
  tipo: string;
  desde: string;
  hasta: string;
  rfc: string;
  startedAt: string;
  finishedAt?: string;
  result?: DownloadJobResult;
  error?: string;
}

export interface NewJobInput {
  tipo: string;
  desde: string;
  hasta: string;
  rfc: string;
}

export interface JobStore {
  create(input: NewJobInput): DownloadJob;
  get(jobId: string): DownloadJob | undefined;
  update(jobId: string, patch: Partial<DownloadJob>): DownloadJob | undefined;
  lastCompleted(): DownloadJob | undefined;
}

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, DownloadJob>();
  private readonly order: string[] = [];

  create(input: NewJobInput): DownloadJob {
    const job: DownloadJob = {
      jobId: randomUUID(),
      status: "running",
      phase: "autentica",
      tipo: input.tipo,
      desde: input.desde,
      hasta: input.hasta,
      rfc: input.rfc,
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(job.jobId, job);
    this.order.push(job.jobId);
    return job;
  }

  get(jobId: string): DownloadJob | undefined {
    return this.jobs.get(jobId);
  }

  update(jobId: string, patch: Partial<DownloadJob>): DownloadJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    const updated = { ...job, ...patch };
    this.jobs.set(jobId, updated);
    return updated;
  }

  lastCompleted(): DownloadJob | undefined {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const job = this.jobs.get(this.order[i]);
      if (job?.status === "completed") return job;
    }
    return undefined;
  }
}
