/**
 * `cad3d/` — the **3D CAD** page moved over from `cad-app` in MyCastle: a
 * parametric modeller over the 2D drawing of `cad2d/`.
 *
 * ```tsx
 * import { Project, useProject } from '@hestia/ui-cad/cad2d';
 * import { Cad3dEditor } from '@hestia/ui-cad/cad3d';
 *
 * const project = useMemo(() => new Project(), []);
 * const { version } = useProject(project);
 *
 * <Cad3dEditor project={project} version={version} />
 * ```
 *
 * An entry of its own rather than part of `@hestia/ui-cad`, for one reason:
 * OpenCascade is a WASM kernel of several megabytes, and a page that wants only
 * notes must not carry it.
 *
 * A feature tree — sketches, extrudes, pockets, holes, grooves, revolves,
 * shells, fillets, chamfers, patterns, lofts, sweeps, helices and datums —
 * evaluated by OpenCascade (`opencascade.js`, a WASM build) into a solid.
 * Sketches are drawn on the very canvas of `cad2d/`, so both pages work on one
 * project.
 */

// The page
export { Cad3dEditor } from './ui/Cad3dEditor';
export type { Cad3dEditorProps, Cad3dApi, FeatureStamp } from './ui/Cad3dEditor';
export { useCad3d } from './hooks/useCad3d';
export type { Cad3dState } from './hooks/useCad3d';

// The model: the feature tree and what it is made of
export * from './model/types';
export { evaluateFeatureTreeAsync, buildDatumHelpers, buildSketchWireframes } from './model/evaluate';
export { solveConstraints, constraintTypeLabel } from './model/sketchConstraints';
export type { SketchConstraint, ConstraintType, SketchEntity } from './model/sketchConstraints';

// Picking vertices, edges and faces in the viewport, and the plane or datum a
// picked face defines
export { pickFace, pickEdge, pickVertex, planeFromFace, datumParamsFromFace, buildOverlay } from './model/subSelect';
export type { SubSelectMode, SubHit, HitFace, HitEdge, HitVertex } from './model/subSelect';

// The parts of the page, for a host that composes its own layout
export { Cad3dViewport } from './ui/Cad3dViewport';
export { FeatureTreePanel } from './ui/FeatureTreePanel';
export { FeaturePropsPanel } from './ui/FeaturePropsPanel';
export { SceneTreePanel } from './ui/SceneTreePanel';
export { SketchEditor } from './ui/SketchEditor';
export { ConstraintsPanel, ElementsPanel } from './ui/ConstraintsPanel';
export { FreeCadIcon } from './ui/FreeCadIcon';
export type { FreeCadIconName } from './ui/FreeCadIcon';

// OpenCascade: the kernel itself, and the drawing's solids as a STEP file
export { getOcc } from './occ/occLoader';
export { exportSTEP } from './io/stepExport';
