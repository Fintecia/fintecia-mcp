// Smoke test for the CFDI selloSAT validation seam (runs via tsx; nodecfdi).
//
// The full selloSAT flow (cadena original via Saxon-B XSLT + PAC certificate
// download from rdc.sat.gob.mx) needs a Saxon-B executable AND network, so it
// is NOT exercised here. What IS verified deterministically offline:
//   1. verifySignature — the nodecfdi crypto core (`@nodecfdi/credentials`
//      `Certificate.publicKey().verify`) over a real RSA/SHA-256 signature.
//   2. The reject paths (absent/invalid seal) that run before any XSLT/network.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  extractTimbreFiscalDigitalXml,
  verifySignature,
} from "../../src/sat/cfdi/seal.js";

const SEAL = path.resolve("test/fixtures/seal");

const certPem = readFileSync(path.join(SEAL, "test-pac.cer"), "utf8");
const cadenaOriginal = readFileSync(path.join(SEAL, "cadena-original.txt"), "utf8");
const selloB64 = readFileSync(path.join(SEAL, "sello.sha256.b64"), "utf8").trim();

// 1. Crypto core: a valid SHA-256 signature verifies.
if (!verifySignature(cadenaOriginal, selloB64, certPem)) {
  throw new Error("verifySignature rejected a valid selloSAT signature");
}

// 2. Tampered cadena original (a modified monto/RFC breaks the signature).
const tampered = cadenaOriginal.replace("6128396f-c09b-4ec6-8697-43d6e6ec1e51", "00000000-0000-0000-0000-000000000000");
if (verifySignature(tampered, selloB64, certPem)) {
  throw new Error("verifySignature accepted a signature over a tampered cadena original");
}

// 3. Tampered signature is rejected.
const badSig = Buffer.from("deadbeef", "hex").toString("base64");
if (verifySignature(cadenaOriginal, badSig, certPem)) {
  throw new Error("verifySignature accepted a garbage signature");
}

// 4. TFD node extraction handles both self-closing and paired elements.
const selfClosing = extractTimbreFiscalDigitalXml(
  '<tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="x" FechaTimbrado="y" RfcProvCertif="z" NoCertificadoSAT="00001000000508664968" SelloSAT="abc"/>',
);
if (!selfClosing.startsWith("<tfd:TimbreFiscalDigital") || !selfClosing.endsWith("/>")) {
  throw new Error("extractTimbreFiscalDigitalXml did not extract a self-closing TFD");
}
const paired = extractTimbreFiscalDigitalXml(
  '<tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="x" NoCertificadoSAT="00001000000508664968" SelloSAT="abc"></tfd:TimbreFiscalDigital>',
);
if (!paired.startsWith("<tfd:TimbreFiscalDigital") || !paired.endsWith("</tfd:TimbreFiscalDigital>")) {
  throw new Error("extractTimbreFiscalDigitalXml did not extract a paired TFD");
}

console.log("OK: cfdi selloSAT seam (verifySignature crypto + tamper rejection + TFD extraction)");
