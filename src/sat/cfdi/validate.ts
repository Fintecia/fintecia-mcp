/**
 * CFDI local parse + validation orchestrator (agent-only).
 *
 * Pipeline: parse XML → RFC match (S7) → seal presence + selloSAT crypto
 * verification (S7) → accounting extract (S3). The raw XML (with signatures)
 * never leaves the machine — only the extract is emitted.
 *
 * The `verifySelloSat` dependency is injected (driven port) so the pure
 * orchestration is jest-testable; the nodecfdi implementation is `seal.ts`.
 */
import { assertSealPresent, toExtractoContable } from "./extract.js";
import { parseCfdiXml } from "./parser.js";
import { assertRfcMatch } from "./rfc.js";
import type { ExtractoContable, SealVerifier } from "./types.js";

export interface ParseExtractOptions {
  /** Taxpayer RFC (from the e-firma `.cer`), for the S7 RFC match. */
  taxpayerRfc: string;
  /** selloSAT crypto verification (nodecfdi). Injected for testability. */
  verifySelloSat: SealVerifier;
}

export async function parseExtractoContable(
  xml: string,
  options: ParseExtractOptions,
): Promise<ExtractoContable> {
  const cfdi = parseCfdiXml(xml);

  // S7 — RFC match (reject CFDIs of other taxpayers before anything else).
  assertRfcMatch(cfdi, options.taxpayerRfc);

  // S7 — reject an absent/invalid seal before running crypto.
  assertSealPresent(cfdi);

  // S7 — verify the SAT seal over the cadena original (nodecfdi).
  await options.verifySelloSat(
    xml,
    cfdi.noCertificadoSAT as string,
    cfdi.selloSAT as string,
  );

  // S3 — derive the accounting extract (signature fields dropped).
  return toExtractoContable(cfdi);
}
