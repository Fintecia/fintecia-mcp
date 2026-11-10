// Smoke test for the onboarding web-local server (runs via tsx; nodecfdi ESM).
import { startOnboardServer } from "../../src/onboard/server.js";
import { FileFielStore } from "../../src/fiel/store.js";
import type { Keychain } from "../../src/keychain/keychain.js";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The browser reads files as base64 (binary-safe) and POSTs cerB64/keyB64.
const cerB64 = readFileSync(path.resolve("test/fixtures/fiel.cer")).toString("base64");
const keyB64 = readFileSync(path.resolve("test/fixtures/fiel.key")).toString("base64");

// Noop keychain: the smoke test must not pollute the real OS keyring.
const noopKeychain: Keychain = {
  set: async () => {},
  get: async () => null,
  delete: async () => {},
};

const dir = mkdtempSync(path.join(tmpdir(), "onboard-"));
const store = new FileFielStore(dir);
const { server, url } = await startOnboardServer(store, undefined, undefined, noopKeychain);

const auth = async () => {
  const res = await fetch(`${url}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: "test-id-token", refreshToken: "test-refresh" }),
  });
  const body = (await res.json()) as { ok: boolean };
  if (!body.ok) throw new Error(`auth failed: ${JSON.stringify(body)}`);
};

try {
  await auth();

  const res = await fetch(`${url}/fiel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cerB64, keyB64, password: "" }),
  });
  const body = (await res.json()) as { ok: boolean; rfc?: string; error?: string };
  if (!body.ok || body.rfc !== "ABC831011XYZ") {
    throw new Error(`onboard failed: ${JSON.stringify(body)}`);
  }
  const stored = await store.load("ABC831011XYZ");
  if (!stored) throw new Error("FIEL not stored after onboarding");

  // A corrupt key must be rejected, not stored.
  const bad = await fetch(`${url}/fiel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cerB64, keyB64: Buffer.from("corrupt").toString("base64"), password: "" }),
  });
  if (bad.status !== 400) throw new Error("expected 400 on corrupt key");

  // /efirmas lists stored e-firmas (RFC + keyring password status); /refiel re-persists the password.
  const efirmasRes = await fetch(`${url}/efirmas`);
  const efirmas = (await efirmasRes.json()) as {
    efirmas: Array<{ rfc: string; hasPassword: boolean }>;
  };
  const found = efirmas.efirmas.find((e) => e.rfc === "ABC831011XYZ");
  if (!found) throw new Error(`efirmas missing: ${JSON.stringify(efirmas)}`);

  const relinkRes = await fetch(`${url}/refiel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rfc: "ABC831011XYZ", password: "" }),
  });
  const relink = (await relinkRes.json()) as { ok: boolean; rfc?: string };
  if (!relink.ok || relink.rfc !== "ABC831011XYZ") {
    throw new Error(`refiel failed: ${JSON.stringify(relink)}`);
  }

  console.log(`OK: onboard stored RFC=${body.rfc}`);
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
