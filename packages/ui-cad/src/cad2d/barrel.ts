/**
 * `cad2d/` — the **2D CAD** page moved over from `cad-app` in MyCastle, together
 * with the drawing engine it stands on (MyCastle's `@mhersztowski/core-cad`).
 *
 * ```tsx
 * import { Cad2dEditor, Project } from '@hestia/ui-cad/cad2d';
 *
 * const project = useMemo(() => new Project(), []);
 * <Cad2dEditor project={project} />
 * ```
 *
 * The engine and the page live together on purpose: the page is not a view over
 * the engine, it *is* the engine's interface — tools, snapping, history and
 * selection are shared, and separating them would put a boundary through the
 * middle of one mouse click.
 *
 * This is what `@hestia/ui-cad/cad2d` resolves to. `cad3d/` imports from here
 * directly, because a sketch is a 2D drawing.
 */

// The page
export { Cad2dEditor } from './ui/Cad2dEditor';
export type { Cad2dEditorProps } from './ui/Cad2dEditor';
export { useProject } from './hooks/useProject';

// The drawing: entities, layers, history, selection, snapping
export * from './core';

// The parts of the page, for a host that composes its own layout
export { CadCanvas } from './ui/CadCanvas';
export type { PlacementStamp } from './ui/CadCanvas';
export { ActionBar } from './ui/ActionBar';
export { Toolbar } from './ui/Toolbar';
export { StatusBar } from './ui/StatusBar';
export { CommandLine } from './ui/CommandLine';
export { LayerPanel } from './ui/LayerPanel';
export { PropertiesPanel } from './ui/PropertiesPanel';
export { ScaleBar } from './ui/ScaleBar';
export { DimensionOverlay } from './ui/DimensionOverlay';
export { GripOverlay } from './ui/GripOverlay';
export { ConstraintSymbolsOverlay } from './ui/ConstraintSymbolsOverlay';
export type { SketchConstraintLite } from './ui/ConstraintSymbolsOverlay';

// Tools — the same instances the canvas uses, so a host can drive them
export type { Tool, ToolName, ToolContext, PreviewGeometry, DimensionLabel, PenInput } from './tools/types';
export { DEFAULT_PEN_INPUT } from './tools/types';
export { pickSub, subElementsInRect } from './tools/sketchPick';
export { translateEntity } from './tools/entityTransform';
export { rebuildConstruction } from './tools/shapeRebuild';
export type { Construction } from './tools/shapeRebuild';
// Driving dimensions: what a dimension measures, and holding the geometry to a value
export { dimRefs, measuredValue, applyDimensionValue } from './tools/dimensionDrive';

// Rendering (three.js) — the 3D modeller draws with the same renderer
export { CadRenderer } from './renderer/CadRenderer';
export { buildEntityObject, build3dEntityObject, buildPreviewObject } from './renderer/EntityMeshBuilder';

// Files: JSON, DXF, SVG, OBJ, glTF, STL. STEP export needs OpenCascade and
// lives in `cad3d/`.
export {
  exportJSON, importJSON, loadProjectFromText, mergeProjectFromText,
  exportDXF, importDXF, exportSVG, buildSVGString, exportOBJ, exportGLTF, exportSTL,
  shiftEntity, computeEntitiesCentroid,
} from './io/CadExporter';

// The FreeCAD icons the toolbar draws — see `assets/freecadIcons.ts`
export { configureFreecadIcons, freecadIconUrl } from './assets/freecadIcons';
export type { FreecadIconOptions } from './assets/freecadIcons';
