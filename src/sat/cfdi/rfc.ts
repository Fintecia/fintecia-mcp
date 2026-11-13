/**
 * S7 — RFC match. Rejects a CFDI whose emisor AND receptor both differ from
 * the taxpayer RFC (the RFC comes from the e-firma `.cer`).
 */
import type { CfdiData } from "./types.js";

export function assertRfcMatch(cfdi: CfdiData, taxpayerRfc: string): void {
  if (cfdi.emisorRfc !== taxpayerRfc && cfdi.receptorRfc !== taxpayerRfc) {
    throw new Error(
      "RFC mismatch: el contribuyente no es emisor ni receptor del CFDI",
    );
  }
}
