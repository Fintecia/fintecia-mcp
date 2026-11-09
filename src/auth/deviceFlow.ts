/**
 * Device authorization flow client (RFC 8628-style) + Firebase token exchange.
 *
 * The MCP is a PUBLIC client: no client secret. Auth chain:
 *   1. `start()` → Fintecia `/device/start` returns device_code + user_code +
 *      verification_uri.
 *   2. The user opens verification_uri in the browser, signs in with Google+MFA
 *      (the existing Fintecia auth), and enters the user_code.
 *   3. `poll()` → Fintecia `/device/token` returns a Firebase custom token once
 *      the user authorized.
 *   4. `exchange()` → Firebase REST `accounts:signInWithCustomToken` swaps the
 *      custom token for an ID token + refresh token.
 *
 * The custom token is minted server-side (firebase-admin `createCustomToken`)
 * and MUST preserve the MFA step-up claim (see `functions/src/utils/callable.ts`).
 *
 * Contract is documented here for the backend implementation (T3). No secrets
 * live in this client: `firebaseApiKey` is a public Web API key.
 */

export interface DeviceStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceTokenResponse {
  status: "pending" | "authorized" | "denied" | "expired";
  customToken?: string;
}

export interface AuthSession {
  idToken: string;
  refreshToken: string;
}

export interface DeviceFlowConfig {
  /** Fintecia backend base URL (no trailing slash). */
  baseUrl: string;
  /** Firebase Web API key (public, used only for the token exchange). */
  firebaseApiKey: string;
  /** Injectable fetch for tests. */
  fetchFn?: typeof fetch;
}

export class DeviceFlowClient {
  constructor(private readonly config: DeviceFlowConfig) {}

  private fetch(input: string, init?: RequestInit): Promise<Response> {
    const fn = this.config.fetchFn ?? fetch;
    return fn(input, init);
  }

  async start(): Promise<DeviceStartResponse> {
    const res = await this.fetch(`${this.config.baseUrl}/api/v1/device/start`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(`device/start failed: ${res.status}`);
    }
    return (await res.json()) as DeviceStartResponse;
  }

  async poll(deviceCode: string): Promise<DeviceTokenResponse> {
    const res = await this.fetch(`${this.config.baseUrl}/api/v1/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode }),
    });
    if (!res.ok) {
      throw new Error(`device/token failed: ${res.status}`);
    }
    return (await res.json()) as DeviceTokenResponse;
  }

  /** Exchange a Firebase custom token for an ID token + refresh token. */
  async exchange(customToken: string): Promise<AuthSession> {
    const url =
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken` +
      `?key=${encodeURIComponent(this.config.firebaseApiKey)}`;
    const res = await this.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    if (!res.ok) {
      throw new Error(`custom token exchange failed: ${res.status}`);
    }
    const body = (await res.json()) as { idToken: string; refreshToken: string };
    return { idToken: body.idToken, refreshToken: body.refreshToken };
  }

  /** Refresh an expired ID token via the Firebase secure-token endpoint. */
  async refresh(refreshToken: string): Promise<AuthSession> {
    const url =
      `https://securetoken.googleapis.com/v1/token` +
      `?key=${encodeURIComponent(this.config.firebaseApiKey)}`;
    const res = await this.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) {
      throw new Error(`refresh failed: ${res.status}`);
    }
    const body = (await res.json()) as { id_token: string; refresh_token: string };
    return { idToken: body.id_token, refreshToken: body.refresh_token };
  }
}
