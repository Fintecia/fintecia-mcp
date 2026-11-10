import { decodeFileForFiel } from "../src/fiel/decode.js";

const PEM = `-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----`;
const DER = Buffer.from([0x30, 0x82, 0x01, 0x0a, 0x02, 0x82, 0x01, 0x01]);

describe("decodeFileForFiel", () => {
  test("returns PEM text as-is", () => {
    const b64 = Buffer.from(PEM, "utf8").toString("base64");
    expect(decodeFileForFiel(b64, "cert")).toBe(PEM);
  });

  test("returns base64 for a DER cert", () => {
    const b64 = DER.toString("base64");
    expect(decodeFileForFiel(b64, "cert")).toBe(b64); // unchanged base64
  });

  test("returns a latin1/binary string for a DER key", () => {
    const b64 = DER.toString("base64");
    const decoded = decodeFileForFiel(b64, "key");
    expect(decoded).toBe(DER.toString("latin1"));
    expect(decoded).not.toBe(b64);
  });
});
