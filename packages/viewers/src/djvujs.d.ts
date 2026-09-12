/**
 * djvu.js (`djvujs-dist`) ships plain ESM sources and no types, so the little
 * of its surface this package touches is declared here. Only the decoder: the
 * encoder lives elsewhere in the library and nothing here writes DjVu.
 */
declare module 'djvujs-dist/library/src/DjVuDocument.js' {
  export interface DjVuPage {
    getImageData(rotate?: boolean): ImageData;
    getWidth(): number;
    getHeight(): number;
  }
  export default class DjVuDocument {
    // The document is parsed in the constructor — there is no separate load step.
    constructor(buffer: ArrayBuffer, options?: { baseUrl?: string | null; memoryLimit?: number });
    getPagesQuantity(): number;
    getPage(number: number): Promise<DjVuPage>;
    getPageUnsafe(number: number): DjVuPage;
  }
}
