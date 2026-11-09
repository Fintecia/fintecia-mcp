// Smoke test for the nodecfdi integration (ESM-only, runs via tsx).
// Verifies inspectFiel extracts the RFC from the x500UniqueIdentifier (2.5.4.45).
import { inspectFiel } from "../../src/fiel/fiel.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const cer = readFileSync(path.resolve("test/fixtures/fiel.cer"), "utf8");
const key = readFileSync(path.resolve("test/fixtures/fiel.key"), "utf8");

const { info } = inspectFiel(cer, key, "");

if (info.rfc !== "ABC831011XYZ") {
  throw new Error(`expected RFC ABC831011XYZ, got ${info.rfc}`);
}
if (!info.isValid) {
  throw new Error("expected FIEL to be valid");
}

console.log(`OK: RFC=${info.rfc} serial=${info.serial}`);
