/**
 * Minimal type declarations for `@nodecfdi/cfdiutils-core`.
 *
 * The package's `exports` map lacks a `types` condition, so tsc cannot resolve
 * `dist/types/index.d.ts` (TS7016). These declarations describe the exact
 * runtime surface `seal.ts` relies on (mirrored from the nodecfdi source), so
 * the ESM seam stays typed without touching tsconfig or the library.
 */
declare module "@nodecfdi/cfdiutils-core" {
  export class TfdCadenaDeOrigen {
    constructor(xmlResolver?: unknown, xsltBuilder?: unknown);
    build(tfdXmlString: string, version?: string): Promise<string>;
    static xsltLocation(version: string): string;
  }

  export class SatCertificateNumber {
    constructor(id: string);
    number(): string;
    remoteUrl(): string;
    static isValidCertificateNumber(id: string): boolean;
  }

  export class CerRetriever {
    constructor(basePath: string, downloader?: unknown);
    retrieve(url: string): Promise<string>;
  }
}
