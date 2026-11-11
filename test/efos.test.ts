import { PublicLookupClient, normalizeRfc } from "../src/public/lookup.js";

describe("normalizeRfc", () => {
  test("trims and uppercases", () => {
    expect(normalizeRfc("  abc123 ")).toBe("ABC123");
  });
});

describe("PublicLookupClient", () => {
  function client(overrides: { token?: string | null; fetchFn?: typeof fetch } = {}) {
    return new PublicLookupClient({
      baseUrl: "https://api.example",
      getAuthToken: async () =>
        overrides.token === undefined ? "tok" : overrides.token,
      fetchFn: overrides.fetchFn,
    });
  }

  test("requires a session — no ID token throws before any request", async () => {
    await expect(client({ token: null }).checkEfos("AAA120730823")).rejects.toThrow(
      /fintecia_login/,
    );
  });

  test("GETs the backend with Bearer token + normalized RFC", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        found: true,
        entry: { rfc: "AAA120730823", nombre: "A SA", situacion: "definitivo" },
      }),
    }) as unknown as typeof fetch;

    const result = await client({ fetchFn }).checkEfos(" aaa120730823 ");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example/api/v1/public/efos?rfc=AAA120730823",
      expect.objectContaining({
        method: "GET",
        headers: { authorization: "Bearer tok" },
      }),
    );
    expect(result.found).toBe(true);
    expect(result.entry?.situacion).toBe("definitivo");
  });

  test("checkDebts hits the debts endpoint", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ found: false, entry: null }),
    }) as unknown as typeof fetch;

    await client({ fetchFn }).checkDebts("AAA120730823");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example/api/v1/public/debts?rfc=AAA120730823",
      expect.anything(),
    );
  });

  test("maps 429 to a retryable error", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(client({ fetchFn }).checkEfos("AAA120730823")).rejects.toThrow(
      /Rate limit/,
    );
  });
});
