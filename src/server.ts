import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Server } from "node:http";
import { TOOLS } from "./tools.js";
import { createHandlers, type ToolHandler } from "./handlers.js";
import { FINANCIALS_GLOSSARY } from "./glossary.js";
import { TelemetryClient, type TelemetryClientConfig } from "./telemetry/client.js";
import { SessionStore } from "./auth/session.js";
import { FileFielStore } from "./fiel/store.js";
import { startOnboardServer } from "./onboard/server.js";
import { detectKeychain, fielKeychainKey } from "./keychain/keychain.js";
import { KeychainFielProvider } from "./sat/keychainFielProvider.js";
import { API_BASE_URL } from "./auth/firebaseConfig.js";

// Versión del servidor: leída de package.json (fuente única), no hardcodeada.
// `dist/server.js` resuelve `../package.json` a la raíz del paquete publicado.
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = (
  JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as {
    version: string;
  }
).version;

/**
 * Overridable dependencies for `createServer`. Used by tests (and the smoke
 * seam) to inject the telemetry transport; production passes nothing. `agent`
 * is never injectable — it is always derived from the `initialize` handshake.
 */
export interface CreateServerOptions {
  telemetry?: Omit<TelemetryClientConfig, "agent">;
}

/**
 * Fintecia MCP server — local, read-only (+ local e-firma download).
 *
 * Auth is loopback OAuth: `fintecia_login` starts the local onboarding server
 * (127.0.0.1), the user signs in with Google via the Firebase Web SDK, and the
 * tokens land back in the in-process SessionStore. The upload handler reads the
 * ID token from that store.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer({ name: "fintecia-mcp", version: PKG_VERSION });
  const session = new SessionStore();
  const fielStore = new FileFielStore();
  const keychain = detectKeychain(process.platform);
  const fielProvider = new KeychainFielProvider(fielStore, keychain);

  const telemetry = new TelemetryClient({
    baseUrl: API_BASE_URL,
    ...options.telemetry,
    // Resolved lazily at emit time (after the initialize handshake): the MCP
    // client's `clientInfo.name` (Claude Desktop / Cursor / OpenCode / ChatGPT
    // desktop). `getClientVersion()` returns `undefined` when clientInfo is
    // absent (it is SHOULD, not MUST — spec PR #3002), so this falls back to
    // "unknown" via normalizeAgent.
    agent: () => server.server.getClientVersion()?.name,
  });

  let onboard: { server: Server; url: string } | null = null;

  const handlers = createHandlers({
    fielProvider,
    uploadBaseUrl: API_BASE_URL,
    getAuthToken: async () => session.idToken,
    emit: (event, data) => telemetry.emit(event, data),
    listEfirmas: async () => {
      const rfcs = await fielStore.list();
      return Promise.all(
        rfcs.map(async (rfc) => ({
          rfc,
          hasPassword: (await keychain.get(fielKeychainKey(rfc))) !== null,
        })),
      );
    },
  });

  const withTelemetry = (name: string, handler: ToolHandler): ToolHandler => {
    return async (input) => {
      const start = Date.now();
      try {
        const result = await handler(input);
        telemetry.emit("tool_called", {
          tool: name,
          outcome: "success",
          durationMs: Date.now() - start,
        });
        return result;
      } catch (err) {
        telemetry.emit("tool_called", {
          tool: name,
          outcome: "error",
          durationMs: Date.now() - start,
        });
        throw err;
      }
    };
  };

  for (const tool of TOOLS) {
    const handler = handlers.get(tool.name);
    if (!handler) continue;

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      withTelemetry(tool.name, (input) => handler(input as Record<string, unknown>)),
    );
  }

  // Auth trigger (loopback). Not part of TOOLS: it is the setup entrypoint,
  // not a domain tool.
  server.registerTool(
    "fintecia_login",
    {
      description:
        "Start the local onboarding page (loopback OAuth) so the user can sign " +
        "in with Google and load their e-firma. Call this FIRST — the session " +
        "is required by every authenticated tool. After the user finishes, call " +
        "fintecia_efirmas to discover the registered e-firmas.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      telemetry.emit("login_started");
      if (!onboard) {
        onboard = await startOnboardServer(fielStore, session, undefined, undefined, () =>
          telemetry.emit("fiel_loaded"),
        );
      }
      return {
        content: [
          {
            type: "text",
            text:
              `Abrí esta URL en tu navegador para iniciar sesión con Google ` +
              `y conectar tu e-firma:\n\n${onboard.url}`,
          },
        ],
      };
    },
  );

  // Static field glossary — no auth, no backend round-trip. The agent can
  // load it during onboarding (in parallel with login + e-firma) to learn
  // the field semantics of fintecia_financials before it queries data.
  server.registerTool(
    "fintecia_glosario",
    {
      description:
        "Field dictionary for the fintecia_* tools: what every field means " +
        "(money objects, NIF B-3/B-6, taxes vs prepaid ISR, IVA in the balance). " +
        "Static and auth-free — call it once to interpret fintecia_financials.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ glosario: FINANCIALS_GLOSSARY }, null, 2),
        },
      ],
    }),
  );

  return server;
}
