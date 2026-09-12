/**
 * layout — jeden model układu, cztery sposoby jego wyliczenia.
 *
 * Moved over from MyCastle's `packages/layout`; used here by `scene3d/nodes/uiLayout.ts`.
 *
 * Pakiet powstał z obserwacji, że szkic CAD, interfejs, scena 3D i skład tekstu
 * rozwiązują ten sam problem — „gdzie to leży i jak duże jest" — czterema
 * różnymi rodzajami matematyki. Model danych jest wspólny, wybór matematyki
 * należy do dokumentu.
 */
export * from './model/types';
export { resolveValues } from './model/scope';
export type { ShapeValues, ResolveResult } from './model/scope';
export { solveLayout, solveStatic, solveAnchor, solveFlow, solveConstraint } from './solver';
export type { ConstraintOptions } from './solver/constraint';
export { dragShape } from './solver/drag';
export { applyDrag, previewDrag } from './solver/edit';
export type { DragOutcome } from './solver/edit';
export { snapToGrid } from './solver/snap';
export { evalExpr, exprDeps } from './expr/expr';
