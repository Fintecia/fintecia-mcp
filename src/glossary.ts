/**
 * Field glossary for the Fintecia MCP tools.
 *
 * The agent cannot reliably deduce accounting-semantics fields (taxes vs
 * prepaid ISR, IVA acreditable vs trasladado, preTaxIncome vs netIncome),
 * so this dictionary documents them. It is served by the static
 * `fintecia_glosario` tool — no auth, no backend round-trip — so the agent
 * can load it during onboarding, in parallel with login + e-firma.
 */

export interface GlossaryEntry {
  /** "summary" | "incomeStatement" | "balanceSheet" | "principio" */
  section: string;
  key: string;
  /** Short meaning in the domain language (neutral Spanish). */
  meaning: string;
}

export const FINANCIALS_GLOSSARY: GlossaryEntry[] = [
  // ── Principios ──
  {
    section: "principio",
    key: "currency",
    meaning: "Moneda de todos los montos. Hoy siempre MXN.",
  },
  {
    section: "principio",
    key: "money-object",
    meaning:
      "Todo monto es un objeto { currency, amount }. El amount lleva el signo: " +
      "un pasivo/proveedor negativo = anticipo (te deben), NO lo fuerces a positivo.",
  },
  {
    section: "principio",
    key: "agente-razona",
    meaning:
      "Fintecia calcula y materializa. Nunca re-sumas transacciones crudas: lee " +
      "los montos materializados.",
  },
  {
    section: "principio",
    key: "tipoPersona",
    meaning:
      '"personal" = PF (Persona Física), "business" = PM (Persona Moral). Define ' +
      "qué campos se exponen (isrRetenido y deducciones personales son de PF).",
  },

  // ── Summary ──
  { section: "summary", key: "balances.assets", meaning: "Activo total (lo que tienes)." },
  {
    section: "summary",
    key: "balances.liabilities",
    meaning: "Pasivo total (lo que debes). Negativo = anticipo (te deben).",
  },
  { section: "summary", key: "periodNet.income", meaning: "Ingresos del periodo." },
  {
    section: "summary",
    key: "periodNet.expenses",
    meaning: "Gastos del periodo (costo + operación + financieros, SIN impuestos).",
  },
  {
    section: "summary",
    key: "periodNet.taxes",
    meaning: "Impuestos a la utilidad: ISR causado + PTU. NO incluye ISR retenido.",
  },
  {
    section: "summary",
    key: "periodNet.isrRetenido",
    meaning:
      "ISR retenido (activo prepagado, 'ISR a favor'). Solo PF; se omite para PM.",
  },
  {
    section: "summary",
    key: "periodNet.result",
    meaning: "Utilidad neta = ingresos − gastos − impuestos.",
  },
  {
    section: "summary",
    key: "receivablesPayables.accountsReceivable",
    meaning: "Cuentas por cobrar (clientes te deben).",
  },
  {
    section: "summary",
    key: "receivablesPayables.suppliers",
    meaning: "Proveedores. Negativo = anticipo (te deben).",
  },
  {
    section: "summary",
    key: "receivablesPayables.diverseCreditors",
    meaning: "Acreedores diversos (otras deudas).",
  },
  {
    section: "summary",
    key: "cash.total",
    meaning: "Efectivo + bancos (caja contable derivada de los CFDI, no el saldo real del banco).",
  },
  {
    section: "summary",
    key: "iva.acreditable",
    meaning: "IVA acreditable (activo: IVA que pagaste a proveedores).",
  },
  {
    section: "summary",
    key: "iva.trasladadoPorPagar",
    meaning: "IVA trasladado por pagar (pasivo: IVA que cobraste a clientes).",
  },

  // ── Estado de resultados (NIF B-3) ──
  { section: "incomeStatement", key: "grossProfit", meaning: "Utilidad bruta = ingresos − costo de ventas." },
  {
    section: "incomeStatement",
    key: "operatingIncome",
    meaning: "Utilidad de operación = utilidad bruta − gastos de operación.",
  },
  {
    section: "incomeStatement",
    key: "preTaxIncome",
    meaning: "Utilidad antes de impuestos = utilidad de operación − gastos financieros.",
  },
  {
    section: "incomeStatement",
    key: "incomeTax.isr",
    meaning: "ISR CAUSADO (provisión, 5501). No incluye el retenido.",
  },
  {
    section: "incomeStatement",
    key: "incomeTax.ptu",
    meaning: "PTU (participación de los trabajadores).",
  },
  {
    section: "incomeStatement",
    key: "incomeTax.isrRetenido",
    meaning: "ISR retenido (1109) = activo prepagado. Solo PF; 0 para PM.",
  },
  {
    section: "incomeStatement",
    key: "netIncome",
    meaning: "Utilidad neta = preTaxIncome − ISR causado − PTU. Igual a periodNet.result.",
  },
  {
    section: "incomeStatement",
    key: "netReceived",
    meaning: "Neto recibido en banco = ingresos − ISR retenido. Solo PF.",
  },
  {
    section: "incomeStatement",
    key: "regimeStatements",
    meaning:
      "Un sub-estado de resultados por cada régimen fiscal del contribuyente " +
      "(régimenFiscal + label legible). Con 2+ regímenes, cada uno viene separado.",
  },
  {
    section: "incomeStatement",
    key: "personalDeductionTotal",
    meaning: "Deducciones personales (Art. 151, anuales). 0 en periodos mensuales.",
  },

  // ── Balance general (NIF B-6) ──
  { section: "balanceSheet", key: "assets", meaning: "Activos: circulante + fijo + diferido." },
  { section: "balanceSheet", key: "liabilities", meaning: "Pasivos: corto + largo plazo." },
  {
    section: "balanceSheet",
    key: "equity",
    meaning: "Capital contable. Incluye Resultado del Ejercicio (utilidad del periodo).",
  },
  {
    section: "balanceSheet",
    key: "currentAssets.isrAFavor",
    meaning: "ISR a favor (activo prepagado, 1109). El retenido que te hicieron.",
  },
  {
    section: "balanceSheet",
    key: "currentLiabilities.ivaTrasladadoPorPagar",
    meaning: "IVA trasladado por pagar (2103).",
  },
];
