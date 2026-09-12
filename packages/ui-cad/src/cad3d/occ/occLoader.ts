// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — opencascade.js ships its own internal WASM handling
import initOpenCascade from 'opencascade.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OCC = any;

let _occ: OCC | null = null;
let _initPromise: Promise<OCC> | null = null;

export function getOcc(): Promise<OCC> {
  if (_occ) return Promise.resolve(_occ);
  if (_initPromise) return _initPromise;
  const p = (initOpenCascade() as Promise<OCC>).then((oc: OCC) => {
    _occ = oc;
    return oc;
  });
  _initPromise = p;
  return p;
}

/** Eagerly start loading OCC WASM in the background. */
export function preloadOcc(): void {
  void getOcc();
}
