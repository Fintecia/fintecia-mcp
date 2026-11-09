import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EfosLookup, normalizeRfc } from "./public/efos.js";

/**
 * Tool handlers. Real implementations are wired here as they land (T1b+);
 * un-implemented tools keep a stub that names the pending task.
 */

export type ToolResult = { content: Array<{ type: "text"; text: string }> };
export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

function loadEfos(): EfosLookup {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const json = readFileSync(
    path.join(here, "public", "data", "efos.fixture.json"),
    "utf8",
  );
  return EfosLookup.fromJson(JSON.parse(json));
}

function stub(name: string): ToolHandler {
  return async () => ({
    content: [
      {
        type: "text",
        text: `[fintecia-mcp] "${name}" is defined but not yet implemented (T1–T8).`,
      },
    ],
  });
}

export function createHandlers(): Map<string, ToolHandler> {
  const efos = loadEfos();

  const handlers = new Map<string, ToolHandler>();

  handlers.set("sat_efos_check", async (input) => {
    const rfc = normalizeRfc(String(input.rfc ?? ""));
    const entry = efos.check(rfc);
    if (!entry) {
      return {
        content: [
          {
            type: "text",
            text: `RFC ${rfc}: no aparece en el listado 69-B (operaciones presuntamente inexistentes).`,
          },
        ],
      };
    }
    const oficio = entry.oficio ? ` · oficio ${entry.oficio}` : "";
    return {
      content: [
        {
          type: "text",
          text: `RFC ${entry.rfc}: ${entry.situacion.toUpperCase()}${oficio} — ${entry.nombre}.`,
        },
      ],
    };
  });

  // Everything else keeps a stub until its task lands.
  for (const name of [
    "sat_debts_check",
    "cfdi_verify",
    "cfdi_download",
    "cfdi_download_status",
    "cfdi_sync_status",
    "fintecia_profile",
    "fintecia_transactions",
    "fintecia_cfdi",
    "fintecia_financials",
    "fintecia_reconciliation",
    "fintecia_tax_summary",
    "fintecia_risk_report",
    "fintecia_risk_check",
    "fintecia_deductibility",
  ]) {
    if (!handlers.has(name)) handlers.set(name, stub(name));
  }

  return handlers;
}
