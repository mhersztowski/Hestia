/**
 * Lightweight graphics export to PNG / SVG / PDF — with no external dependencies.
 *
 * A copy from `cad-app` without the Leaflet map capture: the notes never call it,
 * and the package itself has no Leaflet and no reason to start needing one.
 *
 * - PNG: from any HTMLCanvasElement (or a rasterised SVG).
 * - SVG: serialising a live <svg> (vector), or wrapping a raster (PNG) in an <image>.
 * - PDF: a minimal, single-page PDF with an embedded JPEG image (DCTDecode).
 */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadText(text: string, filename: string, mime = 'image/svg+xml;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export function loadImage(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image load failed: ' + src.slice(0, 80)));
    img.src = src;
  });
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob (png) failed'))), 'image/png'));
}

/** Rasterises an SVG string onto a canvas (white background, scaled for sharpness). */
export async function rasterizeSvg(svg: string, w: number, h: number, scale = 2, bg: string | null = '#ffffff'): Promise<HTMLCanvasElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext('2d')!;
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Wraps a raster PNG (data URL) in an SVG file as an <image>. */
export function pngToSvgString(pngDataUrl: string, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<image width="${w}" height="${h}" xlink:href="${pngDataUrl}"/></svg>`;
}

/** Serialises a live <svg> element into a standalone file (vector). */
export function serializeSvgElement(svg: SVGSVGElement, w: number, h: number, bg = '#ffffff'): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
  // The background (first, under the content), so PNG/PDF are not transparent.
  const rect = `<rect x="0" y="0" width="100%" height="100%" fill="${bg}"/>`;
  const inner = new XMLSerializer().serializeToString(clone);
  return inner.replace(/(<svg[^>]*>)/, `$1${rect}`);
}

/** A minimal, single-page PDF with an embedded JPEG image. */
export function jpegToPdfBlob(jpegDataUrl: string, pxW: number, pxH: number): Blob {
  const b64 = jpegDataUrl.slice(jpegDataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const img = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i) & 0xff;

  // Fit the page to A4 (in points) while keeping the aspect ratio.
  const A4W = 595.28, A4H = 841.89;
  const sc = Math.min(A4W / pxW, A4H / pxH);
  const pw = +(pxW * sc).toFixed(2), ph = +(pxH * sc).toFixed(2);

  const chunks: Uint8Array[] = [];
  let length = 0;
  const enc = (s: string) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return u; };
  const out = (s: string | Uint8Array) => { const u = typeof s === 'string' ? enc(s) : s; chunks.push(u); length += u.length; };
  const offsets: number[] = [];
  const obj = (n: number) => { offsets[n] = length; };

  out('%PDF-1.3\n%\xFF\xFF\xFF\xFF\n');
  obj(1); out('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj(2); out('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  obj(3); out(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  obj(4); out(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`);
  out(img);
  out('\nendstream\nendobj\n');
  const content = `q\n${pw} 0 0 ${ph} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(5); out(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefStart = length;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let n = 1; n <= 5; n++) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
  out(xref);
  out(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' });
}

// ── High-level helpers: canvas → PNG/SVG/PDF ────────────────────────────────────

export async function exportCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  downloadBlob(await canvasToPngBlob(canvas), filename);
}
export function exportCanvasSvg(canvas: HTMLCanvasElement, filename: string) {
  downloadText(pngToSvgString(canvas.toDataURL('image/png'), canvas.width, canvas.height), filename);
}
export function exportCanvasPdf(canvas: HTMLCanvasElement, filename: string) {
  downloadBlob(jpegToPdfBlob(canvas.toDataURL('image/jpeg', 0.92), canvas.width, canvas.height), filename);
}
