import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { TOOLS } from "./tools.js";
import { createHandlers } from "./handlers.js";

/**
 * Fintecia MCP server — local, read-only (+ local e-firma download).
 */

function createServer(): McpServer {
  const server = new McpServer({ name: "fintecia-mcp", version: "0.1.0" });
  const handlers = createHandlers();

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
      async (input) => handler(input as Record<string, unknown>),
    );
  }

  return server;
}

serveStdio(createServer, {
  onerror: (error) => console.error("Fintecia MCP server error:", error),
});
