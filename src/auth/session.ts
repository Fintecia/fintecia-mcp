/**
 * Auth session (loopback OAuth result). The local web page performs the
 * Firebase sign-in (Google + MFA) and POSTs the tokens to the local server,
 * which stores them here for the process lifetime.
 *
 * The ID token is short-lived (~1h): `getFreshIdToken` transparently refreshes
 * it via the refresh token (Firebase Secure Token API) so authenticated tools
 * keep working across long agent sessions. In-memory only — disk persistence
 * (surviving MCP restarts) is a follow-up.
 */

export interface AuthSession {
  idToken: string;
  refreshToken: string;
}

/** Base64url-decode a JWT payload and read its `exp` (Unix seconds). */
function idTokenExp(idToken: string): number | null {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

/** True when the idToken is expired or within `bufferSeconds` of expiring. */
export function isIdTokenExpired(idToken: string, bufferSeconds = 60): boolean {
  const exp = idTokenExp(idToken);
  if (exp === null) return true; // unparseable → treat as expired
  return Date.now() / 1000 >= exp - bufferSeconds;
}

/** Exchange a Firebase refresh token for fresh tokens (Secure Token API). */
export async function refreshIdToken(
  refreshToken: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ idToken: string; refreshToken?: string } | null> {
  try {
    const res = await fetchFn(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id_token?: string;
      refresh_token?: string;
    };
    if (!data.id_token) return null;
    return { idToken: data.id_token, refreshToken: data.refresh_token };
  } catch {
    return null;
  }
}

export class SessionStore {
  private session: AuthSession | null = null;

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  set(session: AuthSession): void {
    this.session = session;
  }

  get(): AuthSession | null {
    return this.session;
  }

  clear(): void {
    this.session = null;
  }

  get idToken(): string | null {
    return this.session?.idToken ?? null;
  }

  /** Returns a non-expired idToken, refreshing via the refresh token as needed. */
  async getFreshIdToken(apiKey: string): Promise<string | null> {
    if (!this.session) return null;
    if (!isIdTokenExpired(this.session.idToken)) return this.session.idToken;
    const tokens = await refreshIdToken(
      this.session.refreshToken,
      apiKey,
      this.fetchFn,
    );
    if (!tokens) return null;
    this.session.idToken = tokens.idToken;
    if (tokens.refreshToken) this.session.refreshToken = tokens.refreshToken;
    return this.session.idToken;
  }
}
