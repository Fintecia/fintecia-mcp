import { UploadClient, parseUploadResponse } from "../../src/sat/upload.js";

function mockFetch(handler: (input: string, init?: RequestInit) => Response) {
  return handler as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CFG = {
  baseUrl: "https://api.fintecia.example",
  idToken: "id-token",
};

const batch = {
  taxpayerRfc: "AAA010101AAA",
  cfdis: [
    {
      xml: "<x/>",
      uuid: "u1",
      emisorRfc: "A",
      receptorRfc: "B",
      total: 1,
      fecha: "2026-01-15T00:00:00",
      tipo: "emitido" as const,
    },
  ],
};

describe("UploadClient", () => {
  test("posts the batch to the frozen endpoint with a bearer token", async () => {
    let url = "";
    let headers: Record<string, string> = {};
    let body: unknown;
    const client = new UploadClient({
      ...CFG,
      fetchFn: mockFetch((input, init) => {
        url = input;
        headers = { ...(init?.headers as Record<string, string>) };
        body = JSON.parse(String(init?.body));
        return jsonResponse({ accepted: 1, rejected: [] });
      }),
    });

    const r = await client.upload(batch);
    expect(url).toBe(`${CFG.baseUrl}/api/v1/mcp/cfdi/upload`);
    expect(headers["authorization"]).toBe("Bearer id-token");
    expect(headers["content-type"]).toBe("application/json");
    expect(body).toEqual(batch);
    expect(r).toEqual({ accepted: 1, rejected: [] });
  });

  test("throws on a non-ok response", async () => {
    const client = new UploadClient({
      ...CFG,
      fetchFn: mockFetch(() => new Response("nope", { status: 401 })),
    });
    await expect(client.upload(batch)).rejects.toThrow(/401/);
  });

  test("rejects a malformed response shape", async () => {
    const client = new UploadClient({
      ...CFG,
      fetchFn: mockFetch(() => jsonResponse({ accepted: "1", rejected: [] })),
    });
    await expect(client.upload(batch)).rejects.toThrow(/accepted/);
  });
});

describe("parseUploadResponse", () => {
  test("accepts the frozen response shape", () => {
    expect(
      parseUploadResponse({ accepted: 2, rejected: [{ uuid: "u", reason: "r" }] }),
    ).toEqual({ accepted: 2, rejected: [{ uuid: "u", reason: "r" }] });
  });

  test("rejects a non-integer accepted", () => {
    expect(() => parseUploadResponse({ accepted: 1.5, rejected: [] })).toThrow();
    expect(() => parseUploadResponse({ accepted: -1, rejected: [] })).toThrow();
  });

  test("rejects malformed rejected items", () => {
    expect(() => parseUploadResponse({ accepted: 0, rejected: [{}] })).toThrow();
    expect(() => parseUploadResponse({ accepted: 0, rejected: "x" })).toThrow();
  });

  test("rejects non-object bodies", () => {
    expect(() => parseUploadResponse("nope")).toThrow();
    expect(() => parseUploadResponse(null)).toThrow();
  });
});
