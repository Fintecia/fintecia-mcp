#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

serveStdio(() => createServer(), {
  onerror: (error) => console.error("Fintecia MCP server error:", error),
});
