# Seguridad

Fintecia es un MCP **local**: corre en tu máquina y maneja tu e-firma y tus CFDI. Este documento describe nuestro modelo de seguridad y cómo reportar vulnerabilidades.

## Modelo de seguridad

### Tu e-firma nunca sale de tu máquina

- El `.cer` y el `.key` se guardan **localmente**, con permisos `0600` (solo tu usuario puede leerlos).
- El `.key` está **cifrado con tu contraseña**; la contraseña vive solo en el **llavero del sistema operativo** (Keychain en macOS, DPAPI en Windows, libsecret en Linux).
- Al firmar o descargar, el proceso usa tu e-firma **sin enviársela a ningún servidor** — ni al modelo de IA ni a Fintecia.

### Qué se sube (y qué no)

- El MCP **parsea tus CFDI localmente** y sube **solo el extracto contable** (RFCs, importes, UUID).
- **Nunca** se sube el XML original ni los sellos digitales (`selloCFD` / `selloSAT`).

### Telemetría (opt-out)

- Enviamos telemetría mínima y **anónima**: qué herramienta se usó, el resultado y la duración.
- **No** recopilamos RFCs, contraseñas, conversaciones ni material de tu e-firma.
- Puedes desactivarla con `FINTECIA_TELEMETRY=off`.

### Autenticación

- El login es **OAuth local** (loopback en `127.0.0.1`): los tokens viven solo en memoria y no se persisten en disco.

## Reportar una vulnerabilidad

Si encuentras un problema de seguridad, **no abras un issue público**. Escríbenos a **security@evoluciondigital.mx** con los detalles. Te respondemos y coordinamos la divulgación responsable.

---

*Este documento cubre la versión actual del MCP y se actualiza cuando cambia el modelo de seguridad.*
