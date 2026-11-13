import { normalizeAgent, TelemetryClient } from "../src/telemetry/client.js";

function mockFetch(handler: (input: string, init?: RequestInit) => Response) {
  return handler as unknown as typeof fetch;
}

const ok = () => new Response("ok", { status: 200 });

function capture(agent?: string | (() => string | undefined)) {
  const state = { url: "", events: [] as Array<Record<string, unknown>> };
  const client = new TelemetryClient({
    baseUrl: "https://api.fintecia.example",
    ...(agent !== undefined ? { agent } : {}),
    fetchFn: mockFetch((input, init) => {
      state.url = input;
      state.events = JSON.parse(String(init?.body)).events;
      return ok();
    }),
  });
  return { client, state };
}

describe("TelemetryClient", () => {
  test("emits and flushes a batch with install/session ids and a structured source (no PII)", async () => {
    const { client, state } = capture();

    client.emit("tool_called", { tool: "sat_efos_check", outcome: "success" });
    await client.flush();

    expect(state.url).toBe("https://api.fintecia.example/api/v1/telemetry/events");
    expect(state.events).toHaveLength(1);
    expect(state.events[0].event).toBe("tool_called");
    expect(state.events[0].installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.events[0].sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.events[0].source).toEqual({ agent: "unknown", channel: null });
  });

  test("source.agent carries the configured agent identity", async () => {
    const { client, state } = capture("Claude Desktop");

    client.emit("tool_called", {});
    await client.flush();

    expect(state.events[0].source).toEqual({ agent: "Claude Desktop", channel: null });
  });

  test("source.channel stays null across every event (no referrer/UTM mechanism yet)", async () => {
    const { client, state } = capture();

    client.emit("first_run");
    client.emit("login_started");
    client.emit("fiel_loaded");
    client.emit("download_completed");
    await client.flush();

    expect(state.events).toHaveLength(4);
    for (const event of state.events) {
      expect(event.source).toEqual({ agent: "unknown", channel: null });
    }
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

describe("normalizeAgent", () => {
  test("lowercases and trims the client name", () => {
    expect(normalizeAgent("Claude Desktop")).toBe("claude desktop");
    expect(normalizeAgent("  CURSOR  ")).toBe("cursor");
  });

  test("falls back to unknown when clientInfo is absent or empty", () => {
    expect(normalizeAgent(undefined)).toBe("unknown");
    expect(normalizeAgent("")).toBe("unknown");
    expect(normalizeAgent("   ")).toBe("unknown");
  });
});

describe("TelemetryClient agent resolver (initialize handshake)", () => {
  test("resolves source.agent from clientInfo at emit time", async () => {
    let name: string | undefined = "Claude Desktop";
    const { client, state } = capture(() => name);

    client.emit("tool_called", {});
    await client.flush();

    expect(state.events[0].source).toEqual({ agent: "claude desktop", channel: null });
  });

  test("falls back to unknown when the resolver yields no clientInfo", async () => {
    const { client, state } = capture(() => undefined);

    client.emit("tool_called", {});
    await client.flush();

    expect(state.events[0].source).toEqual({ agent: "unknown", channel: null });
  });
});
