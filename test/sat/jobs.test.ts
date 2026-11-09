import { InMemoryJobStore } from "../../src/sat/jobs.js";

describe("InMemoryJobStore", () => {
  test("creates and gets a running job", () => {
    const store = new InMemoryJobStore();
    const job = store.create({
      tipo: "emitidos",
      desde: "2026-01-01",
      hasta: "2026-01-31",
      rfc: "AAA010101AAA",
    });
    expect(job.jobId).toBeTruthy();
    expect(job.status).toBe("running");
    expect(job.phase).toBe("autentica");
    expect(job.rfc).toBe("AAA010101AAA");
    expect(store.get(job.jobId)).toEqual(job);
  });

  test("updates a job by id", () => {
    const store = new InMemoryJobStore();
    const job = store.create({ tipo: "emitidos", desde: "1", hasta: "2", rfc: "A" });
    const updated = store.update(job.jobId, {
      status: "completed",
      phase: "upload",
      result: { accepted: 1, rejected: 0, cfdiCount: 1 },
    });
    expect(updated?.status).toBe("completed");
    expect(store.get(job.jobId)?.result?.accepted).toBe(1);
  });

  test("update returns undefined for an unknown id", () => {
    expect(new InMemoryJobStore().update("nope", { status: "completed" })).toBeUndefined();
  });

  test("lastCompleted returns the most recent completed job", () => {
    const store = new InMemoryJobStore();
    const a = store.create({ tipo: "emitidos", desde: "1", hasta: "2", rfc: "A" });
    const b = store.create({ tipo: "recibidos", desde: "1", hasta: "2", rfc: "B" });
    store.update(a.jobId, { status: "completed" });
    expect(store.lastCompleted()?.jobId).toBe(a.jobId);
    store.update(b.jobId, { status: "completed" });
    expect(store.lastCompleted()?.jobId).toBe(b.jobId);
  });

  test("lastCompleted skips failed jobs", () => {
    const store = new InMemoryJobStore();
    const a = store.create({ tipo: "emitidos", desde: "1", hasta: "2", rfc: "A" });
    store.update(a.jobId, { status: "failed" });
    expect(store.lastCompleted()).toBeUndefined();
  });

  test("get returns undefined for an unknown id", () => {
    expect(new InMemoryJobStore().get("nope")).toBeUndefined();
  });
});
