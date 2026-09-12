/**
 * `import Worker from '…?worker'` is Vite's syntax, and the host resolves it —
 * the import survives this package's bundle untouched (see `PdfView.tsx`).
 * TypeScript knows nothing about the suffix, so the declaration is ours; a
 * `vite/client` reference would mean a dependency on Vite for one type.
 */
declare module '*?worker' {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}
