import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';

// ── Axes gizmo ────────────────────────────────────────────────────────────────

const GIZMO_AXES = [
  { dir: [1, 0, 0] as [number,number,number], color: '#e05555', label: 'X' },
  { dir: [0, 1, 0] as [number,number,number], color: '#55cc55', label: 'Y' },
  { dir: [0, 0, 1] as [number,number,number], color: '#4488ff', label: 'Z' },
];

function drawAxesGizmo(canvas: HTMLCanvasElement | null, camera: THREE.Camera): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const S = canvas.width;
  const cx = S / 2, cy = S / 2;
  const len = S * 0.33;

  ctx.clearRect(0, 0, S, S);

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, S / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(18,24,32,0.72)';
  ctx.fill();

  const rotMat = new THREE.Matrix4().extractRotation(camera.matrixWorldInverse);

  const projected = GIZMO_AXES.map(({ dir, color, label }) => {
    const v = new THREE.Vector3(...dir).applyMatrix4(rotMat);
    return { sx: v.x * len, sy: -v.y * len, sz: v.z, color, label };
  });
  // Draw back-to-front (highest sz = furthest from camera)
  projected.sort((a, b) => b.sz - a.sz);

  for (const { sx, sy, color, label } of projected) {
    // Negative half (dim stub)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - sx * 0.45, cy - sy * 0.45);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Positive axis line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + sx, cy + sy);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Tip dot
    ctx.beginPath();
    ctx.arc(cx + sx, cy + sy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Label slightly past the tip
    ctx.fillStyle = color;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + sx * 1.38, cy + sy * 1.38);
  }

  // Origin dot
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
}
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FeatureTree } from '../model/types';
import { DATUM_TYPES } from '../model/types';
import { evaluateFeatureTreeAsync } from '../model/evaluate';
import type { Project } from '../../cad2d/barrel';
import {
  type SubSelectMode, type SubHit,
  toNDC, pickFace, pickEdge, pickVertex,
  buildOverlay, HOVER_COLOR, SELECT_COLOR,
} from '../model/subSelect';

interface Props {
  tree: FeatureTree;
  project: Project;
  version: number;
  subSelectMode: SubSelectMode;
  style?: React.CSSProperties;
  onSceneChange?: (root: THREE.Object3D) => void;
  onSubSelect?: (hit: SubHit | null) => void;
  /** The selected feature's id — an extrude or a pocket gets a wireframe preview. */
  selectedId?: string | null;
}

interface ViewportState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  raf: number;
  cadRoot: THREE.Object3D | null;
  hoverGroup: THREE.Group;
  selectGroup: THREE.Group;
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, root: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = camera.fov * (Math.PI / 180);
  const dist = (maxDim / (2 * Math.tan(fov / 2))) * 2.2;
  const dir = new THREE.Vector3(1, 0.8, 1).normalize();
  camera.position.copy(center.clone().addScaledVector(dir, dist));
  controls.target.copy(center);
  controls.update();
  camera.near = dist * 0.001;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
}

function OccSpinner() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" style={{ animation: 'occ-spin 0.9s linear infinite' }}>
      <style>{`@keyframes occ-spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx={7} cy={7} r={5} fill="none" stroke="#4fc3f7" strokeWidth={2} strokeDasharray="20 10" />
    </svg>
  );
}

export function Cad3dViewport({ tree, project, version, subSelectMode, style, onSceneChange, onSubSelect, selectedId }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gizmoCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevTreeRef = useRef<FeatureTree>(tree);
  const prevFeatureIdsRef = useRef<string>(tree.features.map(f => f.id).join(','));
  const stateRef = useRef<ViewportState | null>(null);
  const [occLoading, setOccLoading] = useState(false);
  // Abort token for in-flight evaluations — avoids stale updates
  const evalAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // Track sub-select mode in a ref so event handlers always see the latest value
  const subModeRef = useRef(subSelectMode);
  subModeRef.current = subSelectMode;

  // Track mouse press position for drag vs click detection
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  // Init Three.js once
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(el.clientWidth, el.clientHeight);
    // A light background, as FreeCAD and SolidWorks have by default
    renderer.setClearColor(0xf5f5f5);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Lighting that suits a CAD model:
    //  - AmbientLight (0.6) — a floor of light from every direction,
    //  - a DirectionalLight attached to the camera (0.5) — a headlight.
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const headlight = new THREE.DirectionalLight(0xffffff, 0.5);
    scene.add(headlight);

    // The grid and the axes helper were removed on request: a plain light
    // background. Navigation is by OrbitControls and the gizmo in the corner.

    const hoverGroup = new THREE.Group();
    hoverGroup.name = 'hover-overlay';
    scene.add(hoverGroup);

    const selectGroup = new THREE.Group();
    selectGroup.name = 'select-overlay';
    scene.add(selectGroup);

    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 50000);
    camera.position.set(200, 200, 400);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    let raf = 0;
    function animate() {
      raf = requestAnimationFrame(animate);
      controls.update();
      // The headlight follows the camera, so it always shines from the viewer
      // od orientacji sceny. Uniwersalne dla dowolnej geometrii.
      headlight.position.copy(camera.position);
      renderer.render(scene, camera);
      drawAxesGizmo(gizmoCanvasRef.current, camera);
    }
    animate();

    const ro = new ResizeObserver(() => {
      if (!el) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    stateRef.current = { renderer, scene, camera, controls, raf, cadRoot: null, hoverGroup, selectGroup };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, []);

  // Re-evaluate feature tree (async — uses OpenCascade.js WASM)
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;

    // Fit the camera ONLY when the tree's composition changes (a feature added
    // or removed). Changing an existing feature's parameters must not refit —
    // symmetric and reversed would otherwise be hidden by the reframing.
    const currentFeatureIds = tree.features.map(f => f.id).join(',');
    const treeChanged = prevFeatureIdsRef.current !== currentFeatureIds;
    prevTreeRef.current = tree;
    prevFeatureIdsRef.current = currentFeatureIds;

    // Cancel any previous in-flight evaluation
    evalAbortRef.current.cancelled = true;
    const token = { cancelled: false };
    evalAbortRef.current = token;

    if (s.cadRoot) { s.scene.remove(s.cadRoot); s.cadRoot = null; }
    s.hoverGroup.clear();
    s.selectGroup.clear();

    const hasSolids = tree.features.some(f => f.enabled && f.type !== 'sketch' && !DATUM_TYPES.has(f.type));

    setOccLoading(hasSolids);

    void evaluateFeatureTreeAsync(tree, project, selectedId).then(root => {
      if (token.cancelled) return; // superseded by newer evaluation
      setOccLoading(false);
      const s2 = stateRef.current;
      if (!s2) return;
      if (s2.cadRoot) s2.scene.remove(s2.cadRoot);
      s2.scene.add(root);
      s2.cadRoot = root;
      if (treeChanged) fitCamera(s2.camera, s2.controls, root);
      onSceneChange?.(root);
    }).catch(err => {
      if (token.cancelled) return;
      setOccLoading(false);
      console.error('OCC evaluation error:', err);
    });
  }, [tree, project, version, onSceneChange, selectedId]);

  // ── Sub-selection event handlers ──────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (subModeRef.current === 'object') return;
    pressRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const mode = subModeRef.current;
    if (mode === 'object') return;
    const s = stateRef.current;
    if (!s || !mountRef.current) return;

    const ndc = toNDC(e.clientX, e.clientY, mountRef.current);
    let hit: SubHit | null = null;

    if (mode === 'face')   hit = pickFace(ndc, s.camera, s.scene);
    if (mode === 'edge')   hit = pickEdge(ndc, s.camera, s.scene, s.controls);
    if (mode === 'vertex') hit = pickVertex(ndc, s.camera, s.renderer, s.scene);

    s.hoverGroup.clear();
    if (hit) s.hoverGroup.add(buildOverlay(hit, HOVER_COLOR));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const mode = subModeRef.current;
    if (mode === 'object') return;

    const press = pressRef.current;
    pressRef.current = null;
    if (!press) return;

    // Ignore drag (> 5 px movement)
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) return;

    const s = stateRef.current;
    if (!s || !mountRef.current) return;

    const ndc = toNDC(e.clientX, e.clientY, mountRef.current);
    let hit: SubHit | null = null;

    if (mode === 'face')   hit = pickFace(ndc, s.camera, s.scene);
    if (mode === 'edge')   hit = pickEdge(ndc, s.camera, s.scene, s.controls);
    if (mode === 'vertex') hit = pickVertex(ndc, s.camera, s.renderer, s.scene);

    s.selectGroup.clear();
    if (hit) s.selectGroup.add(buildOverlay(hit, SELECT_COLOR));
    onSubSelect?.(hit);
  }, [onSubSelect]);

  // Clear hover/select overlays when switching back to object mode
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.hoverGroup.clear();
    s.selectGroup.clear();
    onSubSelect?.(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subSelectMode]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a1a', ...style }}>
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ width: '100%', height: '100%' }}
      />
      <canvas
        ref={gizmoCanvasRef}
        width={90}
        height={90}
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          pointerEvents: 'none',
          borderRadius: '50%',
        }}
      />
      {occLoading && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 6,
          padding: '4px 10px',
          pointerEvents: 'none',
        }}>
          <OccSpinner />
          <span style={{ color: '#aaa', fontSize: 11, fontFamily: 'monospace' }}>Computing…</span>
        </div>
      )}
    </div>
  );
}
