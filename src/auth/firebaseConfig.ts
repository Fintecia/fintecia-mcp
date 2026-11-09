/**
 * Firebase Web config (public). The MCP is a public client: these values are
 * meant to be embedded (the Web API key is not a secret). Overridable via env
 * for staging/local emulator.
 */
export const FIREBASE_WEB_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY ?? 'AIzaSyAt1DR0jI8h9GqaPo8kaSwVNL_4Hb3IhL8',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? 'app.fintecia.com.mx',
  projectId: process.env.FIREBASE_PROJECT_ID ?? 'fintecia',
  appId: process.env.FIREBASE_APP_ID ?? '1:608545925207:web:68758d816a6085dce39b12',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? 'fintecia.firebasestorage.app',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? '608545925207',
};
