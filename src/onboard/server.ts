import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { inspectFiel } from "../fiel/fiel.js";
import type { FielStore } from "../fiel/store.js";
import { FIREBASE_WEB_CONFIG } from "../auth/firebaseConfig.js";
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

function html(config: Record<string, string>): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Fintecia — conectar</title></head><body>
<h1>Conectar con Fintecia</h1>

<h2>1. Iniciar sesión</h2>
<button id="signin">Iniciar sesión con Google</button>
<div id="authStatus"></div>

<h2>2. E-firma</h2>
<form id="f">
  <p><label>.cer (certificado): <input id="cer" type="file" accept=".cer,.pem,.crt"></label></p>
  <p><label>.key (llave privada): <input id="key" type="file" accept=".key,.pem"></label></p>
  <p><label>Contraseña de la llave: <input id="pass" type="password" autocomplete="off"></label></p>
  <button type="submit">Guardar e-firma</button>
</form>
<pre id="out"></pre>

<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-auth-compat.js"></script>
<script>
firebase.initializeApp(${JSON.stringify(config)});
const auth = firebase.auth();

const $ = (id) => document.getElementById(id);

$("signin").addEventListener("click", async () => {
  $("authStatus").textContent = "Iniciando sesión…";
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
    $("authStatus").textContent = body.ok
      ? "✓ Sesión iniciada (" + body.uid + ")"
      : "✗ " + (body.error || "error");
  } catch (err) {
    $("authStatus").textContent = "✗ " + (err.code || err.message || err);
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
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsText(file);
});

$("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("out").textContent = "Validando…";
  try {
    const cer = await read($("cer").files[0]);
    const key = await read($("key").files[0]);
    const res = await fetch("/fiel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cer, key, password: $("pass").value }),
    });
    const body = await res.json();
    $("out").textContent = body.ok
      ? "✓ FIEL válida. RFC: " + body.rfc
      : "✗ " + (body.error || "error");
  } catch (err) {
    $("out").textContent = "✗ " + String(err);
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
          res.end(html(FIREBASE_WEB_CONFIG as Record<string, string>));
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
            const { cer, key, password } = JSON.parse(await readBody(req)) as {
              cer: string;
              key: string;
              password: string;
            };
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
