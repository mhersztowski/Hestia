import * as THREE from 'three';

export type SubSelectMode = 'object' | 'vertex' | 'edge' | 'face';

// ── Hit result types ──────────────────────────────────────────────────────────

export interface HitFace {
  type: 'face';
  mesh: THREE.Mesh;
  faceIndices: number[]; // coplanar face group (local geometry indices)
  normal: THREE.Vector3; // world-space normal
}

export interface HitEdge {
  type: 'edge';
  a: THREE.Vector3; // world space
  b: THREE.Vector3;
}

export interface HitVertex {
  type: 'vertex';
  position: THREE.Vector3; // world space
}

export type SubHit = HitFace | HitEdge | HitVertex;

// ── Helpers ───────────────────────────────────────────────────────────────────

export function toNDC(clientX: number, clientY: number, el: HTMLElement): THREE.Vector2 {
  const rect = el.getBoundingClientRect();
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
}

/** All renderable meshes in the scene (skip overlays whose renderOrder > 0) */
function getMeshes(scene: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  scene.traverse(obj => { if (obj instanceof THREE.Mesh && obj.renderOrder === 0) out.push(obj); });
  return out;
}

/** All LineSegments (edge helpers) that are not overlays */
function getEdgeLines(scene: THREE.Object3D): THREE.LineSegments[] {
  const out: THREE.LineSegments[] = [];
  scene.traverse(obj => { if (obj instanceof THREE.LineSegments && obj.renderOrder === 0) out.push(obj); });
  return out;
}

/**
 * Finds every triangle index lying on THE SAME plane as the one clicked. Two
 * (refPoint, refNormal). Sprawdza:
 *  1. the normal's direction (dot > 0.99) — the same orientation, and
 *  2. its distance from the plane (~0) — the SAME plane, not one parallel to
 *     it. Without that check, clicking the top face of a cube also caught the
 *     bottom one (both have a +Z normal, but they are at Z=0 and Z=H), the
 *     centroid averaged vertices from both, and the sketch plane ended up
 *     inside the solid rather than on the face that was clicked.
 */
function coplanarFaceIndices(
  geo: THREE.BufferGeometry,
  refNormal: THREE.Vector3,
  refPoint: THREE.Vector3,
  planeTol = 0.5,
): number[] {
  const pos = geo.attributes['position'] as THREE.BufferAttribute;
  const idx = geo.index;
  const faceCount = idx ? idx.count / 3 : pos.count / 3;
  const out: number[] = [];
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  for (let i = 0; i < faceCount; i++) {
    let a: number, b: number, c: number;
    if (idx) { a = idx.getX(i * 3); b = idx.getX(i * 3 + 1); c = idx.getX(i * 3 + 2); }
    else { a = i * 3; b = i * 3 + 1; c = i * 3 + 2; }

    va.set(pos.getX(a), pos.getY(a), pos.getZ(a));
    vb.set(pos.getX(b), pos.getY(b), pos.getZ(b));
    vc.set(pos.getX(c), pos.getY(c), pos.getZ(c));
    n.crossVectors(vb.clone().sub(va), vc.clone().sub(va)).normalize();
    if (n.dot(refNormal) <= 0.99) continue;

    // Distance test — does the triangle's centroid lie on the plane (refPoint, refNormal)?
    const cx = (va.x + vb.x + vc.x) / 3;
    const cy = (va.y + vb.y + vc.y) / 3;
    const cz = (va.z + vb.z + vc.z) / 3;
    tmp.set(cx - refPoint.x, cy - refPoint.y, cz - refPoint.z);
    if (Math.abs(tmp.dot(refNormal)) > planeTol) continue;

    out.push(i);
  }
  return out;
}

// ── Pickers ───────────────────────────────────────────────────────────────────

export function pickFace(ndc: THREE.Vector2, camera: THREE.Camera, scene: THREE.Object3D): HitFace | null {
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, camera);
  const hits = rc.intersectObjects(getMeshes(scene), false);
  if (!hits.length) return null;

  const hit = hits[0];
  const mesh = hit.object as THREE.Mesh;
  const face = hit.face!;
  const pos = mesh.geometry.attributes['position'] as THREE.BufferAttribute;

  // Geometric face normal (not interpolated vertex normal)
  const va = new THREE.Vector3(pos.getX(face.a), pos.getY(face.a), pos.getZ(face.a));
  const vb = new THREE.Vector3(pos.getX(face.b), pos.getY(face.b), pos.getZ(face.b));
  const vc = new THREE.Vector3(pos.getX(face.c), pos.getY(face.c), pos.getZ(face.c));
  const localNormal = new THREE.Vector3()
    .crossVectors(vb.clone().sub(va), vc.clone().sub(va))
    .normalize();

  // A reference point on the clicked plane — one of the triangle's vertices.
  // Without it `coplanarFaceIndices` also catches a parallel face pointing the
  // same way (a solid's bottom face has the same normal as its top), the
  // centroid averages vertices from both, and the sketch plane lands inside the solid.
  const faceIndices = coplanarFaceIndices(mesh.geometry, localNormal, va);

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const worldNormal = localNormal.clone().applyMatrix3(normalMatrix).normalize();

  return { type: 'face', mesh, faceIndices, normal: worldNormal };
}

export function pickEdge(
  ndc: THREE.Vector2,
  camera: THREE.Camera,
  scene: THREE.Object3D,
  controls: { target: THREE.Vector3 },
): HitEdge | null {
  const rc = new THREE.Raycaster();
  // Scale threshold with camera distance so picking feels consistent at any zoom level
  const camDist = (camera as THREE.PerspectiveCamera).position.distanceTo(controls.target);
  (rc.params as unknown as Record<string, unknown>)['Line'] = { threshold: Math.max(1, camDist * 0.006) };
  rc.setFromCamera(ndc, camera);

  const lines = getEdgeLines(scene);
  const hits = rc.intersectObjects(lines, false);
  if (!hits.length) return null;

  const hit = hits[0];
  const seg = hit.object as THREE.LineSegments;
  const segPos = seg.geometry.attributes['position'] as THREE.BufferAttribute;
  const mw = seg.matrixWorld;

  // Three.js sets `index` = position index of the first vertex of the hit segment
  const i = (hit as THREE.Intersection & { index?: number }).index ?? 0;
  if (i + 1 >= segPos.count) return null;

  const a = new THREE.Vector3(segPos.getX(i), segPos.getY(i), segPos.getZ(i)).applyMatrix4(mw);
  const b = new THREE.Vector3(segPos.getX(i + 1), segPos.getY(i + 1), segPos.getZ(i + 1)).applyMatrix4(mw);
  return { type: 'edge', a, b };
}

export function pickVertex(
  ndc: THREE.Vector2,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Object3D,
  pixelThreshold = 14,
): HitVertex | null {
  const size = renderer.getSize(new THREE.Vector2());
  const mx = (ndc.x + 1) / 2 * size.x;
  const my = (1 - ndc.y) / 2 * size.y;

  let minDist = pixelThreshold;
  let nearest: THREE.Vector3 | null = null;
  const proj = new THREE.Vector3();

  for (const mesh of getMeshes(scene)) {
    const pos = mesh.geometry.attributes['position'] as THREE.BufferAttribute;
    const mw = mesh.matrixWorld;
    const seen = new Set<string>();

    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mw);
      const key = `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      proj.copy(v).project(camera);
      if (proj.z > 1) continue; // behind camera

      const sx = (proj.x + 1) / 2 * size.x;
      const sy = (1 - proj.y) / 2 * size.y;
      const dist = Math.hypot(sx - mx, sy - my);
      if (dist < minDist) { minDist = dist; nearest = v.clone(); }
    }
  }
  return nearest ? { type: 'vertex', position: nearest } : null;
}

// ── Overlay builders ──────────────────────────────────────────────────────────

export const HOVER_COLOR = new THREE.Color('#ffcc00');
export const SELECT_COLOR = new THREE.Color('#ff6600');

export function buildFaceOverlay(hit: HitFace, color: THREE.Color): THREE.Mesh {
  const srcPos = hit.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
  const srcIdx = hit.mesh.geometry.index;
  const mw = hit.mesh.matrixWorld;
  const positions: number[] = [];

  for (const fi of hit.faceIndices) {
    let a: number, b: number, c: number;
    if (srcIdx) { a = srcIdx.getX(fi * 3); b = srcIdx.getX(fi * 3 + 1); c = srcIdx.getX(fi * 3 + 2); }
    else { a = fi * 3; b = fi * 3 + 1; c = fi * 3 + 2; }

    const va = new THREE.Vector3(srcPos.getX(a), srcPos.getY(a), srcPos.getZ(a)).applyMatrix4(mw);
    const vb = new THREE.Vector3(srcPos.getX(b), srcPos.getY(b), srcPos.getZ(b)).applyMatrix4(mw);
    const vc = new THREE.Vector3(srcPos.getX(c), srcPos.getY(c), srcPos.getZ(c)).applyMatrix4(mw);
    positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.45,
    side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  }));
  mesh.renderOrder = 999;
  return mesh;
}

export function buildEdgeOverlay(hit: HitEdge, color: THREE.Color): THREE.Object3D {
  // WebGL ignores LineBasicMaterial.linewidth (a line is always 1 px), so a
  // highlight that can be seen is drawn as a CYLINDER along the edge with
  // spheres at its ends — visible through the solid (depthTest: false).
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color,
    depthTest: false, depthWrite: false,
    transparent: true, opacity: 0.9,
  });

  const dir = hit.b.clone().sub(hit.a);
  const length = dir.length();
  const mid = hit.a.clone().add(hit.b).multiplyScalar(0.5);

  if (length > 0.001) {
    // A cylinder as long as the edge, its radius in proportion (at least 1.5)
    const radius = Math.max(1.5, length * 0.02);
    const cylGeo = new THREE.CylinderGeometry(radius, radius, length, 12, 1, false);
    const cyl = new THREE.Mesh(cylGeo, mat);
    // CylinderGeometry runs along Y — rotate it to run from a to b
    cyl.position.copy(mid);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const dirNorm = dir.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dirNorm);
    cyl.quaternion.copy(quat);
    cyl.renderOrder = 999;
    group.add(cyl);
  }

  // Spheres at the ends of the edge, so its start and finish read clearly
  const sphereRadius = Math.max(2, length * 0.03);
  const sphereGeo = new THREE.SphereGeometry(sphereRadius, 12, 8);
  const sphereA = new THREE.Mesh(sphereGeo, mat);
  sphereA.position.copy(hit.a);
  sphereA.renderOrder = 999;
  group.add(sphereA);
  const sphereB = new THREE.Mesh(sphereGeo, mat);
  sphereB.position.copy(hit.b);
  sphereB.renderOrder = 999;
  group.add(sphereB);

  return group;
}

export function buildVertexOverlay(hit: HitVertex, color: THREE.Color): THREE.Points {
  const geo = new THREE.BufferGeometry().setFromPoints([hit.position]);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color, size: 10, sizeAttenuation: false, depthTest: false,
  }));
  pts.renderOrder = 999;
  return pts;
}

// ── Face → sketch plane ───────────────────────────────────────────────────────

/**
 * Derive a full sketch plane from a selected face.
 * Returns plane='face' with a 16-element column-major Matrix4 that positions
 * the sketch exactly on the face with an orthonormal coordinate system:
 *   - sketch Z = face normal (extrusion direction = outward)
 *   - sketch X/Y = two orthogonal tangent vectors on the face
 *   - sketch origin = face centroid
 */
export function planeFromFace(hit: HitFace): {
  plane: 'face';
  offset: number;
  planeMatrix: number[];
  faceRef: { hintNormal: [number, number, number]; hintPoint: [number, number, number] };
} {
  // ── Centroid of all coplanar faces ──────────────────────────────────────────
  const pos = hit.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
  const idx = hit.mesh.geometry.index;
  const mw = hit.mesh.matrixWorld;

  const centroid = new THREE.Vector3();
  let count = 0;

  for (const fi of hit.faceIndices) {
    let a: number, b: number, c: number;
    if (idx) { a = idx.getX(fi * 3); b = idx.getX(fi * 3 + 1); c = idx.getX(fi * 3 + 2); }
    else      { a = fi * 3;           b = fi * 3 + 1;             c = fi * 3 + 2; }

    centroid.add(new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a)).applyMatrix4(mw));
    centroid.add(new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b)).applyMatrix4(mw));
    centroid.add(new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c)).applyMatrix4(mw));
    count += 3;
  }
  if (count > 0) centroid.divideScalar(count);

  // ── Orthonormal basis from face normal ──────────────────────────────────────
  const n = hit.normal.clone().normalize(); // sketch Z axis

  // Choose a "world up" helper not parallel to n
  const helper = Math.abs(n.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);

  // sketch X = component of helper perpendicular to n, normalised
  const u = helper.clone().sub(n.clone().multiplyScalar(n.dot(helper))).normalize();
  // sketch Y = n × u  (right-hand: u × v = n)
  const v = new THREE.Vector3().crossVectors(n, u).normalize();

  // Column-major Matrix4: columns are [u, v, n, centroid]
  const mat = new THREE.Matrix4().makeBasis(u, v, n);
  mat.setPosition(centroid);

  console.log('[planeFromFace] centroid:', centroid.toArray(), 'normal:', n.toArray(),
    'meshName:', hit.mesh.name || '(unnamed)',
    'meshType:', (hit.mesh.material as THREE.Material).type,
    'faceIndicesCount:', hit.faceIndices.length,
    'meshWorldPos:', hit.mesh.matrixWorld.elements.slice(12, 15));
  return {
    plane: 'face',
    offset: 0,
    planeMatrix: mat.toArray(),
    faceRef: {
      hintNormal: [n.x, n.y, n.z],
      hintPoint: [centroid.x, centroid.y, centroid.z],
    },
  };
}

/**
 * Wylicza parametry dla datum (odniesienia geometrycznego) na podstawie
 * a selected face of the solid. It returns:
 *  - `position` — the face's centroid, which is where the datum sits,
 *  - `normal` — outward normal face (kierunek plane / linii)
 *  - `rotationEulerXYZ` — the rotation in degrees for a datum_cs (the U/V/N basis on the face)
 *  - `size` — bok kwadratu wizualizacji plane (dopasowany do rozmiaru face)
 */
export function datumParamsFromFace(hit: HitFace): {
  position: [number, number, number];
  normal: [number, number, number];
  rotationEulerXYZ: [number, number, number];
  size: number;
} {
  // Reuse planeFromFace for the centroid and the basis (u, v, n) — then
  // planeMatrix daje nam obie rzeczy (position z ostatniej kolumny + basis z 3 pierwszych).
  const info = planeFromFace(hit);
  const m = new THREE.Matrix4().fromArray(info.planeMatrix);
  const position: [number, number, number] = [
    info.planeMatrix[12],
    info.planeMatrix[13],
    info.planeMatrix[14],
  ];
  const normal: [number, number, number] = [...info.faceRef.hintNormal];

  // Rotation Euler z basis matrix — konwersja rotation part → Euler XYZ (stopnie)
  const euler = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
  const rotationEulerXYZ: [number, number, number] = [
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z),
  ];

  // Size dla plane — bbox wszystkich coplanar triangles, longest side * 1.2
  const pos = hit.mesh.geometry.attributes['position'] as THREE.BufferAttribute;
  const idx = hit.mesh.geometry.index;
  const mw = hit.mesh.matrixWorld;
  const bbox = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const fi of hit.faceIndices) {
    let a: number, b: number, c: number;
    if (idx) { a = idx.getX(fi * 3); b = idx.getX(fi * 3 + 1); c = idx.getX(fi * 3 + 2); }
    else      { a = fi * 3;           b = fi * 3 + 1;             c = fi * 3 + 2; }
    for (const vi of [a, b, c]) {
      v.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(mw);
      bbox.expandByPoint(v);
    }
  }
  const dim = new THREE.Vector3();
  bbox.getSize(dim);
  const size = Math.max(50, Math.max(dim.x, dim.y, dim.z) * 1.2);

  return { position, normal, rotationEulerXYZ, size };
}

export function buildOverlay(hit: SubHit, color: THREE.Color = SELECT_COLOR): THREE.Object3D {
  switch (hit.type) {
    case 'face':   return buildFaceOverlay(hit, color);
    case 'edge':   return buildEdgeOverlay(hit, color);
    case 'vertex': return buildVertexOverlay(hit, color);
  }
}
