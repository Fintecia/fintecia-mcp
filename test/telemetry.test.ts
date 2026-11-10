import { TelemetryClient } from "../src/telemetry/client.js";

function mockFetch(handler: (input: string, init?: RequestInit) => Response) {
  return handler as unknown as typeof fetch;
}

const ok = () => new Response("ok", { status: 200 });

describe("TelemetryClient", () => {
  test("emits and flushes a batch with install/session ids (no PII)", async () => {
    let url = "";
    let body: { events: Array<Record<string, unknown>> } = { events: [] };
    const client = new TelemetryClient({
      baseUrl: "https://api.fintecia.example",
      fetchFn: mockFetch((input, init) => {
        url = input;
        body = JSON.parse(String(init?.body));
        return ok();
      }),
    });

    client.emit("tool_called", { tool: "sat_efos_check", outcome: "success" });
    await client.flush();

    expect(url).toBe("https://api.fintecia.example/api/v1/telemetry/events");
    expect(body.events).toHaveLength(1);
    expect(body.events[0].event).toBe("tool_called");
    expect(body.events[0].installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.events[0].sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.events[0].agent).toBe("unknown");
  });

  test("does not flush when baseUrl is unset", async () => {
    let called = false;
    const client = new TelemetryClient({
      fetchFn: mockFetch(() => {
        called = true;
        return ok();
      }),
    });
    client.emit("x");
    await client.flush();
    expect(called).toBe(false);
  });

  test("swallows fetch errors (never fails the tool)", async () => {
    const client = new TelemetryClient({
      baseUrl: "https://x",
      fetchFn: mockFetch(() => {
        throw new Error("boom");
      }),
    });
    client.emit("x");
    await expect(client.flush()).resolves.toBeUndefined();
  });
});
