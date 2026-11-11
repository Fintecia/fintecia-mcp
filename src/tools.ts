import { z } from "zod";

/**
 * Tool definitions for the Fintecia MCP server (read-only + local e-firma).
 *
 * Design contract (odd/tasks/mcp-local.md, work_items/179):
 * - "El agente razona, Fintecia calcula": tools `fintecia_*` return materialized
 *   results; the agent must NEVER re-sum raw data. Raw (`fintecia_cfdi`,
 *   `fintecia_transactions`) is for inspection only.
 * - Everything is read-only EXCEPT `cfdi_download` (triggers DescargaMasiva +
 *   upload), which carries `destructiveHint`.
 * - The local e-firma never leaves the machine; Fintecia only receives CFDI.
 */

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  annotations: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export const TOOLS: ToolDef[] = [
  // ── Públicos SAT (cache local, sin cuenta) ──────────────────────────────
  {
    name: "sat_efos_check",
    description:
      "Check whether an RFC is on the SAT 69-B list (EFOS: contribuyentes con " +
      "operaciones presuntamente inexistentes). Returns situación (presunto / " +
      "definitivo / desvirtuado / sentencia favorable), oficio, and publication " +
      "dates. Public, no auth. Correctness-critical: a false 'clean' is dangerous.",
    inputSchema: z.object({
      rfc: z.string().describe("RFC del contribuyente a verificar (12 o 13 caracteres)."),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "sat_debts_check",
    description:
      "Check whether an RFC appears on the SAT art. 69 list (contribuyentes con " +
      "créditos fiscales firmes y no pagados). Public, no auth.",
    inputSchema: z.object({
      rfc: z.string().describe("RFC del contribuyente a verificar."),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "cfdi_verify",
    description:
      "Verify a CFDI's status against the SAT (ConsultaCFDIService): vigente / " +
      "cancelado / no encontrado, plus whether the emitter is on the 69-B/EFOS " +
      "list (ValidacionEFOS). Needs the exact QR fields (emisor RFC, receptor RFC, " +
      "total, UUID) or the raw XML. Public, no auth, no FIEL. Note: 'vigente' only " +
      "means 'not canceled' — it does NOT imply deductible or that the operation existed.",
    inputSchema: z.object({
      uuid: z.string().optional().describe("Folio fiscal (UUID) del CFDI."),
      emisorRfc: z.string().optional().describe("RFC del emisor."),
      receptorRfc: z.string().optional().describe("RFC del receptor."),
      total: z.number().optional().describe("Total del CFDI (con decimales exactos)."),
      xmlBase64: z.string().optional().describe("XML timbrado completo en base64 (alternativa a los 4 campos)."),
    }),
    annotations: { readOnlyHint: true },
  },

  // ── Descarga (e-firma local) ────────────────────────────────────────────
  {
    name: "fintecia_efirmas",
    description:
      "List the e-firmas registered locally on this machine (RFC + whether its " +
      "password is in the OS keyring). Call before cfdi_download to learn which " +
      "RFC to use: if exactly one is returned, use it directly; if several, ask " +
      "the user. Local read — no Fintecia account needed.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "cfdi_download",
    description:
      "Download CFDIs from the SAT for a period using the LOCAL e-firma (never " +
      "uploaded to Fintecia). Use the rfc from fintecia_efirmas. Emitidos = " +
      "invoices you issued; recibidos = invoices you received. Runs in the " +
      "background and takes a few minutes (the SAT prepares packages async): " +
      "returns a jobId immediately, then poll cfdi_download_status until it " +
      "completes and tell the user when their CFDIs are ready. Only the " +
      "resulting CFDIs are uploaded to Fintecia (the .cer/.key/password never " +
      "leave the machine).",
    inputSchema: z.object({
      tipo: z.enum(["emitidos", "recibidos", "ambos"]).describe("Qué descargar."),
      desde: z.string().describe("Fecha de inicio (YYYY-MM-DD)."),
      hasta: z.string().describe("Fecha de fin (YYYY-MM-DD)."),
      rfc: z
        .string()
        .describe("RFC de la e-firma local a usar (clave del FielProvider)."),
    }),
    annotations: { destructiveHint: true },
  },
  {
    name: "cfdi_download_status",
    description:
      "Poll a DescargaMasiva job (autentica → verificacion → descarga → upload). " +
      "Re-check every ~30 seconds while it is 'running'. When status is " +
      "'completed', tell the user their CFDIs were downloaded and processed, " +
      "then read them with the fintecia_* tools. If 'failed', surface the error " +
      "to the user.",
    inputSchema: z.object({
      jobId: z.string().describe("ID del job devuelto por cfdi_download."),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "cfdi_sync_status",
    description: "How up-to-date the local CFDI data is (last successful download, pending catch-up).",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  },

  // ── Fintecia (auth, materializado) ──────────────────────────────────────
  {
    name: "fintecia_profile",
    description:
      "Who the authenticated user is and which taxpayer(s) they are linked to " +
      "(multi-taxpayer). Call this first among the fintecia_* reads to learn the " +
      "available taxpayer RFCs.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "fintecia_transactions",
    description:
      "Income/expenses across CFDI + bank, filterable by text. " +
      "Raw data: use for INSPECTION only, never to sum totals — use " +
      "fintecia_financials for any 'how much' answer.",
    inputSchema: z.object({
      taxpayerRfc: z.string().describe("RFC del contribuyente."),
      query: z.string().optional().describe("Texto a buscar (descripción, referencia, UUID)."),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "fintecia_cfdi",
    description:
      "Search/view emitted and received invoices. Use to inspect WHICH transactions " +
      "are behind a number; never to sum totals.",
    inputSchema: z.object({
      taxpayerRfc: z.string().describe("RFC del contribuyente."),
      query: z.string().optional().describe("Texto a buscar (razón social, UUID, etc.)."),
      emisorRfc: z.string().optional(),
      receptorRfc: z.string().optional(),
      fechaStart: z.string().optional().describe("YYYY-MM-DD."),
      fechaEnd: z.string().optional().describe("YYYY-MM-DD."),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "fintecia_financials",
    description:
      "Materialized financial statements computed by Fintecia — use ALWAYS to answer " +
      "'how much', never recompute from raw transactions. Every money field is an object " +
      "{ currency: 'MXN', amount: number } (sign is meaningful: a negative liability/supplier " +
      "is an anticipo, they owe you). Returns: balances (assets/liabilities), periodNet " +
      "(income, expenses, taxes = ISR causado + PTU, isrRetenido = prepaid ISR a favor [PF only], " +
      "result = income − expenses − taxes), receivablesPayables, cash, iva (balance-sheet IVA), " +
      "ratios, health, and the full NIF B-3 incomeStatement and NIF B-6 balanceSheet. " +
      "For the meaning of each field, call fintecia_glosario first.",
    inputSchema: z.object({
      taxpayerRfc: z.string().describe("RFC del contribuyente a consultar."),
      hasta: z.string().optional().describe("Corte (YYYY-MM-DD), default hoy."),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "fintecia_reconciliation",
    description: "Bank↔CFDI reconciliation status: matched, suggested, pending approval, unmatched.",
    inputSchema: z.object({
      taxpayerRfc: z.string().describe("RFC del contribuyente a consultar."),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "fintecia_tax_summary",
    description: "Materialized ISR/IVA summary per period (computed by Fintecia).",
    inputSchema: z.object({
      taxpayerRfc: z.string().describe("RFC del contribuyente."),
      periodo: z.string().describe("Periodo, ej. '2026-11'."),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "fintecia_risk_report",
    description:
      "Cross ALL counterparties against the SAT 69-B/69 lists, with severity and " +
      "amounts billed to each. Materialized by Fintecia.",
    inputSchema: z.object({
      taxpayerRfc: z.string().describe("RFC del contribuyente."),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "fintecia_risk_check",
    description:
      "Risk card for a single supplier RFC: 69-B status, art. 69, canceled invoices, " +
      "and payment anomalies in your history.",
    inputSchema: z.object({
      taxpayerRfc: z.string().describe("RFC del contribuyente."),
      rfc: z.string().describe("RFC del proveedor a evaluar."),
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "fintecia_deductibility",
    description:
      "Per-expense deductibility verdict: CFDI valid + paid via bank (not cash) + " +
      "supplier not on 69-B. Materialized by Fintecia. Returns deducible / no " +
      "deducible / en riesgo / pendiente with evidence.",
    inputSchema: z.object({
      taxpayerRfc: z.string().describe("RFC del contribuyente."),
    }),
    annotations: { readOnlyHint: true },
  },
];
