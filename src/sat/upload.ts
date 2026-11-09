/**
 * Client for the Fintecia upload endpoint. The MCP uploads the ZIP it
 * downloaded from the SAT (DescargaMasiva) as base64 — the backend reuses its
 * own ingest path (`ingestZipBuffer`, same as the web app's `processCfdiZip`).
 * No XML extraction happens in this client.
 *
 *   POST /api/v1/mcp/cfdi/upload
 *   Authorization: Bearer <idToken>
 *   body: { taxpayerRfc, zipBase64 }
 *   response: { accepted, rejected:[{folioFiscal,reason}], totalFiles, duplicates, ignored }
 */

export interface UploadRejection {
  folioFiscal: string | null;
  reason: string;
}

export interface UploadResponse {
  accepted: number;
  rejected: UploadRejection[];
  totalFiles?: number;
  duplicates?: number;
  ignored?: number;
}

export interface UploadZip {
  taxpayerRfc: string;
  zipBase64: string;
}

export interface UploadClientConfig {
  /** Fintecia backend base URL (no trailing slash). */
  baseUrl: string;
  /** Firebase ID token for the authenticated user. */
  idToken: string;
  /** Injectable fetch for tests. */
  fetchFn?: typeof fetch;
}

export class UploadClient {
  constructor(private readonly config: UploadClientConfig) {}

  private fetch(input: string, init?: RequestInit): Promise<Response> {
    const fn = this.config.fetchFn ?? fetch;
    return fn(input, init);
  }

  async upload(zip: UploadZip): Promise<UploadResponse> {
    const res = await this.fetch(
      `${this.config.baseUrl}/api/v1/mcp/cfdi/upload`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.idToken}`,
        },
        body: JSON.stringify(zip),
      },
    );
    if (!res.ok) {
      throw new Error(`upload failed: ${res.status}`);
    }
    return parseUploadResponse(await res.json());
  }
}

/** Validate + normalize the upload response shape. */
export function parseUploadResponse(body: unknown): UploadResponse {
  if (typeof body !== "object" || body === null) {
    throw new Error("respuesta de upload inválida");
  }
  const { accepted, rejected } = body as { accepted?: unknown; rejected?: unknown };

  if (typeof accepted !== "number" || !Number.isInteger(accepted) || accepted < 0) {
    throw new Error("respuesta de upload: accepted debe ser un entero >= 0");
  }
  if (!Array.isArray(rejected)) {
    throw new Error("respuesta de upload: rejected debe ser un array");
  }

  const items: UploadRejection[] = rejected.map((item, i) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`respuesta de upload: rejected[${i}] inválido`);
    }
    const { folioFiscal, reason } = item as { folioFiscal?: unknown; reason?: unknown };
    if (typeof reason !== "string") {
      throw new Error(`respuesta de upload: rejected[${i}].reason inválido`);
    }
    return { folioFiscal: folioFiscal == null ? null : String(folioFiscal), reason };
  });

  const { totalFiles, duplicates, ignored } = body as {
    totalFiles?: unknown;
    duplicates?: unknown;
    ignored?: unknown;
  };

  return {
    accepted,
    rejected: items,
    ...(typeof totalFiles === "number" ? { totalFiles } : {}),
    ...(typeof duplicates === "number" ? { duplicates } : {}),
    ...(typeof ignored === "number" ? { ignored } : {}),
  };
}
