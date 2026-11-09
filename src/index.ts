import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { TOOLS } from "./tools.js";

/**
 * Fintecia MCP server — local, read-only (+ local e-firma download).
 *
 * Scaffold (T0): registers all 15 tools from `tools.ts` with stub handlers.
 * Handlers are wired in T1–T8 (keychain/onboarding, DescargaMasiva, upload,
 * public data, reconciliation/deductibility/risk, PDF parser, telemetry).
 */

function createServer(): McpServer {
  const server = new McpServer({ name: "fintecia-mcp", version: "0.1.0" });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (_input) => ({
        content: [
          {
            type: "text",
            text:
              `[fintecia-mcp] "${tool.name}" is defined but not yet implemented ` +
              `(T1–T8).`,
          },
        ],
      }),
    );
  }

  return server;
}

serveStdio(createServer, {
  onerror: (error) => console.error("Fintecia MCP server error:", error),
});
