/**
 * SAT 69-B (EFOS) lookup — contribuyentes con operaciones presuntamente
 * inexistentes. Public, no auth. The full list is refreshed from the SAT open
 * data (or a mirror); a small fixture is bundled so the tool works out of the
 * box for testing.
 *
 * Correctness-critical: a false "not on the list" is dangerous. Normalize the
 * RFC (uppercase, no whitespace) before lookup.
 */

export type EfosSituacion =
  | "presunto"
  | "definitivo"
  | "desvirtuado"
  | "sentencia_favorable";

export interface EfosEntry {
  rfc: string;
  nombre: string;
  situacion: EfosSituacion;
  /** Oficio de notificación (SAT), si se conoce. */
  oficio?: string;
  /** Fecha de publicación (ISO YYYY-MM-DD), si se conoce. */
  fechaPublicacion?: string;
}

export function normalizeRfc(rfc: string): string {
  return rfc.trim().toUpperCase();
}

export class EfosLookup {
  private readonly byRfc: Map<string, EfosEntry>;

  constructor(entries: EfosEntry[]) {
    this.byRfc = new Map(entries.map((e) => [normalizeRfc(e.rfc), e]));
  }

  check(rfc: string): EfosEntry | null {
    return this.byRfc.get(normalizeRfc(rfc)) ?? null;
  }

  get size(): number {
    return this.byRfc.size;
  }

  /** Build an EfosLookup from raw JSON (array of EfosEntry). */
  static fromJson(json: unknown): EfosLookup {
    if (!Array.isArray(json)) {
      throw new Error("EFOS data must be an array");
    }
    const entries: EfosEntry[] = json.map((e) => {
      const item = e as Partial<EfosEntry>;
      if (typeof item.rfc !== "string" || typeof item.situacion !== "string") {
        throw new Error("EFOS entry missing rfc/situacion");
      }
      return {
        rfc: item.rfc,
        nombre: item.nombre ?? "",
        situacion: item.situacion as EfosSituacion,
        oficio: item.oficio,
        fechaPublicacion: item.fechaPublicacion,
      };
    });
    return new EfosLookup(entries);
  }
}
