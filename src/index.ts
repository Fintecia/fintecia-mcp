#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
import { checkForUpdate } from "./updateCheck.js";

// Installed version, read from package.json (single source of truth) — same
// pattern as server.ts PKG_VERSION. Resolved here (the ESM entrypoint) because
// updateCheck.ts is also compiled under the CJS jest transform, which cannot
// emit `import.meta.url`.
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = (
  JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as {
    version: string;
  }
).version;

// Fire-and-forget update check: never blocks stdio startup, writes only to
// stderr (never stdout), and no-ops on any failure.
void checkForUpdate({ getInstalledVersion: () => PKG_VERSION });

serveStdio(() => createServer(), {
  onerror: (error) => console.error("Fintecia MCP server error:", error),
});
