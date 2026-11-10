/**
 * Firebase Web config (public). The MCP is a public client: these values are
 * meant to be embedded (the Web API key is not a secret). Overridable via env
 * for staging/local emulator.
 *
 * `FINTECIA_ENV` selects the backend environment. Unlike the Flutter app's
 * `Env` (which defaults to "local" for dev), the MCP is distributed to end
 * users, so it defaults to "production": when local, the onboarding page
 * connects the Auth SDK to the Auth emulator at 127.0.0.1:9099 (same as
 * `lib/main.dart` `useAuthEmulator`).
 */
export const FIREBASE_ENV = process.env.FINTECIA_ENV ?? 'production';
export const isLocal = FIREBASE_ENV === 'local';
export const AUTH_EMULATOR_URL =
  process.env.FIREBASE_AUTH_EMULATOR ?? 'http://127.0.0.1:9099';

/**
 * Fintecia backend base URL (no trailing slash), env-aware.
 *
 * The MCP talks to the backend over plain `fetch` (NOT the Firebase Functions
 * SDK), so it must know the full base URL. `FINTECIA_API_URL` wins when set;
 * otherwise the URL is derived from `FINTECIA_ENV`:
 *   - local      → Functions emulator (project `demo-fintecia-dev`, from
 *                  `.firebaserc`; the emulator only serves callables under its
 *                  own project id — see `firebase_options.dart`)
 *   - staging    → fintecia-staging.web.app
 *   - production → app.fintecia.com.mx
 *
 * L22 bug: previously `FINTECIA_API_URL` was read raw with NO default, so a
 * prod run failed with "uploadBaseUrl no configurado (definí FINTECIA_API_URL)".
 */
export function resolveApiBaseUrl(
  env: string,
  explicit?: string,
  localOverride?: string,
): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, '');
  switch (env) {
    case 'local':
      return (
        localOverride?.trim() ||
        'http://127.0.0.1:5001/demo-fintecia-dev/us-central1'
      );
    case 'staging':
      return 'https://fintecia-staging.web.app';
    default: // production and any unknown value → prod (fail safe to the real API)
      return 'https://app.fintecia.com.mx';
  }
}

export const API_BASE_URL = resolveApiBaseUrl(
  FIREBASE_ENV,
  process.env.FINTECIA_API_URL,
  process.env.FINTECIA_LOCAL_API_URL,
);

export const FIREBASE_WEB_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY ?? 'AIzaSyAt1DR0jI8h9GqaPo8kaSwVNL_4Hb3IhL8',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? 'app.fintecia.com.mx',
  projectId: process.env.FIREBASE_PROJECT_ID ?? 'fintecia',
  appId: process.env.FIREBASE_APP_ID ?? '1:608545925207:web:68758d816a6085dce39b12',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? 'fintecia.firebasestorage.app',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? '608545925207',
};
