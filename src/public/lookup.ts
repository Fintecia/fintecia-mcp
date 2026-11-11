/**
 * Backend-backed lookups for the SAT public lists (69-B + art. 69).
 *
 * The lists live in the Fintecia backend (Firestore, refreshed monthly); the
 * MCP is a thin client. These lookups REQUIRE a logged-in session (ID token)
 * per the "auth, not e-firma" rule — there is NO local fixture in production
 * (a fixture would answer with stale/sample data and never hit the backend).
 */

export function normalizeRfc(rfc: string): string {
  return rfc.trim().toUpperCase();
}

export interface SatListEntry {
  rfc: string;
  nombre: string;
  situacion: string;
  oficio?: string;
  fechaPublicacion?: string;
}

export interface PublicLookupClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
}

export class PublicLookupClient {
  constructor(private readonly config: PublicLookupClientConfig) {}

  private fetch(input: string, init?: RequestInit): Promise<Response> {
    const fn = this.config.fetchFn ?? fetch;
    return fn(input, init);
  }

  private async get(
    path: string,
    rfc: string,
  ): Promise<{ found: boolean; entry: SatListEntry | null }> {
    const idToken = await this.config.getAuthToken();
    if (!idToken) {
      throw new Error(
        "Iniciá sesión primero (fintecia_login) antes de consultar listados del SAT.",
      );
    }
    const res = await this.fetch(
      `${this.config.baseUrl}${path}?rfc=${encodeURIComponent(rfc)}`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${idToken}` },
      },
    );
    if (res.status === 429) {
      throw new Error("Rate limit excedido, reintentá en unos segundos.");
    }
    if (!res.ok) {
      throw new Error(`lookup ${path} failed: ${res.status}`);
    }
    return (await res.json()) as { found: boolean; entry: SatListEntry | null };
  }

  async checkEfos(rfc: string): Promise<{ found: boolean; entry: SatListEntry | null }> {
    return this.get("/api/v1/public/efos", normalizeRfc(rfc));
  }

  async checkDebts(rfc: string): Promise<{ found: boolean; entry: SatListEntry | null }> {
    return this.get("/api/v1/public/debts", normalizeRfc(rfc));
  }
}
