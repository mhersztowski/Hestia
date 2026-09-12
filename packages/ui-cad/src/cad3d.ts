/**
 * `@hestia/ui-cad/cad3d` — the 3D CAD page: a parametric modeller over the 2D
 * drawing.
 *
 * Separate from `index.ts` for a reason beyond tidiness: everything reachable
 * from here pulls in OpenCascade, a WASM kernel of several megabytes. A host
 * that shows notes or a drawing never imports this file, and so never carries
 * it.
 */
export * from './cad3d/barrel';
