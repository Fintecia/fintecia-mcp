// Smoke test for the onboarding web-local server (runs via tsx; nodecfdi ESM).
import { startOnboardServer } from "../../src/onboard/server.js";
import { FileFielStore } from "../../src/fiel/store.js";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cer = readFileSync(path.resolve("test/fixtures/fiel.cer"), "utf8");
const key = readFileSync(path.resolve("test/fixtures/fiel.key"), "utf8");

const dir = mkdtempSync(path.join(tmpdir(), "onboard-"));
const store = new FileFielStore(dir);
const { server, url } = await startOnboardServer(store);

try {
  const res = await fetch(`${url}/fiel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cer, key, password: "" }),
  });
  const body = (await res.json()) as { ok: boolean; rfc?: string; error?: string };
  if (!body.ok || body.rfc !== "ABC831011XYZ") {
    throw new Error(`onboard failed: ${JSON.stringify(body)}`);
  }
  const stored = await store.load("ABC831011XYZ");
  if (!stored) throw new Error("FIEL not stored after onboarding");

  // A wrong password must be rejected, not stored.
  const bad = await fetch(`${url}/fiel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cer, key: "corrupt", password: "" }),
  });
  if (bad.status !== 400) throw new Error("expected 400 on corrupt key");

  console.log(`OK: onboard stored RFC=${body.rfc}`);
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
