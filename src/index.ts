import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import type { Server } from "node:http";
import { TOOLS } from "./tools.js";
import { createHandlers, type ToolHandler } from "./handlers.js";
import { TelemetryClient } from "./telemetry/client.js";
import { SessionStore } from "./auth/session.js";
import { FileFielStore } from "./fiel/store.js";
import { startOnboardServer } from "./onboard/server.js";
import { detectKeychain } from "./keychain/keychain.js";
import { KeychainFielProvider } from "./sat/keychainFielProvider.js";

/**
 * Fintecia MCP server — local, read-only (+ local e-firma download).
 *
 * Auth is loopback OAuth: `fintecia_login` starts the local onboarding server
 * (127.0.0.1), the user signs in with Google (+ MFA) via the Firebase Web SDK,
 * and the tokens land back in the in-process SessionStore. The upload handler
 * reads the ID token from that store.
 */

function createServer(): McpServer {
  const server = new McpServer({ name: "fintecia-mcp", version: "0.1.0" });
  const session = new SessionStore();
  const fielStore = new FileFielStore();
  const fielProvider = new KeychainFielProvider(
    fielStore,
    detectKeychain(process.platform),
  );

  const telemetry = new TelemetryClient({ baseUrl: process.env.FINTECIA_API_URL });

  let onboard: { server: Server; url: string } | null = null;

  const handlers = createHandlers({
    fielProvider,
    uploadBaseUrl: process.env.FINTECIA_API_URL,
    getAuthToken: async () => session.idToken,
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
        "in with Google (+ MFA) and load their e-firma. Returns the local URL. " +
        "The session is then available to the other fintecia_* tools.",
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
              `(+ MFA) y conectar tu e-firma:\n\n${onboard.url}`,
          },
        ],
      };
    },
  );

  return server;
}

serveStdio(createServer, {
  onerror: (error) => console.error("Fintecia MCP server error:", error),
});
