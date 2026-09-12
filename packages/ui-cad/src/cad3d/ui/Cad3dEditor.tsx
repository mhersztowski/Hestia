/**
 * The 3D CAD page — the `cad3d` mode of `cad-app` as one component.
 *
 * A parametric modeller: a feature tree (sketches, extrudes, pockets, holes,
 * revolves, patterns, fillets, datums) evaluated by OpenCascade into a solid,
 * with a viewport, a tree panel, a properties panel and a sketch editor that
 * borrows the 2D canvas from `cad2d/`.
 */
import { useState, useCallback, useEffect, useMemo, type MutableRefObject, type ReactNode } from 'react';
import * as THREE from 'three';
import { Alert, Box, Chip, Divider, Snackbar, Typography } from '@mui/material';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import {
  Toolbar as CoreToolbar, custom, item, separator, submenu, toggle, type ToolbarNode,
} from '@hestia/ui-core';
// MUI icons for the toolbars outside Ops (GridOnIcon for Add Sketch, say).
// The Ops toolbar draws <FreeCadIcon> — FreeCAD's own SVGs (LGPL).
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { FreeCadIcon, type FreeCadIconName } from './FreeCadIcon';
import GridOnIcon from '@mui/icons-material/GridOn';
import NearMeIcon from '@mui/icons-material/NearMe';
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot';
import TimelineIcon from '@mui/icons-material/Timeline';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import type { Project } from '../../cad2d/barrel';
import { useCad3d } from '../hooks/useCad3d';
import { Cad3dViewport } from './Cad3dViewport';
import { FeatureTreePanel } from './FeatureTreePanel';
import { FeaturePropsPanel } from './FeaturePropsPanel';
import { SceneTreePanel } from './SceneTreePanel';
import { SketchEditor } from './SketchEditor';
import type { SketchFeature, SketchPlane } from '../model/types';
import { planeFromFace, datumParamsFromFace } from '../model/subSelect';
import type { SubSelectMode, SubHit } from '../model/subSelect';

/**
 * What the host can do to the model from the outside — its own file menu saves
 * and opens with these. In `cad-app` the same three functions were registered
 * through three separate refs; one object is one thing to hold on to.
 */
export interface Cad3dApi {
  /** The feature tree as JSON — what a file of a saved model holds. */
  getTreeJson(): string;
  /** Replaces the whole tree with one from JSON: opening a file. */
  replaceTree(json: string): void;
  /** Adds the features from JSON to the tree, giving them fresh ids: inserting one model into another. */
  mergeFeatures(json: string): void;
}

/**
 * A model armed for stamping: every click in the viewport adds it to the tree at
 * the origin, until the host disarms it. `tree` is the same JSON `getTreeJson`
 * produces — in `cad-app` the component fetched it from the template
 * repository's address itself; here it arrives ready, and the page has no
 * opinion about where it came from.
 */
export interface FeatureStamp {
  id: string;
  tree: string;
}

export interface Cad3dEditorProps {
  /**
   * The 2D drawing the sketches live in. The modeller keeps its own feature
   * tree, but a sketch is edited on the very canvas of `cad2d/`, so both
   * pages work on one project.
   */
  project: Project;
  /** The drawing's version counter — `useProject(project).version`. */
  version: number;
  /** Filled in with the model's API, for the host's file menu. */
  apiRef?: MutableRefObject<Cad3dApi | null>;
  /** A model armed for stamping — see `FeatureStamp`. */
  placementStamp?: FeatureStamp | null;
  /**
   * The host's own controls at the start of the toolbar — this is where a file
   * menu goes. In the bar rather than above it: two bars stacked on a tablet
   * cost a fifth of the viewport.
   */
  toolbarStart?: ReactNode;
}

function fmt(v: number) { return v.toFixed(2); }

function SubHitLabel({ hit }: { hit: SubHit | null }) {
  if (!hit) return null;

  let label = '';
  let color: 'default' | 'warning' | 'info' | 'success' = 'default';

  if (hit.type === 'vertex') {
    const p = hit.position;
    label = `Vertex  (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})`;
    color = 'info';
  } else if (hit.type === 'edge') {
    const len = hit.a.distanceTo(hit.b);
    label = `Edge  L = ${fmt(len)}`;
    color = 'warning';
  } else if (hit.type === 'face') {
    const n = hit.normal;
    label = `Face  N (${fmt(n.x)}, ${fmt(n.y)}, ${fmt(n.z)})`;
    color = 'success';
  }

  return (
    <Chip
      label={label}
      size="small"
      color={color}
      variant="outlined"
      sx={{ fontFamily: 'monospace', fontSize: '0.68rem', height: 22 }}
    />
  );
}

export function Cad3dEditor({ project, version, apiRef, placementStamp, toolbarStart }: Cad3dEditorProps) {
  const {
    tree, selectedId, editingSketchId,
    mergeFeatures, getTreeJson, replaceTree,
    addSketch, startEditSketch, exitSketch, getSketchProject,
    addExtrude, addPocket, addHole, addGroove,
    addMirror, addRevolve, addShell, addFillet, addChamfer, addLinearPattern, addPolarPattern, addLoft, addLoftCut, addSweep, addSweepCut, addHelix,
    addDatumPoint, addDatumLine, addDatumPlane, addDatumCs,
    removeFeature, updateFeature, toggleFeature, moveFeature,
    selectFeature, clearTree,
  } = useCad3d();

  const [sceneRoot, setSceneRoot] = useState<THREE.Object3D | null>(null);
  const [subSelectMode, setSubSelectMode] = useState<SubSelectMode>('object');
  const [subHit, setSubHit] = useState<SubHit | null>(null);
  const [evalError, setEvalError] = useState<{ feature: string; reason: string } | null>(null);

  // Errors from the OCC evaluator (evalExtrude, evalRevolve, …): the dispatcher
  // emits 'cad3d:eval-error' rather than quietly returning null, so that the
  // reason reaches the user — "the sketch does not close", say.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { feature: string; reason: string } | undefined;
      if (detail?.feature && detail?.reason) setEvalError({ feature: detail.feature, reason: detail.reason });
    };
    window.addEventListener('cad3d:eval-error', handler);
    return () => window.removeEventListener('cad3d:eval-error', handler);
  }, []);

  // The host's handle on the model, for its own file menu.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { getTreeJson, replaceTree, mergeFeatures };
    return () => { apiRef.current = null; };
  }, [apiRef, getTreeJson, replaceTree, mergeFeatures]);

  const handleSceneChange = useCallback((root: THREE.Object3D) => setSceneRoot(root), []);
  const handleSubSelect = useCallback((hit: SubHit | null) => setSubHit(hit), []);

  const handleViewportPlacementClick = useCallback(() => {
    if (placementStamp) mergeFeatures(placementStamp.tree);
  }, [placementStamp, mergeFeatures]);

  const selectedFeature = tree.features.find(f => f.id === selectedId) ?? null;

  if (editingSketchId) {
    const sketch = tree.features.find(f => f.id === editingSketchId) as SketchFeature | undefined;
    if (sketch) {
      return (
        <SketchEditor
          project={getSketchProject(editingSketchId)}
          plane={sketch.plane}
          onExit={exitSketch}
        />
      );
    }
  }

  function getSketchId(): string | null {
    const selected = selectedId ? tree.features.find(f => f.id === selectedId) : null;
    if (selected?.type === 'sketch') return selected.id;
    const sketches = tree.features.filter(f => f.type === 'sketch');
    return sketches.length > 0 ? sketches[sketches.length - 1].id : null;
  }

  const handleAddSketch = (plane: SketchPlane) => addSketch(plane);

  const faceHit = subHit?.type === 'face' ? subHit : null;
  const faceInfo = faceHit ? planeFromFace(faceHit) : null;
  // Edge hit → midpoint + tangent direction (dla Fillet/Chamfer edge selection)
  const edgeHit = subHit?.type === 'edge' ? subHit : null;
  const edgeInfo = edgeHit ? {
    midpoint: [
      (edgeHit.a.x + edgeHit.b.x) / 2,
      (edgeHit.a.y + edgeHit.b.y) / 2,
      (edgeHit.a.z + edgeHit.b.z) / 2,
    ] as [number, number, number],
    tangent: (() => {
      const dx = edgeHit.b.x - edgeHit.a.x;
      const dy = edgeHit.b.y - edgeHit.a.y;
      const dz = edgeHit.b.z - edgeHit.a.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      return [dx / len, dy / len, dz / len] as [number, number, number];
    })(),
  } : null;

  const handleSketchOnFace = () => {
    if (!faceInfo) return;
    addSketch(faceInfo.plane, faceInfo.offset, faceInfo.planeMatrix, faceInfo.faceRef);
    setSubHit(null);
    setSubSelectMode('object');
  };

  // ── Datum (odniesienia geometryczne) na zaznaczonej face ──────────────────
  const datumParams = faceHit ? datumParamsFromFace(faceHit) : null;

  const handleDatumPointOnFace = () => {
    if (!datumParams) return;
    addDatumPoint(datumParams.position);
    setSubHit(null); setSubSelectMode('object');
  };
  const handleDatumLineOnFace = () => {
    if (!datumParams) return;
    // A line perpendicular to the face — its direction is the face normal, its length follows the face's size
    addDatumLine(datumParams.position, datumParams.normal, datumParams.size);
    setSubHit(null); setSubSelectMode('object');
  };
  const handleDatumPlaneOnFace = () => {
    if (!datumParams) return;
    // A plane along the face — its normal is the face normal
    addDatumPlane(datumParams.position, datumParams.normal, datumParams.size);
    setSubHit(null); setSubSelectMode('object');
  };
  const handleDatumCsOnFace = () => {
    if (!datumParams) return;
    // A coordinate system from the face's U/V/N basis (the CS's Z axis is the face normal)
    addDatumCs(datumParams.position, datumParams.rotationEulerXYZ, datumParams.size * 0.6);
    setSubHit(null); setSubSelectMode('object');
  };

  /**
   * The toolbar as a tree of nodes, drawn by `@hestia/ui-core`.
   *
   * The operations stay side by side rather than being folded into an "Ops"
   * menu: they are what this page is for, and a menu would add a click to every
   * one of them. When the window is too narrow for sixteen, the bar scrolls —
   * the package takes care of that, and a finger drags it.
   */
  const toolbarNodes: ToolbarNode[] = useMemo(() => {
    const op = (id: string, label: string, icon: FreeCadIconName, title: string, run: () => void) =>
      item(id, label, { icon: <FreeCadIcon name={icon} />, title, onSelect: run });

    const sketchNodes: ToolbarNode[] = faceInfo
      // With a face selected, everything is built ON that face, and the entries
      // say so — the same buttons would otherwise mean something else entirely.
      ? [
        item('sketchOnFace', 'Sketch on face', {
          icon: <GridOnIcon fontSize="small" />,
          title: 'A sketch on the selected face — centred on it, in its own orientation',
          onSelect: handleSketchOnFace,
        }),
        submenu('faceDatums', 'On face', [
          item('faceDatumPoint', 'Point at the centroid', { onSelect: handleDatumPointOnFace }),
          item('faceDatumLine', 'Line along the normal', { onSelect: handleDatumLineOnFace }),
          item('faceDatumPlane', 'Plane along the face', { onSelect: handleDatumPlaneOnFace }),
          item('faceDatumCs', 'Coordinate system (Z = the normal)', { onSelect: handleDatumCsOnFace }),
        ], { icon: <GpsFixedIcon fontSize="small" /> }),
      ]
      : [
        submenu('addSketch', 'Add sketch', [
          item('sketchXY', 'XY — front plane', { onSelect: () => handleAddSketch('XY') }),
          item('sketchXZ', 'XZ — top plane', { onSelect: () => handleAddSketch('XZ') }),
          item('sketchYZ', 'YZ — right plane', { onSelect: () => handleAddSketch('YZ') }),
        ], { icon: <GridOnIcon fontSize="small" /> }),
      ];

    return [
      ...(toolbarStart ? [custom('hostStart', toolbarStart), separator('s0')] : []),
      ...sketchNodes,
      separator('s1'),

      /*
       * The operations, grouped the way FreeCAD's own colours already group
       * them: what ADDS material and what TAKES it away. Sixteen buttons in a
       * row is a row nobody reads — and the two that matter most, Extrude and
       * Pocket, sat among fourteen others that look alike at a glance.
       *
       * Each group's button carries the operation it is named after, so the
       * common one is still a single click; the arrow beside it holds the rest.
       */
      submenu('additive', 'Additive', [
        op('extrude', 'Extrude', 'extrude', 'Extrude the selected sketch', () => addExtrude(getSketchId(), [])),
        op('revolve', 'Revolve', 'revolve', 'Revolve the selected profile about an axis', () => addRevolve(getSketchId(), [])),
        op('loft', 'Loft', 'loft', 'Loft — blend through several cross-sections', () => addLoft()),
        op('sweep', 'Sweep', 'sweep', 'Sweep — a profile along a path', () => addSweep()),
        op('helix', 'Helix', 'helix', 'Helix — a profile along a helical spine', () => addHelix()),
      ], {
        icon: <FreeCadIcon name="extrude" />,
        title: 'Adds material — extrude, revolve, loft, sweep, helix',
        // The button itself does the usual one; the arrow offers the group.
        onSelect: () => addExtrude(getSketchId(), []),
      }),

      submenu('subtractive', 'Subtractive', [
        op('pocket', 'Pocket', 'pocket', 'Pocket — subtract the selected sketch from the solid', () => addPocket(getSketchId(), [])),
        op('hole', 'Hole', 'hole', 'Hole — drill a cylinder at each circle of the sketch', () => addHole(getSketchId())),
        op('groove', 'Groove', 'groove', 'Groove — a subtractive revolution', () => addGroove(getSketchId(), [])),
        op('loftCut', 'Loft cut', 'loft_cut', 'Loft cut — a subtractive loft', () => addLoftCut()),
        op('sweepCut', 'Sweep cut', 'sweep_cut', 'Sweep cut — a subtractive sweep', () => addSweepCut()),
      ], {
        icon: <FreeCadIcon name="pocket" />,
        title: 'Takes material away — pocket, hole, groove, loft cut, sweep cut',
        onSelect: () => addPocket(getSketchId(), []),
      }),

      // Neither adds nor subtracts: these reshape what is already there.
      submenu('dressUp', 'Dress-up', [
        op('fillet', 'Fillet', 'fillet', 'Fillet — round the sharp edges', () => addFillet()),
        op('chamfer', 'Chamfer', 'chamfer', 'Chamfer — bevel the sharp edges', () => addChamfer()),
        op('shell', 'Shell', 'shell', 'Shell — hollow the solid to a wall thickness', () => addShell()),
      ], {
        icon: <FreeCadIcon name="fillet" />,
        title: 'Reshapes what is there — fillet, chamfer, shell',
        onSelect: () => addFillet(),
      }),

      // And these repeat it.
      submenu('transform', 'Transform', [
        op('mirror', 'Mirror', 'mirror', 'Mirror the accumulated solid', () => addMirror()),
        op('linear', 'Linear pattern', 'linear_pattern', 'Linear pattern — repeat along a line', () => addLinearPattern()),
        op('polar', 'Polar pattern', 'polar_pattern', 'Polar pattern — repeat about an axis', () => addPolarPattern()),
      ], {
        icon: <FreeCadIcon name="mirror" />,
        title: 'Repeats what is there — mirror, linear pattern, polar pattern',
        onSelect: () => addMirror(),
      }),
    ];
  }, [
    addChamfer, addExtrude, addFillet, addGroove, addHelix, addHole, addLinearPattern, addLoft,
    addLoftCut, addMirror, addPocket, addPolarPattern, addRevolve, addShell, addSweep, addSweepCut,
    faceInfo, getSketchId, handleAddSketch, handleDatumCsOnFace, handleDatumLineOnFace,
    handleDatumPlaneOnFace, handleDatumPointOnFace, handleSketchOnFace, toolbarStart,
  ]);

  /**
   * The second row: what one works **with** rather than what one builds.
   *
   * Datums, the selection mode, what is under the cursor in that mode, and
   * clearing the tree. They were in the row above, at its right-hand end, where
   * a narrow window pushed them out of sight behind the operations — and the
   * selection mode in particular is switched between operations, not after
   * them. Its own row also gives the mode toggles somewhere to show what is
   * selected without competing with sixteen operations for the width.
   */
  const contextNodes: ToolbarNode[] = useMemo(() => {
    const modes: { value: SubSelectMode; label: string; icon: ReactNode; title: string }[] = [
      { value: 'object', label: 'Object', icon: <NearMeIcon sx={{ fontSize: 16 }} />, title: 'Object mode (default)' },
      { value: 'vertex', label: 'Vertex', icon: <ScatterPlotIcon sx={{ fontSize: 16 }} />, title: 'Vertex selection' },
      { value: 'edge', label: 'Edge', icon: <TimelineIcon sx={{ fontSize: 16 }} />, title: 'Edge selection' },
      { value: 'face', label: 'Face', icon: <CropSquareIcon sx={{ fontSize: 16 }} />, title: 'Face selection' },
    ];

    return [
      submenu('datums', 'Datums', [
        item('datumPoint', 'Point', { onSelect: () => addDatumPoint() }),
        item('datumLine', 'Line', { onSelect: () => addDatumLine() }),
        item('datumPlane', 'Plane', { onSelect: () => addDatumPlane() }),
        item('datumCs', 'Coordinate system', { onSelect: () => addDatumCs() }),
      ], { icon: <GpsFixedIcon fontSize="small" />, title: 'Datums: point, line, plane, coordinate system' }),

      separator('s3'),
      ...modes.map((m) => toggle(`mode:${m.value}`, m.label, subSelectMode === m.value, {
        group: 'select', icon: m.icon, title: m.title,
        // Turning the current mode off would leave none; clicking it again stays
        // where it is.
        onChange: () => { setSubSelectMode(m.value); setSubHit(null); },
      })),
      ...(subSelectMode !== 'object' ? [custom('subHit', <SubHitLabel hit={subHit} />)] : []),

      separator('s4'),
      item('clear', 'Clear', {
        icon: <DeleteSweepIcon fontSize="small" />,
        title: 'Remove every feature',
        onSelect: clearTree,
      }),
      custom('count', (
        <Typography variant="caption" color="text.disabled" sx={{ px: 1, whiteSpace: 'nowrap' }}>
          {tree.features.length} feature{tree.features.length !== 1 ? 's' : ''}
        </Typography>
      )),
    ];
  }, [
    addDatumCs, addDatumLine, addDatumPlane, addDatumPoint, clearTree, subHit, subSelectMode,
    tree.features.length,
  ]);

  // A light theme, local to the 3D page — light toolbars and panels, a light
  // background. The application's own theme stays dark (see the notes page);
  // only this component is wrapped.
  const globalTheme = useTheme();
  const lightTheme = createTheme({
    ...globalTheme,
    palette: {
      ...globalTheme.palette,
      mode: 'light',
      primary: globalTheme.palette.primary,
      background: { default: '#fafafa', paper: '#ffffff' },
      text: { primary: '#212121', secondary: '#616161' },
      divider: 'rgba(0,0,0,0.12)',
    },
  });

  return (
    <ThemeProvider theme={lightTheme}>
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: 'background.default', color: 'text.primary' }}>
      <CoreToolbar
        nodes={toolbarNodes}
        display="both"
        aria-label="modelling"
        renderCustom={(node) => node.render as ReactNode}
        sx={{ px: 1.5, py: 0.75, flexShrink: 0, borderBottom: 'none' }}
      />
      <CoreToolbar
        nodes={contextNodes}
        display="both"
        aria-label="datums and selection"
        renderCustom={(node) => node.render as ReactNode}
        sx={{ px: 1.5, py: 0.5, flexShrink: 0 }}
      />

      {/* Main area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left column */}
        <Box sx={{ width: 220, height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          {/* Feature tree — shrinks at 50% so scene tree always has room */}
          <Box sx={{ flex: '0 0 auto', maxHeight: '50%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <FeatureTreePanel
              features={tree.features}
              selectedId={selectedId}
              editingSketchId={editingSketchId}
              onSelect={selectFeature}
              onToggle={toggleFeature}
              onRemove={removeFeature}
              onMove={moveFeature}
              onEditSketch={startEditSketch}
            />
          </Box>
          <Divider sx={{ flexShrink: 0 }} />
          {/* Scene tree — takes all remaining space */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SceneTreePanel
              sceneRoot={sceneRoot}
              features={tree.features}
              selectedId={selectedId}
              onSelect={selectFeature}
            />
          </Box>
        </Box>

        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Cad3dViewport
            tree={tree}
            project={project}
            version={version}
            subSelectMode={subSelectMode}
            style={{ position: 'absolute', inset: 0 }}
            onSceneChange={handleSceneChange}
            onSubSelect={handleSubSelect}
            selectedId={selectedId}
          />
          {/* Placement overlay — click anywhere in viewport to stamp template */}
          {placementStamp && (
            <Box
              sx={{ position: 'absolute', inset: 0, cursor: 'copy', zIndex: 10 }}
              onClick={handleViewportPlacementClick}
            />
          )}
          {/* Sub-selection mode indicator overlay */}
          {subSelectMode !== 'object' && (
            <Box sx={{
              position: 'absolute', bottom: 8, left: 8,
              bgcolor: 'rgba(0,0,0,0.6)', borderRadius: 1, px: 1, py: 0.5,
              pointerEvents: 'none',
            }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                {subSelectMode === 'vertex' && 'Vertex mode — hover to preview, click to select'}
                {subSelectMode === 'edge' && 'Edge mode — hover to preview, click to select'}
                {subSelectMode === 'face' && 'Face mode — hover to preview, click to select'}
              </Typography>
            </Box>
          )}
        </Box>

        <FeaturePropsPanel
          feature={selectedFeature}
          features={tree.features}
          onUpdate={updateFeature}
          onEditSketch={startEditSketch}
          onCreateDatumPlane={addDatumPlane}
          faceDatumParams={datumParams ? {
            position: datumParams.position,
            normal: datumParams.normal,
            size: datumParams.size,
          } : null}
          edgeParams={edgeInfo}
        />
      </Box>

      <Snackbar
        open={!!evalError}
        autoHideDuration={6000}
        onClose={() => setEvalError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="warning" onClose={() => setEvalError(null)} sx={{ maxWidth: 480 }}>
          <strong>{evalError?.feature}</strong> — {evalError?.reason}
        </Alert>
      </Snackbar>
    </Box>
    </ThemeProvider>
  );
}
