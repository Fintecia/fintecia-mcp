# fintecia

[![CI](https://github.com/Fintecia/fintecia-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Fintecia/fintecia-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

Servidor MCP **local** de [Fintecia](https://fintecia.com.mx/?utm_source=mcp&utm_medium=referral&utm_campaign=fintecia_mcp&utm_content=readme) para agentes de IA
(Claude, Cursor, ChatGPT, OpenCode y cualquier cliente MCP). Le da a tu agente acceso a
tus facturas (CFDI), conciliación bancaria, riesgo fiscal (69-B / art. 69) y
deducibilidad — descargando tus facturas directamente del SAT con tu **e-firma local**,
que **nunca sale de tu máquina**.

## Qué puede hacer tu agente

- **Descargar CFDIs del SAT** (emitidos / recibidos) por periodo, con tu e-firma local.
- **Consultar tus finanzas** ya calculadas por Fintecia (balances, impuestos, conciliación).
- **Verificar el riesgo fiscal** de cualquier RFC (listas 69-B y art. 69) y el estatus de una factura.
- **Evaluar la deducibilidad** de tus gastos, con la evidencia de cada veredicto.

## Estado del proyecto

Esta es una **versión temprana**. Lo disponible hoy:

- ✅ Descarga de CFDI del SAT con e-firma local + materialización en Fintecia.
- ✅ Consultas materializadas: `fintecia_financials` (estados NIF B-3/B-6),
  `fintecia_tax_summary`, `fintecia_risk_report`/`_check`, `fintecia_deductibility`.
- ✅ `fintecia_reconciliation` (estado de conciliación banco↔CFDI, **solo lectura**).

**Pendiente (próximas versiones):**

- ⏳ **Carga del PDF de estado de cuenta bancario** para conciliar contra CFDI
  (la reconciliación hoy solo reporta datos ya importados; no acepta el PDF todavía).

## Requisitos

- **Node.js 20 o superior.**
- **Cuenta de Fintecia** para las herramientas `fintecia_*` (login con Google).
- **e-firma** (`.cer` + `.key` + contraseña) solo si quieres descargar CFDIs del SAT.
  Sin e-firma, las consultas públicas y las de tu cuenta siguen funcionando.

## Instalación

### 1. Instalar el servidor

```bash
npm install -g fintecia
```

Esto deja el binario **`fintecia-mcp`** en tu `PATH` (apuntando a `dist/index.js`,
definido en `package.json` `bin`). No hace falta clonar el repo ni compilar.

### 2. Registrar el servidor en tu cliente MCP

Agrega una entrada `fintecia` apuntando al binario `fintecia-mcp`. En **Claude
Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fintecia": {
      "command": "fintecia-mcp",
      "args": []
    }
  }
}
```

**Cursor** usa el mismo formato en `.cursor/mcp.json`; otros clientes (OpenCode,
Windsurf, etc.) aceptan una estructura equivalente. Consultá la documentación de tu
cliente para la sintaxis exacta.

### 3. Primer uso: login + e-firma

1. Pedile a tu agente que ejecute la herramienta **`fintecia_login`**.
2. Abre en tu navegador la URL local que devuelve.
3. Inicia sesión con Google y carga tu e-firma (`.cer` + `.key` + contraseña).
4. Listo: tu agente queda autenticado y vinculado a tu RFC.

## Herramientas

### Públicas del SAT (sin cuenta, sin e-firma)

| Herramienta | Qué hace |
|---|---|
| `sat_efos_check` | ¿Un RFC está en la lista 69-B (EFOS, operaciones presuntamente inexistentes)? |
| `sat_debts_check` | ¿Un RFC tiene créditos fiscales firmes (art. 69)? |
| `cfdi_verify` | Estatus de una factura (vigente / cancelado) + Validación EFOS. |

### Descarga del SAT (e-firma local)

| Herramienta | Qué hace |
|---|---|
| `fintecia_efirmas` | Lista las e-firmas registradas en esta máquina. |
| `cfdi_download` | Descarga CFDIs del SAT por periodo (async → devuelve un `jobId`). |
| `cfdi_download_status` | Consulta el estado de una descarga en curso. |
| `cfdi_sync_status` | Qué tan al día está tu información local. |

### Fintecia (requiere login)

| Herramienta | Qué hace |
|---|---|
| `fintecia_profile` | Tu usuario y los contribuyentes a los que estás vinculado. |
| `fintecia_financials` | Balances y razones materializados — usa esto para responder "cuánto". |
| `fintecia_tax_summary` | Resumen de ISR/IVA por periodo. |
| `fintecia_reconciliation` | Estado de la conciliación banco ↔ CFDI. |
| `fintecia_transactions` | Ingresos/gastos (dato crudo, solo para inspección). |
| `fintecia_risk_report` | Cruce de tus contrapartes contra las listas 69-B / 69. |
| `fintecia_risk_check` | Ficha de riesgo de un proveedor (RFC puntual). |
| `fintecia_deductibility` | Veredicto de deducibilidad por gasto, con evidencia. |

> **El agente razona, Fintecia calcula.** Para responder "cuánto" usa siempre las
> herramientas materializadas (`fintecia_financials`, `fintecia_tax_summary`); las
> herramientas `_transactions` / `_cfdi` son solo para inspeccionar qué hay detrás de
> un número, nunca para re-sumarlo.

### Glosario de campos (estática, sin login)

| Herramienta | Qué hace |
|---|---|
| `fintecia_glosario` | Diccionario de campos de las tools `fintecia_*` (money objects, NIF B-3/B-6, impuestos vs ISR prepagado, IVA en el balance). Estática y sin auth — devuelve el glosario para interpretar `fintecia_financials`. |

## Seguridad y privacidad

Qué se queda local y qué se envía a Fintecia — transparente, sin letra chica:

- **Tu e-firma nunca sale de tu máquina**: se guarda en el keychain del sistema
  (macOS Keychain / Windows Credential Manager / Linux libsecret). Ni el `.key`
  ni tu contraseña se transmiten a Fintecia ni al agente.
- **Solo se envía el extracto contable, nunca la factura completa**: el MCP
  parsea cada CFDI localmente y envía a Fintecia únicamente el extracto contable
  (RFCs, régimen fiscal, importes, impuestos, conceptos, forma/método de pago y
  UUID) para materializar tus estados financieros, impuestos y conciliación. La
  factura cruda (XML), los datos identificativos (razón social, serie, folio,
  lugar de expedición) y la firma criptográfica (selloCFD/selloSAT, timbrado)
  permanecen en tu máquina y nunca se transmiten.
- **Telemetría anónima**: el MCP envía eventos de uso (id de instalación y de sesión
  como UUID, un campo `source` con el agente que usas + un `channel` de referrer
  reservado a futuro —hoy `null`—, qué herramienta invocaste, resultado y duración) y
  eventos de activación (`fiel_loaded`, `download_started`/`download_completed`,
  `upload_completed`, `first_use_completed`). **No** se envían tus prompts,
  conversaciones ni los argumentos de las herramientas. Es **opt-out**: puedes
  apagarla con la variable de entorno `FINTECIA_TELEMETRY=off` (o `0`).
- El servidor es **local** (corre por stdio, en tu máquina) y **sin secretos**:
  la autenticación es OAuth de *loopback* — tu navegador hace el login y el token
  queda en memoria, no en disco.
- Todo acceso a tus datos pasa por tu sesión autenticada.
- **Modelo de seguridad y reporte de vulnerabilidades:** véase [`SECURITY.md`](./SECURITY.md).

## Supply-chain

- **Dependencias pineadas** (sin rangos `^`): versiones exactas en `package.json` + `package-lock.json`, para builds reproducibles.
- **Overrides de seguridad** para vulnerabilidades transitivas conocidas (`jsrsasign`, `file-type`, `deepmerge`, `minimatch`).
- **Riesgo aceptado (nodecfdi):** las dependencias `@nodecfdi/*` (descarga masiva SAT, credentials) traen un script `preinstall: npx only-allow pnpm` — benigno (solo fuerza pnpm en el repo upstream), pero es un install-script que Socket.dev marca. Se mantiene documentado como riesgo aceptado: no ejecuta código dañino, y no hay alternativa sin re-vendorear el ecosistema nodecfdi.

## Licencia

MIT

## Desarrollo

Los hooks de delivery se instalan con `npm run hooks:install` (`core.hooksPath` → `.githooks/`): `commit-msg` exige Conventional Commits sin atribución a IA y `pre-push` rechaza el push directo a `main`. Tests: `npm run hooks:test`.
