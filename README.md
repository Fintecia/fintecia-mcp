# fintecia-mcp

[![CI](https://github.com/Fintecia/fintecia-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Fintecia/fintecia-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

Servidor MCP **local** de [Fintecia](https://app.fintecia.com.mx) para agentes de IA
(Claude, Cursor, ChatGPT, OpenCode y cualquier cliente MCP). Le da a tu agente acceso a
tus facturas (CFDI), conciliación bancaria, riesgo fiscal (69-B / art. 69) y
deducibilidad — descargando tus facturas directamente del SAT con tu **e-firma local**,
que **nunca sale de tu máquina**.

## Qué puede hacer tu agente

- **Descargar CFDIs del SAT** (emitidos / recibidos) por periodo, con tu e-firma local.
- **Consultar tus finanzas** ya calculadas por Fintecia (balances, impuestos, conciliación).
- **Verificar el riesgo fiscal** de cualquier RFC (listas 69-B y art. 69) y el estatus de una factura.
- **Evaluar la deducibilidad** de tus gastos, con la evidencia de cada veredicto.

## Requisitos

- **Node.js 20 o superior.**
- **Cuenta de Fintecia** para las herramientas `fintecia_*` (login con Google + MFA).
- **e-firma** (`.cer` + `.key` + contraseña) solo si querés descargar CFDIs del SAT.
  Sin e-firma, las consultas públicas y las de tu cuenta siguen funcionando.

## Instalación

### 1. Obtener el servidor

```bash
git clone https://github.com/Fintecia/fintecia-mcp.git
cd fintecia-mcp
npm install
npm run build      # compila a dist/
```

### 2. Registrar el servidor en tu cliente MCP

Agregá una entrada `fintecia` apuntando a `dist/index.js`. En **Claude Desktop**
(`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fintecia": {
      "command": "node",
      "args": ["/ruta/absoluta/a/fintecia-mcp/dist/index.js"]
    }
  }
}
```

**Cursor** usa el mismo formato en `.cursor/mcp.json`; otros clientes (OpenCode,
Windsurf, etc.) aceptan una estructura equivalente. Consultá la documentación de tu
cliente para la sintaxis exacta.

### 3. Primer uso: login + e-firma

1. Pedile a tu agente que ejecute la herramienta **`fintecia_login`**.
2. Abrí en tu navegador la URL local que devuelve.
3. Iniciá sesión con Google (+ MFA) y cargá tu e-firma (`.cer` + `.key` + contraseña).
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
| `cfdi_download` | Descarga CFDIs del SAT por periodo (async → devuelve un `jobId`). |
| `cfdi_download_status` | Consulta el estado de una descarga en curso. |
| `cfdi_sync_status` | Qué tan al día está tu información local. |

### Fintecia (requiere login)

| Herramienta | Qué hace |
|---|---|
| `fintecia_profile` | Tu usuario y los contribuyentes a los que estás vinculado. |
| `fintecia_financials` | Balances y razones materializados — usá esto para responder "cuánto". |
| `fintecia_tax_summary` | Resumen de ISR/IVA por periodo. |
| `fintecia_reconciliation` | Estado de la conciliación banco ↔ CFDI. |
| `fintecia_transactions` | Ingresos/gastos (dato crudo, solo para inspección). |
| `fintecia_cfdi` | Buscar / ver facturas (dato crudo, solo para inspección). |
| `fintecia_risk_report` | Cruce de tus contrapartes contra las listas 69-B / 69. |
| `fintecia_risk_check` | Ficha de riesgo de un proveedor (RFC puntual). |
| `fintecia_deductibility` | Veredicto de deducibilidad por gasto, con evidencia. |

> **El agente razona, Fintecia calcula.** Para responder "cuánto" usá siempre las
> herramientas materializadas (`fintecia_financials`, `fintecia_tax_summary`); las
> herramientas `_transactions` / `_cfdi` son solo para inspeccionar qué hay detrás de
> un número, nunca para re-sumarlo.

## Seguridad y privacidad

- Tu **e-firma nunca sale de tu máquina**: se guarda en el keychain del sistema
  (macOS Keychain / Windows Credential Manager / Linux libsecret). Fintecia solo
  recibe los CFDI.
- El servidor es **local** (corre por stdio, en tu máquina) y **sin secretos**:
  la autenticación es OAuth de *loopback* — tu navegador hace el login y el token
  queda en memoria, no en disco.
- Todo acceso a tus datos pasa por tu sesión autenticada.

## Configuración (opcional)

| Variable | Default | Descripción |
|---|---|---|
| `FINTECIA_ENV` | `local` | Entorno del backend: `production`, `staging` o `local` (emulador de desarrollo). |
| `FINTECIA_API_URL` | *(derivada de `FINTECIA_ENV`)* | URL base del backend (override manual, sin `/` final). |

> **Para usar contra producción**, configurá `FINTECIA_ENV=production`. El default
> `local` apunta al emulador de desarrollo y solo sirve si corrés el backend de
> Fintecia localmente.

## Desarrollo

```bash
npm run dev        # tsx watch
npm run typecheck  # tsc --noEmit
npm test           # jest
```

## Licencia

MIT
