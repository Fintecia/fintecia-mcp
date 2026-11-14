import { readFileSync } from "node:fs";
import path from "node:path";
import { parseExtractoContable } from "../../../src/sat/cfdi/validate.js";
import type { SealVerifier } from "../../../src/sat/cfdi/types.js";

const FIXTURES = path.resolve("test/fixtures");
const xml = readFileSync(path.join(FIXTURES, "cfdi-ingreso-40.xml"), "utf8");

const verifierPass: SealVerifier = async () => {};
const verifierFail: SealVerifier = async () => {
  throw new Error("selloSAT inválido");
};

describe("parseExtractoContable (orchestrator)", () => {
  it("returns the extract when seal + RFC match both pass", async () => {
    const extract = await parseExtractoContable(xml, {
      taxpayerRfc: "AAA010101AAA",
      verifySelloSat: verifierPass,
    });
    expect(extract.uuid).toBe("6128396f-c09b-4ec6-8697-43d6e6ec1e51");
    expect(extract).not.toHaveProperty("selloSAT");
    expect(extract).not.toHaveProperty("selloCFD");
  });

  it("rejects a tampered CFDI (seal verification fails) and produces no extract", async () => {
    await expect(
      parseExtractoContable(xml, {
        taxpayerRfc: "AAA010101AAA",
        verifySelloSat: verifierFail,
      }),
    ).rejects.toThrow(/selloSAT/);
  });

  it("rejects an RFC mismatch before deriving the extract", async () => {
    let verifierCalled = false;
    await expect(
      parseExtractoContable(xml, {
        taxpayerRfc: "XXX010101XXX",
        verifySelloSat: async () => {
          verifierCalled = true;
        },
      }),
    ).rejects.toThrow(/RFC/);
    expect(verifierCalled).toBe(false);
  });

  it("rejects an absent seal before calling the crypto verifier", async () => {
    const noSeal = xml.replace('SelloSAT="c2VsbG8tc2F0"', "").replace('SelloCFD="c2VsbG8tY2Zk" ', "");
    let verifierCalled = false;
    await expect(
      parseExtractoContable(noSeal, {
        taxpayerRfc: "AAA010101AAA",
        verifySelloSat: async () => {
          verifierCalled = true;
        },
      }),
    ).rejects.toThrow(/selloSAT/);
    expect(verifierCalled).toBe(false);
  });
});
