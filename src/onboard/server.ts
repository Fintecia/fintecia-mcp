import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { inspectFiel } from "../fiel/fiel.js";
import type { FielStore } from "../fiel/store.js";

/**
 * Onboarding web-local server (127.0.0.1 only). The user loads .cer + .key +
 * password in a browser page; the server validates the FIEL (nodecfdi) and
 * stores it locally. The password is used to validate and then DISCARDED — it
 * is never persisted, never logged, never leaves the process.
 */

const HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Fintecia — conectar e-firma</title></head><body>
<h1>Conectar e-firma</h1>
<form id="f">
  <p><label>.cer (certificado): <input id="cer" type="file" accept=".cer,.pem,.crt"></label></p>
  <p><label>.key (llave privada): <input id="key" type="file" accept=".key,.pem"></label></p>
  <p><label>Contraseña de la llave: <input id="pass" type="password" autocomplete="off"></label></p>
  <button type="submit">Conectar</button>
</form>
<pre id="out"></pre>
<script>
const $ = (id) => document.getElementById(id);
const read = (f) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsText(f);
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

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk as string;
  return body;
}

export function startOnboardServer(
  store: FielStore,
  onDone: (rfc: string) => void = () => {},
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
        res.end(HTML);
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
          send(200, { ok: true, rfc: info.rfc });
          onDone(info.rfc);
        } catch (err) {
          send(400, { ok: false, error: (err as Error).message });
        }
        return;
      }

      send(404, { ok: false, error: "not found" });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve({ server, url: `http://127.0.0.1:${addr.port}` });
      }
    });
  });
}
