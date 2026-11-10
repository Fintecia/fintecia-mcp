/**
 * Decode a base64 file (sent by the browser) into the string format nodecfdi's
 * `Fiel.create` expects. The browser reads the .cer/.key as base64 (binary-safe
 * — `readAsDataURL`), unlike `readAsText` which corrupts DER binaries.
 *
 *   - PEM → the UTF-8 text as-is.
 *   - DER cert → base64 (matches Fintecia's `cerContents` in ws-auth.ts).
 *   - DER key  → latin1/binary string (matches `keyBinary` in ws-auth.ts).
 */
export function decodeFileForFiel(b64: string, kind: 'cert' | 'key'): string {
  const buf = Buffer.from(b64, 'base64');
  const text = buf.toString('utf8');
  if (text.includes('-----BEGIN')) return text;
  return kind === 'cert' ? buf.toString('base64') : buf.toString('latin1');
}
