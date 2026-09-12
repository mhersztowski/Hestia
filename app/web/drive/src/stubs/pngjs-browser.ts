/**
 * A stub for `pngjs/browser`.
 *
 * djvu.js (`DjVuPage.js`) imports pngjs for one thing only: exporting a page as
 * a PNG (`getPageImageDataUrl`), which the viewer never calls — it renders
 * through `getImageData()` onto a canvas. Without this the production build
 * stops at "Rollup failed to resolve import", and satisfying it properly would
 * pull pngjs, Buffer and zlib into a page that has no use for them.
 */
export const PNG = {
  sync: {
    write: () => { throw new Error('pngjs PNG export is not supported (stubbed for djvu.js)'); },
  },
};
export default { PNG };
