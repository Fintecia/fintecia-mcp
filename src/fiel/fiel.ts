import { X509Certificate } from "node:crypto";
import { Fiel } from "@nodecfdi/sat-ws-descarga-masiva";

/**
 * FIEL inspection — thin wrapper over nodecfdi's `Fiel` (the same library the
 * Fintecia backend uses in `functions/src/sat/ws-auth.ts`).
 *
 * The RFC lives in the X.509 `x500UniqueIdentifier` (OID 2.5.4.45), NOT the CN.
 * nodecfdi's `Fiel.create(...).getRfc()` extracts it consistently with Fintecia,
 * so we do NOT re-implement certificate parsing here.
 *
 * The private key (`keyPem`) and password are never logged, never persisted
 * (the password is re-entered per signing session), and never leave the machine.
 */

export interface FielInfo {
  rfc: string;
  serial: string;
  pem: string;
  /** Legal name (razón social / nombre) from the certificate's CN, if present. */
  razonSocial: string | null;
  isValid: boolean;
}

export interface InspectedFiel {
  fiel: Fiel;
  info: FielInfo;
}

/**
 * Build a nodecfdi Fiel from cert + key + passPhrase and extract its public
 * identity (RFC, serial). Throws when the FIEL is invalid or expired.
 */
/**
 * Extract the holder's legal name (razón social / nombre) from the subject's
 * CN. The RFC lives in `x500UniqueIdentifier` (OID 2.5.4.45), NOT the CN —
 * the CN carries the name. Returns null when the CN is absent.
 */
export function extractRazonSocial(certPem: string): string | null {
  try {
    const subject = new X509Certificate(certPem).subject;
    const m = subject.match(/^CN=([^\n]+)/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

export function inspectFiel(
  certPem: string,
  keyPem: string,
  passPhrase: string,
): InspectedFiel {
  const fiel = Fiel.create(certPem, keyPem, passPhrase);

  if (!fiel.isValid()) {
    throw new Error("FIEL inválida o vencida");
  }

  const pem = fiel.getCertificatePemContents();

  return {
    fiel,
    info: {
      rfc: fiel.getRfc(),
      serial: fiel.getCertificateSerial(),
      pem,
      razonSocial: extractRazonSocial(pem),
      isValid: true,
    },
  };
}
