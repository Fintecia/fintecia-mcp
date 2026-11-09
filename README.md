# fintecia-mcp

MCP server local de **Fintecia** — descarga de CFDI con e-firma local, conciliación
banco↔CFDI, riesgo 69-B/EFOS y deducibilidad fiscal, para agentes (Claude, ChatGPT, Cursor).

> **Estado: scaffold (T0).** Las tools están definidas pero aún no implementadas.
> Ver el diseño en `odd/tasks/mcp-local.md` del repo `mvp` (work_items/179).

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

Configuración de un cliente (ej. Claude Desktop):

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

## Desarrollo

```bash
npm run dev        # tsx watch
npm run typecheck
npm test
```
