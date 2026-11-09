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

const zip = {
  taxpayerRfc: "AAA010101AAA",
  zipBase64: "UEsDBAoAAAAA",
};

describe("UploadClient", () => {
  test("posts the zip (base64) to the upload endpoint with a bearer token", async () => {
    let url = "";
    let headers: Record<string, string> = {};
    let body: unknown;
    const client = new UploadClient({
      ...CFG,
      fetchFn: mockFetch((input, init) => {
        url = input;
        headers = { ...(init?.headers as Record<string, string>) };
        body = JSON.parse(String(init?.body));
        return jsonResponse({ accepted: 1, rejected: [], totalFiles: 3 });
      }),
    });

    const r = await client.upload(zip);
    expect(url).toBe(`${CFG.baseUrl}/api/v1/mcp/cfdi/upload`);
    expect(headers["authorization"]).toBe("Bearer id-token");
    expect(headers["content-type"]).toBe("application/json");
    expect(body).toEqual(zip);
    expect(r.accepted).toBe(1);
    expect(r.totalFiles).toBe(3);
  });

  test("throws on a non-ok response", async () => {
    const client = new UploadClient({
      ...CFG,
      fetchFn: mockFetch(() => new Response("nope", { status: 401 })),
    });
    await expect(client.upload(zip)).rejects.toThrow(/401/);
  });

  test("rejects a malformed response shape", async () => {
    const client = new UploadClient({
      ...CFG,
      fetchFn: mockFetch(() => jsonResponse({ accepted: "1", rejected: [] })),
    });
    await expect(client.upload(zip)).rejects.toThrow(/accepted/);
  });
});

describe("parseUploadResponse", () => {
  test("accepts the response shape with folioFiscal", () => {
    expect(
      parseUploadResponse({
        accepted: 2,
        rejected: [{ folioFiscal: "uuid-1", reason: "duplicate" }],
      }),
    ).toEqual({ accepted: 2, rejected: [{ folioFiscal: "uuid-1", reason: "duplicate" }] });
  });

  test("normalizes a null folioFiscal", () => {
    expect(
      parseUploadResponse({ accepted: 0, rejected: [{ folioFiscal: null, reason: "x" }] }),
    ).toEqual({ accepted: 0, rejected: [{ folioFiscal: null, reason: "x" }] });
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
