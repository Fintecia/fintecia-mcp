import {
  SessionStore,
  isIdTokenExpired,
  refreshIdToken,
} from "../../src/auth/session.js";

/** Minimal fake JWT with the given `exp` (Unix seconds). */
function makeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.sig`;
}

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
const anHourAgo = () => Math.floor(Date.now() / 1000) - 3600;

function mockFetch(handler: (input: string, init?: RequestInit) => Response) {
  return handler as unknown as typeof fetch;
}

describe("isIdTokenExpired", () => {
  test("expired token → true", () => {
    expect(isIdTokenExpired(makeJwt(anHourAgo()))).toBe(true);
  });

  test("valid token → false", () => {
    expect(isIdTokenExpired(makeJwt(inAnHour()))).toBe(false);
  });

  test("unparseable token → true", () => {
    expect(isIdTokenExpired("not-a-jwt")).toBe(true);
  });
});

describe("refreshIdToken", () => {
  test("returns fresh tokens on 200", async () => {
    const fetchFn = mockFetch(() =>
      new Response(
        JSON.stringify({ id_token: "new-id", refresh_token: "new-ref" }),
        { status: 200 },
      ),
    );
    expect(await refreshIdToken("old-ref", "key", fetchFn)).toEqual({
      idToken: "new-id",
      refreshToken: "new-ref",
    });
  });

  test("returns null on non-200", async () => {
    const fetchFn = mockFetch(() => new Response("{}", { status: 400 }));
    expect(await refreshIdToken("old-ref", "key", fetchFn)).toBeNull();
  });

  test("returns null on network error", async () => {
    const fetchFn = mockFetch(() => {
      throw new Error("boom");
    });
    expect(await refreshIdToken("old-ref", "key", fetchFn)).toBeNull();
  });
});

describe("SessionStore.getFreshIdToken", () => {
  test("returns existing idToken when not expired", async () => {
    const id = makeJwt(inAnHour());
    const store = new SessionStore();
    store.set({ idToken: id, refreshToken: "ref" });
    expect(await store.getFreshIdToken("key")).toBe(id);
  });

  test("refreshes when expired and persists the new token", async () => {
    const store = new SessionStore(
      mockFetch(() =>
        new Response(
          JSON.stringify({ id_token: "new-id", refresh_token: "new-ref" }),
          { status: 200 },
        ),
      ),
    );
    store.set({ idToken: makeJwt(anHourAgo()), refreshToken: "old-ref" });
    expect(await store.getFreshIdToken("key")).toBe("new-id");
    // second call returns the now-fresh token without a further fetch
    expect(await store.getFreshIdToken("key")).toBe("new-id");
  });

  test("returns null when no session", async () => {
    const store = new SessionStore();
    expect(await store.getFreshIdToken("key")).toBeNull();
  });

  test("returns null when refresh fails", async () => {
    const store = new SessionStore(
      mockFetch(() => new Response("{}", { status: 400 })),
    );
    store.set({ idToken: makeJwt(anHourAgo()), refreshToken: "old-ref" });
    expect(await store.getFreshIdToken("key")).toBeNull();
  });
});
