import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { inspectFiel } from "../fiel/fiel.js";
import { decodeFileForFiel } from "../fiel/decode.js";
import type { FielStore } from "../fiel/store.js";
import { FIREBASE_WEB_CONFIG, isLocal, AUTH_EMULATOR_URL } from "../auth/firebaseConfig.js";
import { SessionStore, type AuthSession } from "../auth/session.js";
import { type Keychain, detectKeychain } from "../keychain/keychain.js";
import { saveFielPassword } from "../sat/keychainFielProvider.js";

/**
 * Onboarding web-local server (127.0.0.1 only). Two responsibilities:
 *   1. Load the e-firma (.cer + .key + password) -> validate + store locally.
 *   2. Loopback OAuth: the page signs in with Google (+ MFA) via the Firebase
 *      Web SDK and POSTs the tokens back to this server, which stores them in
 *      the SessionStore. The password / tokens never leave the process.
 */

function html(config: Record<string, string>, localAuthUrl: string | null): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fintecia — Conectar</title>
<style>
  :root {
    --brand: #0B57D0;
    --brand-hover: #0842A0;
    --bg: #F6F8FC;
    --card: #FFFFFF;
    --text: #1F2937;
    --muted: #6B7280;
    --border: #E5E7EB;
    --success: #1B873B;
    --success-bg: #EAF6EE;
    --error: #B3261E;
    --error-bg: #FBECEB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(11, 87, 208, 0.08);
    max-width: 440px; width: 100%;
    padding: 36px 32px 32px;
  }
  .logo {
    width: 40px; height: 40px; border-radius: 10px;
    background: var(--brand); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 18px; margin-bottom: 16px;
  }
  h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .subtitle { color: var(--muted); font-size: 14px; line-height: 1.5; margin: 6px 0 28px; }
  .step { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 24px 0 10px; }
  .btn {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 12px 16px; border-radius: 10px;
    font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer;
    border: 1px solid var(--border); background: #fff; color: var(--text);
    transition: background .15s, border-color .15s;
  }
  .btn:hover { background: #F3F6FC; border-color: #CBD5E1; }
  .btn-primary { background: var(--brand); border-color: var(--brand); color: #fff; }
  .btn-primary:hover { background: var(--brand-hover); border-color: var(--brand-hover); }
  .g { width: 18px; height: 18px; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .file, input[type="password"] {
    width: 100%; padding: 10px 12px; border: 1px solid var(--border);
    border-radius: 8px; font-size: 14px; margin-bottom: 16px; background: #fff;
    color: var(--text); font-family: inherit;
  }
  input[type="file"] { padding: 8px; color: var(--muted); }
  input[type="file"]::file-selector-button {
    border: 1px solid var(--border); border-radius: 6px; background: #F3F6FC;
    padding: 6px 12px; margin-right: 10px; font-size: 13px; font-weight: 600;
    cursor: pointer; color: var(--text); font-family: inherit;
  }
  .status {
    display: none; margin-top: 14px; padding: 12px 14px; border-radius: 8px;
    font-size: 14px; line-height: 1.4; word-break: break-word;
  }
  .status.show { display: block; }
  .status.ok { background: var(--success-bg); color: var(--success); }
  .status.err { background: var(--error-bg); color: var(--error); }
  .status.info { background: #EDF3FC; color: var(--brand); }
  .hint { font-size: 12px; color: var(--muted); line-height: 1.5; margin-top: 18px; }
  .divider { border: none; border-top: 1px solid var(--border); margin: 20px 0 0; }
</style>
</head><body>
<div class="card">
  <div class="logo">F</div>
  <h1>Conectá tu cuenta</h1>
  <p class="subtitle">Iniciá sesión con Google y subí tu e-firma para que el agente pueda leer tus facturas. Tus llaves nunca salen de esta máquina.</p>

  <button id="signin" class="btn">
    <svg class="g" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1z"/><path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.98 11.98 0 0 0 1.28 6.61l4.01 3.1C6.23 6.87 8.88 4.76 12 4.76z"/></svg>
    Iniciar sesión con Google
  </button>
  <div id="authStatus" class="status"></div>

  <div id="efirmaSection" style="display:none">
  <hr class="divider">
  <div class="step">E-firma</div>
  <form id="f">
    <label for="cer">Certificado (.cer)</label>
    <input class="file" id="cer" type="file" accept=".cer,.pem,.crt">
    <label for="key">Llave privada (.key)</label>
    <input class="file" id="key" type="file" accept=".key,.pem">
    <label for="pass">Contraseña de la llave</label>
    <input id="pass" type="password" autocomplete="off" placeholder="••••••••">
    <button type="submit" class="btn btn-primary">Guardar e-firma</button>
  </form>
  <div id="out" class="status"></div>
  <p class="hint">La contraseña se usa para validar y se descarta. Nunca se guarda ni se sube.</p>
  </div>
</div>

<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-auth-compat.js"></script>
<script>
firebase.initializeApp(${JSON.stringify(config)});
${localAuthUrl ? `firebase.auth().useEmulator(${JSON.stringify(localAuthUrl)});` : ''}
const auth = firebase.auth();

const $ = (id) => document.getElementById(id);
const status = (el, text, kind) => { el.textContent = text; el.className = "status show " + kind; };

$("signin").addEventListener("click", async () => {
  status($("authStatus"), "Iniciando sesión…", "info");
  try {
    const result = await signInWithMfa(auth);
    const idToken = await result.user.getIdToken();
    const refreshToken = result.user.refreshToken;
    const res = await fetch("/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken, refreshToken }),
    });
    const body = await res.json();
    if (body.ok) {
      status($("authStatus"), "Sesión iniciada. Ahora subí tu e-firma.", "ok");
      $("efirmaSection").style.display = "block";
      $("signin").disabled = true;
      $("signin").style.opacity = "0.6";
    } else {
      status($("authStatus"), "No se pudo iniciar sesión: " + (body.error || "error"), "err");
    }
  } catch (err) {
    status($("authStatus"), "No se pudo iniciar sesión: " + (err.code || err.message || err), "err");
  }
});

async function signInWithMfa(a) {
  try {
    return await a.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (err) {
    if (err.code !== "auth/multi-factor-auth-required") throw err;
    const resolver = firebase.auth.getMultiFactorResolver(err);
    const hint = resolver.hints[0];
    const code = prompt("Ingresá tu código TOTP (MFA):");
    if (!code) throw new Error("MFA cancelado");
    const assertion = firebase.auth.TotpMultiFactorGenerator
      .assertionForSignIn(hint.uid, code);
    return resolver.resolveSignIn(assertion);
  }
}

const read = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(file);
});

$("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  status($("out"), "Validando…", "info");
  try {
    const cerB64 = await read($("cer").files[0]);
    const keyB64 = await read($("key").files[0]);
    const res = await fetch("/fiel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cerB64, keyB64, password: $("pass").value }),
    });
    const body = await res.json();
    if (body.ok) {
      status($("out"), "E-firma válida · RFC " + body.rfc + ". ¡Listo! Ya podés cerrar esta ventana y volver al agente para pedir tus facturas.", "ok");
      $("f").style.display = "none";
    } else {
      status($("out"), "No se pudo validar: " + (body.error || "error"), "err");
    }
  } catch (err) {
    status($("out"), "No se pudo validar: " + String(err), "err");
  }
});
</script></body></html>`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk as string;
  return body;
}

export function startOnboardServer(
  store: FielStore,
  session: SessionStore = new SessionStore(),
  onAuth: (s: AuthSession) => void = () => {},
  keychain: Keychain = detectKeychain(process.platform),
): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const send = (status: number, body: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(body));
        };

        if (req.method === "GET" && req.url === "/") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(
            html(
              FIREBASE_WEB_CONFIG as Record<string, string>,
              isLocal ? AUTH_EMULATOR_URL : null,
            ),
          );
          return;
        }

        if (req.method === "POST" && req.url === "/auth") {
          try {
            const { idToken, refreshToken } = JSON.parse(await readBody(req)) as {
              idToken: string;
              refreshToken: string;
            };
            if (!idToken || !refreshToken) {
              send(400, { ok: false, error: "missing tokens" });
              return;
            }
            const s = { idToken, refreshToken };
            session.set(s);
            onAuth(s);
            send(200, { ok: true });
          } catch (err) {
            send(400, { ok: false, error: (err as Error).message });
          }
          return;
        }

        if (req.method === "POST" && req.url === "/fiel") {
          try {
            const { cerB64, keyB64, password } = JSON.parse(await readBody(req)) as {
              cerB64: string;
              keyB64: string;
              password: string;
            };
            const cer = decodeFileForFiel(cerB64, 'cert');
            const key = decodeFileForFiel(keyB64, 'key');
            const { info } = inspectFiel(cer, key, password);
            await store.store({ rfc: info.rfc, certPem: info.pem, keyPem: key });
            await saveFielPassword(keychain, info.rfc, password);
            send(200, { ok: true, rfc: info.rfc });
          } catch (err) {
            send(400, { ok: false, error: (err as Error).message });
          }
          return;
        }

        send(404, { ok: false, error: "not found" });
      },
    );

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve({ server, url: `http://127.0.0.1:${addr.port}` });
      }
    });
  });
}
