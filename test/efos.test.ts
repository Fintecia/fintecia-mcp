import { EfosLookup, normalizeRfc } from "../src/public/efos.js";

const entries = [
  { rfc: "AAA120730823", nombre: "X", situacion: "definitivo" as const },
  { rfc: "aac120810nca", nombre: "Y", situacion: "definitivo" as const },
  { rfc: "AAC1805044A8", nombre: "Z", situacion: "presunto" as const },
];

describe("EfosLookup", () => {
  const lookup = new EfosLookup(entries);

  test("normalizes the RFC (uppercase) for lookup", () => {
    expect(lookup.check("aaa120730823")?.situacion).toBe("definitivo");
    expect(lookup.check("  AAC120810NCA ")?.situacion).toBe("definitivo");
  });

  test("returns null when not on the list", () => {
    expect(lookup.check("ZZZ000000ZZ0")).toBeNull();
  });

  test("normalizeRfc trims and uppercases", () => {
    expect(normalizeRfc("  abc123 ")).toBe("ABC123");
  });

  test("size counts entries", () => {
    expect(lookup.size).toBe(3);
  });

  test("fromJson validates the array", () => {
    const built = EfosLookup.fromJson([
      { rfc: "AAA010101AAA", situacion: "definitivo" },
    ]);
    expect(built.check("AAA010101AAA")?.situacion).toBe("definitivo");
    expect(() => EfosLookup.fromJson({})).toThrow(/array/);
    expect(() => EfosLookup.fromJson([{ nombre: "sin rfc" }])).toThrow();
  });
});
