/**
 * Auth session (loopback OAuth result). The local web page performs the
 * Firebase sign-in (Google + MFA) and POSTs the tokens to the local server,
 * which stores them here for the process lifetime.
 *
 * In-memory only for now: the MCP is a stdio process that lives while the
 * agent talks to it; the ID token is refreshed via the refresh token. Disk
 * persistence of the refresh token (surviving MCP restarts) is a follow-up.
 */

export interface AuthSession {
  idToken: string;
  refreshToken: string;
}

export class SessionStore {
  private session: AuthSession | null = null;

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
}
