// Smoke test: `source.agent` in telemetry is populated from the MCP
// `initialize` handshake's `clientInfo.name` (normalized to lowercase), and
// falls back to `"unknown"` when the name is absent/empty (`clientInfo` is
// SHOULD, not MUST — spec PR #3002). Drives a real handshake over an in-memory
// transport, so it exercises the exact `server.server.getClientVersion()` seam
// that `src/server.ts` wires into the telemetry client.
import { InMemoryTransport, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import type { JSONRPCMessage } from "@modelcontextprotocol/server";
import { createServer } from "../../src/server.js";

type CapturedBody = { events: Array<Record<string, unknown>> };

function request(
  transport: InMemoryTransport,
  message: JSONRPCMessage,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for MCP response")), 5000);
    const prev = transport.onmessage;
    transport.onmessage = (msg) => {
      clearTimeout(timer);
      transport.onmessage = prev;
      resolve(msg as unknown as Record<string, unknown>);
    };
    transport.send(message).catch(reject);
  });
}

async function runHandshake(clientInfoName: string): Promise<CapturedBody> {
  const bodies: CapturedBody[] = [];
  const fetchFn = (async (_input: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as CapturedBody);
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;

  // maxBatchSize: 1 → a single tool_called emit flushes immediately.
  const server = createServer({
    telemetry: { baseUrl: "https://api.fintecia.example", fetchFn, maxBatchSize: 1 },
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const init = await request(clientTransport, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientInfoName, version: "1.0.0" },
    },
  });
  if (init.error) {
    throw new Error(`initialize failed: ${JSON.stringify(init)}`);
  }

  await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" });

  // fintecia_efirmas is a local, read-only, telemetry-emitting tool (no auth,
  // no network). It proves the handshake clientInfo reaches the emitted payload.
  const call = await request(clientTransport, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "fintecia_efirmas", arguments: {} },
  });
  if (call.error) {
    throw new Error(`tools/call failed: ${JSON.stringify(call)}`);
  }

  await server.close();

  if (bodies.length !== 1) {
    throw new Error(`expected exactly 1 flushed telemetry batch, got ${bodies.length}`);
  }
  return bodies[0];
}

const withAgent = await runHandshake("Claude Desktop");
if (withAgent.events.length !== 1 || withAgent.events[0].source?.agent !== "claude desktop") {
  throw new Error(`source.agent not populated from clientInfo: ${JSON.stringify(withAgent)}`);
}

const fallback = await runHandshake("");
if (fallback.events.length !== 1 || fallback.events[0].source?.agent !== "unknown") {
  throw new Error(`source.agent should fall back to unknown: ${JSON.stringify(fallback)}`);
}

console.log("OK: source.agent populated from clientInfo + falls back to unknown");
