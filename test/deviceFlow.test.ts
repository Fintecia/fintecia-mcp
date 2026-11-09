import { DeviceFlowClient } from "../src/auth/deviceFlow.js";

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
  firebaseApiKey: "public-web-api-key",
};

describe("DeviceFlowClient", () => {
  test("start returns the device/user code", async () => {
    const calls: string[] = [];
    const client = new DeviceFlowClient({
      ...CFG,
      fetchFn: mockFetch((input) => {
        calls.push(input);
        return jsonResponse({
          deviceCode: "dev-1",
          userCode: "ABCD-EFGH",
          verificationUri: "https://fintecia.example/device",
          expiresIn: 900,
          interval: 5,
        });
      }),
    });

    const r = await client.start();
    expect(r.userCode).toBe("ABCD-EFGH");
    expect(calls[0]).toBe(`${CFG.baseUrl}/api/v1/device/start`);
  });

  test("poll posts the deviceCode and returns the custom token", async () => {
    let body: unknown;
    const client = new DeviceFlowClient({
      ...CFG,
      fetchFn: mockFetch((input, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ status: "authorized", customToken: "custom-token" });
      }),
    });

    const r = await client.poll("dev-1");
    expect(body).toEqual({ deviceCode: "dev-1" });
    expect(r.customToken).toBe("custom-token");
    expect(r.status).toBe("authorized");
  });

  test("exchange calls Firebase signInWithCustomToken", async () => {
    let url = "";
    let body: unknown;
    const client = new DeviceFlowClient({
      ...CFG,
      fetchFn: mockFetch((input, init) => {
        url = input;
        body = JSON.parse(String(init?.body));
        return jsonResponse({ idToken: "id-token", refreshToken: "refresh-token" });
      }),
    });

    const s = await client.exchange("custom-token");
    expect(url).toContain("accounts:signInWithCustomToken");
    expect(url).toContain("public-web-api-key");
    expect(body).toEqual({ token: "custom-token", returnSecureToken: true });
    expect(s.idToken).toBe("id-token");
    expect(s.refreshToken).toBe("refresh-token");
  });

  test("throws on non-ok start", async () => {
    const client = new DeviceFlowClient({
      ...CFG,
      fetchFn: mockFetch(() => new Response("nope", { status: 500 })),
    });
    await expect(client.start()).rejects.toThrow(/500/);
  });
});
