import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCfdiXml } from "../../../src/sat/cfdi/parser.js";
import { assertRfcMatch } from "../../../src/sat/cfdi/rfc.js";

const FIXTURES = path.resolve("test/fixtures");
const xml = readFileSync(path.join(FIXTURES, "cfdi-ingreso-40.xml"), "utf8");
const cfdi = parseCfdiXml(xml);
// cfdi-ingreso-40: emisor XAXX010101000, receptor AAA010101AAA.

describe("assertRfcMatch (S7)", () => {
  it("accepts when the taxpayer RFC is the emisor", () => {
    expect(() => assertRfcMatch(cfdi, "XAXX010101000")).not.toThrow();
  });

  it("accepts when the taxpayer RFC is the receptor", () => {
    expect(() => assertRfcMatch(cfdi, "AAA010101AAA")).not.toThrow();
  });

  it("rejects when the taxpayer RFC is neither emisor nor receptor", () => {
    expect(() => assertRfcMatch(cfdi, "XXX010101XXX")).toThrow(/RFC/);
  });
});
