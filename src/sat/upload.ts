import type { DownloadedCfdi } from "./parse.js";

/**
 * Client for the frozen Fintecia upload endpoint (contrato congelado).
 *
 *   POST /api/v1/mcp/cfdi/upload
 *   Authorization: Bearer <idToken>
 *   body: { taxpayerRfc, cfdis: Array<{uuid,emisorRfc,receptorRfc,total,fecha,tipo,xml}> }
 *   response: { accepted: number, rejected: Array<{uuid,reason}> }
 *
 * The backend is built in parallel in another repo; this client codes against
 * the frozen contract exactly. `fetch` is injectable for tests (no nodecfdi).
 */

export interface UploadRejection {
  uuid: string;
  reason: string;
}

export interface UploadResponse {
  accepted: number;
  rejected: UploadRejection[];
}

export interface UploadBatch {
  taxpayerRfc: string;
  cfdis: DownloadedCfdi[];
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

  async upload(batch: UploadBatch): Promise<UploadResponse> {
    const res = await this.fetch(
      `${this.config.baseUrl}/api/v1/mcp/cfdi/upload`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.idToken}`,
        },
        body: JSON.stringify(batch),
      },
    );
    if (!res.ok) {
      throw new Error(`upload failed: ${res.status}`);
    }
    return parseUploadResponse(await res.json());
  }
}

/** Validate + normalize the frozen upload response shape. */
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
    const { uuid, reason } = item as { uuid?: unknown; reason?: unknown };
    if (typeof uuid !== "string" || uuid === "") {
      throw new Error(`respuesta de upload: rejected[${i}].uuid inválido`);
    }
    if (typeof reason !== "string") {
      throw new Error(`respuesta de upload: rejected[${i}].reason inválido`);
    }
    return { uuid, reason };
  });

  return { accepted, rejected: items };
}
