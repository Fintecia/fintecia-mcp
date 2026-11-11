#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import type { Server } from "node:http";
import { TOOLS } from "./tools.js";
import { createHandlers, type ToolHandler } from "./handlers.js";
import { FINANCIALS_GLOSSARY } from "./glossary.js";
import { TelemetryClient } from "./telemetry/client.js";
import { SessionStore } from "./auth/session.js";
import { FileFielStore } from "./fiel/store.js";
import { startOnboardServer } from "./onboard/server.js";
import { detectKeychain, fielKeychainKey } from "./keychain/keychain.js";
import { KeychainFielProvider } from "./sat/keychainFielProvider.js";
import { API_BASE_URL } from "./auth/firebaseConfig.js";

/**
 * Fintecia MCP server — local, read-only (+ local e-firma download).
 *
 * Auth is loopback OAuth: `fintecia_login` starts the local onboarding server
 * (127.0.0.1), the user signs in with Google via the Firebase Web SDK, and the
 * tokens land back in the in-process SessionStore. The upload handler reads the
 * ID token from that store.
 */

function createServer(): McpServer {
  const server = new McpServer({ name: "fintecia-mcp", version: "0.1.0" });
  const session = new SessionStore();
  const fielStore = new FileFielStore();
  const keychain = detectKeychain(process.platform);
  const fielProvider = new KeychainFielProvider(fielStore, keychain);

  const telemetry = new TelemetryClient({ baseUrl: API_BASE_URL });

  let onboard: { server: Server; url: string } | null = null;

  const handlers = createHandlers({
    fielProvider,
    uploadBaseUrl: API_BASE_URL,
    getAuthToken: async () => session.idToken,
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
        onboard = await startOnboardServer(fielStore, session);
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

serveStdio(createServer, {
  onerror: (error) => console.error("Fintecia MCP server error:", error),
});
