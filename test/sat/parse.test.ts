import { validatePeriod, validateDownloadArgs } from "../../src/sat/parse.js";

describe("validatePeriod", () => {
  test("accepts a valid YYYY-MM-DD range", () => {
    expect(validatePeriod("2026-01-01", "2026-01-31")).toEqual({
      desde: "2026-01-01",
      hasta: "2026-01-31",
    });
  });

  test("accepts desde == hasta", () => {
    expect(validatePeriod("2026-01-15", "2026-01-15")).toEqual({
      desde: "2026-01-15",
      hasta: "2026-01-15",
    });
  });

  test("rejects malformed dates", () => {
    expect(() => validatePeriod("01/01/2026", "2026-01-31")).toThrow(/YYYY-MM-DD/);
    expect(() => validatePeriod("2026-1-1", "2026-01-31")).toThrow(/YYYY-MM-DD/);
  });

  test("rejects impossible dates (rollover)", () => {
    expect(() => validatePeriod("2026-02-30", "2026-03-01")).toThrow(/fecha/);
    expect(() => validatePeriod("2026-13-01", "2026-03-01")).toThrow(/fecha/);
  });

  test("rejects desde > hasta", () => {
    expect(() => validatePeriod("2026-02-01", "2026-01-31")).toThrow(/anterior/);
  });
});

describe("validateDownloadArgs", () => {
  test("normalizes tipo/desde/hasta/rfc", () => {
    const a = validateDownloadArgs({
      tipo: "emitidos",
      desde: "2026-01-01",
      hasta: "2026-01-31",
      rfc: " aaa010101aaa ",
    });
    expect(a).toEqual({
      tipo: "emitidos",
      desde: "2026-01-01",
      hasta: "2026-01-31",
      rfc: "AAA010101AAA",
    });
  });

  test("accepts ambos", () => {
    const a = validateDownloadArgs({
      tipo: "ambos",
      desde: "2026-01-01",
      hasta: "2026-01-31",
      rfc: "AAA010101AAA",
    });
    expect(a.tipo).toBe("ambos");
  });

  test("rejects invalid tipo", () => {
    expect(() =>
      validateDownloadArgs({
        tipo: "nope",
        desde: "2026-01-01",
        hasta: "2026-01-31",
        rfc: "AAA010101AAA",
      }),
    ).toThrow(/tipo/);
  });

  test("rejects invalid rfc", () => {
    expect(() =>
      validateDownloadArgs({
        tipo: "emitidos",
        desde: "2026-01-01",
        hasta: "2026-01-31",
        rfc: "123",
      }),
    ).toThrow(/RFC/);
  });
});
