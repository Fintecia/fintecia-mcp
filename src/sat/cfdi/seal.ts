/**
 * S7 — selloSAT validation seam (nodecfdi ecosystem; ESM, smoke-tested).
 *
 * The SAT seal (`selloSAT`) is an RSA signature over the cadena original of
 * the TimbreFiscalDigital, verifiable with the PAC's public certificate (via
 * `noCertificadoSAT`). We use nodecfdi rather than hand-rolling crypto:
 *
 *   - `@nodecfdi/credentials`  → `Certificate.publicKey().verify` (the RSA
 *     signature verification, the security-critical crypto).
 *   - `@nodecfdi/cfdiutils-core` → `TfdCadenaDeOrigen` (cadena original via the
 *     SAT TFD XSLT), `SatCertificateNumber` + `CerRetriever` (PAC certificate
 *     download from `rdc.sat.gob.mx`).
 *
 * The full `verifySelloSat` flow requires a Saxon-B executable (`/usr/bin/
 * saxonb-xslt`, for the XSLT 2.0 cadena-original transform) AND network access
 * (XSLT + PAC .cer download). It is therefore NOT exercised by the offline
 * smoke test — which covers `verifySignature` (the crypto core) and the
 * deterministic absent-seal rejections that run before any XSLT/network.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CerRetriever,
  SatCertificateNumber,
  TfdCadenaDeOrigen,
} from "@nodecfdi/cfdiutils-core";
import { Certificate } from "@nodecfdi/credentials/node";
import { SelloSatError } from "./types.js";

/**
 * Verify an RSA signature over `data` using an X.509 certificate (PEM).
 * The signature is base64 (as carried in the CFDI `selloSAT` attribute).
 * This is the nodecfdi crypto core — not hand-rolled.
 *
 * Returns `false` (never throws) on a non-verifying or malformed signature.
 */
export function verifySignature(
  data: string,
  signatureBase64: string,
  certificatePem: string,
  algorithm: "sha256" | "sha1" = "sha256",
): boolean {
  try {
    const certificate = new Certificate(certificatePem);
    const signature = Buffer.from(signatureBase64, "base64").toString("binary");
    return certificate.publicKey().verify(data, signature, algorithm);
  } catch {
    return false;
  }
}

/**
 * Extract the `<tfd:TimbreFiscalDigital>` element (self-closing or paired)
 * from a CFDI XML string, for the cadena-original transform. The TFD node is
 * a leaf (attributes only) in every SAT schema (1.0/1.1), so a targeted
 * extraction is deterministic.
 */
export function extractTimbreFiscalDigitalXml(xml: string): string {
  // Handles both self-closing (`... />`) and paired (`...</tfd:...>`) TFD
  // elements. The SAT always namespaces it `tfd:`; the node is a leaf.
  const re = /<tfd:TimbreFiscalDigital\b[^>]*\/>|<tfd:TimbreFiscalDigital\b[\s\S]*?<\/tfd:TimbreFiscalDigital>/;
  const match = re.exec(xml);
  if (!match) {
    throw new SelloSatError("selloSAT ausente o inválido: no se encontró el TimbreFiscalDigital");
  }
  return match[0];
}

/**
 * Full selloSAT validation (SealVerifier). Rejects absent/invalid seals; the
 * crypto verification needs Saxon-B + network at runtime.
 */
export async function verifySelloSat(
  xml: string,
  noCertificadoSAT: string,
  selloSAT: string,
): Promise<void> {
  if (!selloSAT || !noCertificadoSAT) {
    throw new SelloSatError("selloSAT ausente o inválido");
  }

  // noCertificadoSAT must be a 20-digit SAT certificate number.
  const certNumber = new SatCertificateNumber(noCertificadoSAT);

  const tfdXml = extractTimbreFiscalDigitalXml(xml);
  const cadenaOriginal = await new TfdCadenaDeOrigen().build(tfdXml);

  const downloadDir = mkdtempSync(path.join(tmpdir(), "fintecia-pac-"));
  const certPath = await new CerRetriever(downloadDir).retrieve(certNumber.remoteUrl());
  const certificate = Certificate.openFile(certPath);

  const signature = Buffer.from(selloSAT, "base64").toString("binary");
  // Default sha256 (post-2021 SAT seals). Pre-2021 SHA-1 timbres need sha1 —
  // a refinement when the full PAC-cert flow is wired in.
  const valid = certificate.publicKey().verify(cadenaOriginal, signature, "sha256");
  if (!valid) {
    throw new SelloSatError("selloSAT inválido");
  }
}
