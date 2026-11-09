/**
 * Read client for the Fintecia MCP read endpoints. The MCP queries the
 * backend for MATERIALIZED data (the backend computes; the client reads).
 * Each call is `POST /api/v1/mcp/<resource>` with `{ taxpayerRfc, ... }` and
 * a Bearer ID token from the loopback session.
 */

export interface ReadClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
}

export class ReadClient {
  constructor(private readonly config: ReadClientConfig) {}

  private fetch(input: string, init?: RequestInit): Promise<Response> {
    const fn = this.config.fetchFn ?? fetch;
    return fn(input, init);
  }

  async read(
    path: string,
    taxpayerRfc: string,
    extra: Record<string, unknown> = {},
  ): Promise<unknown> {
    const idToken = await this.config.getAuthToken();
    if (!idToken) {
      throw new Error("no autenticado (fintecia_login)");
    }
    const res = await this.fetch(`${this.config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ taxpayerRfc, ...extra }),
    });
    if (!res.ok) {
      throw new Error(`read ${path} failed: ${res.status}`);
    }
    return res.json();
  }

  /** Read an endpoint that needs NO taxpayerRfc (e.g. profile, by uid). */
  async readRaw(path: string): Promise<unknown> {
    const idToken = await this.config.getAuthToken();
    if (!idToken) {
      throw new Error("no autenticado (fintecia_login)");
    }
    const res = await this.fetch(`${this.config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      throw new Error(`read ${path} failed: ${res.status}`);
    }
    return res.json();
  }
}
