# fintecia-mcp

[![CI](https://github.com/Fintecia/fintecia-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Fintecia/fintecia-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

MCP server local de **Fintecia** — descarga de CFDI con e-firma local, conciliación
banco↔CFDI, riesgo 69-B/EFOS y deducibilidad fiscal, para agentes (Claude, ChatGPT, Cursor).

> **Estado: en desarrollo.** `sat_efos_check` (69-B) ya funciona con un fixture de
> datos; el resto son stubs. Ver el diseño en `odd/tasks/mcp-local.md` del repo
> `mvp` (work_items/179).

## Qué hace

- **Público SAT (sin cuenta):** `sat_efos_check` (69-B), `sat_debts_check` (art. 69), `cfdi_verify` (estatus + EFOS).
- **Descarga (e-firma local):** `cfdi_download`, `cfdi_download_status`, `cfdi_sync_status`.
- **Fintecia (auth, materializado):** `fintecia_profile`, `fintecia_transactions`, `fintecia_cfdi`, `fintecia_financials`, `fintecia_reconciliation`, `fintecia_tax_summary`, `fintecia_risk_report`, `fintecia_risk_check`, `fintecia_deductibility`.

La e-firma **nunca** sale de la máquina; Fintecia solo recibe CFDI. El cliente es
público y **sin secretos** (device flow = public client, auth = ID token).

## Instalar / correr

```bash
npm install
npm run build      # compila a dist/
npm start          # corre el server por stdio
```

Configuración de un cliente (ej. Claude Desktop) — en `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fintecia": {
      "command": "node",
      "args": ["/ruta/a/fintecia-mcp/dist/index.js"]
    }
  }
}
```

Probar rápido desde la terminal:

```bash
npm run build
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sat_efos_check","arguments":{"rfc":"AAA120730823"}}}' \
  | node dist/index.js
```

## Variables de entorno

La URL del backend se resuelve según el entorno (no hay que setear nada para el
caso habitual); `FINTECIA_API_URL` siempre tiene prioridad si está definida.

| Variable | Default | Uso |
|---|---|---|
| `FINTECIA_ENV` | `local` | `local` → emulador de Functions; `staging` → `fintecia-staging.web.app`; `production` → `app.fintecia.com.mx`. |
| `FINTECIA_API_URL` | *(derivada de `FINTECIA_ENV`)* | Base URL del backend (sin slash final). Gana sobre el default. |
| `FINTECIA_LOCAL_API_URL` | `http://127.0.0.1:5001/demo-fintecia-dev/us-central1` | Emulador de Functions en `local` (override). |

## Desarrollo

```bash
npm run dev        # tsx watch
npm run typecheck
npm test
```
