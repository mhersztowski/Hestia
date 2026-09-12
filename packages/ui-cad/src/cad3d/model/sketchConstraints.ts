/**
 * 2D geometric constraint solver dla SketchEditor.
 *
 * Newton-Raphson over a vector of parameters [x0, y0, x1, y1, …]. Every
 * constraint contributes an equation f(params) = 0, and the solver iterates
 * until all of them are satisfied.
 *
 * Wspiera podstawowe FreeCAD-style constraints:
 * - coincident (two points in the same place)
 * - Horizontal (linia y1 == y2)
 * - Vertical (linia x1 == x2)
 * - parallel (two lines — their cross product is 0)
 * - perpendicular (two lines — their dot product is 0)
 * - equal length (two lines of the same length)
 * - distance (between two points, or the length of a line)
 * - Fixed (punkt zablokowany na aktualnej pozycji)
 *
 * Note: this is not an optimal solver of PlaneGCS's kind. It is enough for the
 * sketches of the size CAD work produces (some 10 to 50 constraints).
 */

export type ConstraintType =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'equal'
  | 'symmetric'             // two points mirrored about an axis or a line
  // Dimensions — constraints with a value
  | 'distance'              // the distance between two points == value
  | 'horizontal_distance'   // |xa - xb| == value
  | 'vertical_distance'     // |ya - yb| == value
  | 'radius'                // circle.radius == value
  | 'diameter'              // circle.radius * 2 == value
  | 'angle'                 // the angle between two lines == value (deg)
  | 'fixed';                // punkt zablokowany na pozycji

export interface SketchConstraint {
  id: string;
  type: ConstraintType;
  /** What it refers to — entities or points. The format depends on the type.
 *  For coincident: two point refs (`entityId.point`, e.g. `line1.p1`, `circle2.center`)
   *  Dla horizontal/vertical: 1 line ref (`entityId`)
   *  Dla parallel/perpendicular/equal: 2 line refs
   *  Dla distance/angle: 2 refs + `value`
   *  Dla fixed: 1 point ref */
  refs: string[];
  /** The value, for distance and angle. */
  value?: number;
  /** Whether it is shown (the visibility toggle in the Constraints panel). */
  visible?: boolean;
  name?: string;
}

/**
 * Sketch entity (uproszczony — mirrors core-cad EntityRegistry shape).
 * Solver operuje TYLKO na tych 4 typach.
 */
export type SketchEntity =
  | { type: 'line'; id: string; x1: number; y1: number; x2: number; y2: number }
  | { type: 'circle'; id: string; cx: number; cy: number; radius: number }
  | { type: 'rect'; id: string; x: number; y: number; width: number; height: number }
  | { type: 'point'; id: string; x: number; y: number };

/**
 * Parsuje ref w formacie `entityId.point` na `{ entityId, part }`.
 * `part` may be 'p1' or 'p2' (a line), 'center' (a circle), 'p1'…'p4' (a rect),
 * 'position' (a point), or undefined for the whole entity — parallel, equal.
 */
function parseRef(ref: string): { entityId: string; part?: string } {
  const dotIdx = ref.indexOf('.');
  if (dotIdx < 0) return { entityId: ref };
  return { entityId: ref.slice(0, dotIdx), part: ref.slice(dotIdx + 1) };
}

/**
 * Zwraca [x, y] punktu z entity wg `part`.
 * Throws when the entity or the part does not exist.
 */
function getPoint(entities: SketchEntity[], ref: string): { x: number; y: number; entityIdx: number; xKey: string; yKey: string } {
  const { entityId, part } = parseRef(ref);
  const idx = entities.findIndex(e => e.id === entityId);
  if (idx < 0) throw new Error(`Entity ${entityId} not found`);
  const e = entities[idx];

  if (e.type === 'line') {
    if (part === 'p1' || !part) return { x: e.x1, y: e.y1, entityIdx: idx, xKey: 'x1', yKey: 'y1' };
    if (part === 'p2')          return { x: e.x2, y: e.y2, entityIdx: idx, xKey: 'x2', yKey: 'y2' };
  } else if (e.type === 'circle') {
    if (part === 'center' || !part) return { x: e.cx, y: e.cy, entityIdx: idx, xKey: 'cx', yKey: 'cy' };
  } else if (e.type === 'rect') {
    if (part === 'p1')          return { x: e.x, y: e.y, entityIdx: idx, xKey: 'x', yKey: 'y' };
    // A rect has four corners, but the solver works mostly from p1 (its position)
  } else if (e.type === 'point') {
    return { x: e.x, y: e.y, entityIdx: idx, xKey: 'x', yKey: 'y' };
  }
  throw new Error(`Cannot get point from ${e.type} with part '${part}'`);
}

/**
 * The vector [dx, dy] of a line entity.
 */
function getLineVec(entities: SketchEntity[], ref: string): { dx: number; dy: number; p1: { x: number; y: number }; p2: { x: number; y: number } } {
  const { entityId } = parseRef(ref);
  const e = entities.find(x => x.id === entityId);
  if (!e || e.type !== 'line') throw new Error(`${entityId} is not a line`);
  return {
    dx: e.x2 - e.x1, dy: e.y2 - e.y1,
    p1: { x: e.x1, y: e.y1 },
    p2: { x: e.x2, y: e.y2 },
  };
}

/**
 * The residual of a constraint — an array, because some constraints give more
 * than one equation (coincident gives two).
 * dla x i y).
 */
function residuals(constraint: SketchConstraint, entities: SketchEntity[]): number[] {
  try {
    switch (constraint.type) {
      case 'coincident': {
        // Two points in the same place: x1-x2=0, y1-y2=0
        const a = getPoint(entities, constraint.refs[0]);
        const b = getPoint(entities, constraint.refs[1]);
        return [a.x - b.x, a.y - b.y];
      }
      case 'horizontal': {
        // Two points share a Y; one line has y1 == y2.
        if (constraint.refs.length >= 2) {
          const a = getPoint(entities, constraint.refs[0]);
          const b = getPoint(entities, constraint.refs[1]);
          return [a.y - b.y];
        }
        const line = getLineVec(entities, constraint.refs[0]);
        return [line.p1.y - line.p2.y];
      }
      case 'vertical': {
        // Two points share an X; one line has x1 == x2.
        if (constraint.refs.length >= 2) {
          const a = getPoint(entities, constraint.refs[0]);
          const b = getPoint(entities, constraint.refs[1]);
          return [a.x - b.x];
        }
        const line = getLineVec(entities, constraint.refs[0]);
        return [line.p1.x - line.p2.x];
      }
      case 'parallel': {
        // Cross product = 0: dx1*dy2 - dy1*dx2 = 0
        const a = getLineVec(entities, constraint.refs[0]);
        const b = getLineVec(entities, constraint.refs[1]);
        return [a.dx * b.dy - a.dy * b.dx];
      }
      case 'perpendicular': {
        // Dot product = 0: dx1*dx2 + dy1*dy2 = 0
        const a = getLineVec(entities, constraint.refs[0]);
        const b = getLineVec(entities, constraint.refs[1]);
        return [a.dx * b.dx + a.dy * b.dy];
      }
      case 'equal': {
        // Same length: len_a² − len_b² = 0 (squares, to keep sqrt's imprecision out)
        const a = getLineVec(entities, constraint.refs[0]);
        const b = getLineVec(entities, constraint.refs[1]);
        const la2 = a.dx * a.dx + a.dy * a.dy;
        const lb2 = b.dx * b.dx + b.dy * b.dy;
        return [la2 - lb2];
      }
      case 'distance': {
        // The distance between two points == value
        const a = getPoint(entities, constraint.refs[0]);
        const b = getPoint(entities, constraint.refs[1]);
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        return [d - (constraint.value ?? 0)];
      }
      case 'horizontal_distance': {
        // |xa − xb| == value (squared, to avoid the branch abs introduces)
        const a = getPoint(entities, constraint.refs[0]);
        const b = getPoint(entities, constraint.refs[1]);
        const target = constraint.value ?? 0;
        return [(a.x - b.x) * (a.x - b.x) - target * target];
      }
      case 'vertical_distance': {
        const a = getPoint(entities, constraint.refs[0]);
        const b = getPoint(entities, constraint.refs[1]);
        const target = constraint.value ?? 0;
        return [(a.y - b.y) * (a.y - b.y) - target * target];
      }
      case 'radius': {
        // Find the circle among the entities and check its radius
        const { entityId } = parseRef(constraint.refs[0]);
        const e = entities.find(x => x.id === entityId);
        if (!e || e.type !== 'circle') return [];
        return [e.radius - (constraint.value ?? 0)];
      }
      case 'diameter': {
        const { entityId } = parseRef(constraint.refs[0]);
        const e = entities.find(x => x.id === entityId);
        if (!e || e.type !== 'circle') return [];
        return [e.radius * 2 - (constraint.value ?? 0)];
      }
      case 'angle': {
        // The angle between the lines == value (rad)
        const a = getLineVec(entities, constraint.refs[0]);
        const b = getLineVec(entities, constraint.refs[1]);
        const angA = Math.atan2(a.dy, a.dx);
        const angB = Math.atan2(b.dy, b.dx);
        let diff = angB - angA;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return [diff - ((constraint.value ?? 0) * Math.PI / 180)];
      }
      case 'fixed':
      case 'tangent':
        // Fixed is handled through lockedIndices, not in the residuals.
        // Tangent — nieimplementowany w MVP.
        return [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Uruchamia Newton-Raphson solver na constraints.
 *
 * The parameter vector holds, for every entity, its numeric fields
 * (x1, y1, x2, y2 for a line; cx, cy, radius for a circle; and so on).
 *
 * The solver moves them to minimise sum(residuals²).
 *
 * @returns updated entities (nowe kopie z zaktualizowanymi parametrami).
 */
export function solveConstraints(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  fixedRefs: string[] = [],
  maxIter = 30,
  tol = 1e-6,
): { entities: SketchEntity[]; converged: boolean; iterations: number; residual: number } {
  if (constraints.length === 0) {
    return { entities: [...entities], converged: true, iterations: 0, residual: 0 };
  }

  // Build the map: entityId → its parameters (x1, y1, x2, y2, …)
  const paramKeys: Array<{ entityIdx: number; key: string }> = [];
  const workEntities: SketchEntity[] = entities.map(e => ({ ...e } as SketchEntity));
  for (let i = 0; i < workEntities.length; i++) {
    const e = workEntities[i];
    if (e.type === 'line') {
      paramKeys.push({ entityIdx: i, key: 'x1' });
      paramKeys.push({ entityIdx: i, key: 'y1' });
      paramKeys.push({ entityIdx: i, key: 'x2' });
      paramKeys.push({ entityIdx: i, key: 'y2' });
    } else if (e.type === 'circle') {
      paramKeys.push({ entityIdx: i, key: 'cx' });
      paramKeys.push({ entityIdx: i, key: 'cy' });
      paramKeys.push({ entityIdx: i, key: 'radius' });
    } else if (e.type === 'rect') {
      paramKeys.push({ entityIdx: i, key: 'x' });
      paramKeys.push({ entityIdx: i, key: 'y' });
      paramKeys.push({ entityIdx: i, key: 'width' });
      paramKeys.push({ entityIdx: i, key: 'height' });
    } else if (e.type === 'point') {
      paramKeys.push({ entityIdx: i, key: 'x' });
      paramKeys.push({ entityIdx: i, key: 'y' });
    }
  }
  const nParams = paramKeys.length;

  // Collect the indices of the LOCKED parameters — fixed constraints, and the caller's fixedRefs
  const lockedParams = new Set<number>();
  const allFixed = [...fixedRefs];
  for (const c of constraints) {
    if (c.type === 'fixed') allFixed.push(...c.refs);
  }
  for (const ref of allFixed) {
    try {
      const pt = getPoint(workEntities, ref);
      // Find the indices in paramKeys
      for (let i = 0; i < nParams; i++) {
        if (paramKeys[i].entityIdx === pt.entityIdx &&
            (paramKeys[i].key === pt.xKey || paramKeys[i].key === pt.yKey)) {
          lockedParams.add(i);
        }
      }
    } catch { /* skip invalid ref */ }
  }

  // Function do read/write param value
  const getParam = (i: number): number => {
    const { entityIdx, key } = paramKeys[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (workEntities[entityIdx] as any)[key];
  };
  const setParam = (i: number, v: number) => {
    if (lockedParams.has(i)) return;
    const { entityIdx, key } = paramKeys[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (workEntities[entityIdx] as any)[key] = v;
  };

  const eps = 1e-5;

  const evalResiduals = (): number[] => {
    const r: number[] = [];
    for (const c of constraints) {
      r.push(...residuals(c, workEntities));
    }
    return r;
  };

  // Newton-Raphson: each iteration computes the Jacobian J and solves
  // J * dx = -r (przez normal equations J^T J dx = -J^T r).
  let converged = false;
  let iter = 0;
  let finalRes = Infinity;

  for (iter = 0; iter < maxIter; iter++) {
    const r = evalResiduals();
    if (r.length === 0) { converged = true; break; }
    finalRes = Math.sqrt(r.reduce((s, x) => s + x * x, 0));
    if (finalRes < tol) { converged = true; break; }

    const nRes = r.length;
    // Policz Jacobian numerycznie (dR/dparam via finite difference)
    // J to matrix nRes × nParams
    const J: number[][] = Array.from({ length: nRes }, () => new Array(nParams).fill(0));
    for (let p = 0; p < nParams; p++) {
      if (lockedParams.has(p)) continue;
      const origVal = getParam(p);
      setParam(p, origVal + eps);
      const rPlus = evalResiduals();
      setParam(p, origVal);
      for (let i = 0; i < nRes; i++) {
        J[i][p] = (rPlus[i] - r[i]) / eps;
      }
    }

    // Normal equations: A = J^T J, b = -J^T r
    // Solve A · dx = b with damping (Levenberg-Marquardt, lightly):
    // (A + λI) dx = b, with a small λ.
    const A: number[][] = Array.from({ length: nParams }, () => new Array(nParams).fill(0));
    const b: number[] = new Array(nParams).fill(0);
    for (let i = 0; i < nParams; i++) {
      for (let j = 0; j < nParams; j++) {
        let sum = 0;
        for (let k = 0; k < nRes; k++) sum += J[k][i] * J[k][j];
        A[i][j] = sum;
      }
      let bi = 0;
      for (let k = 0; k < nRes; k++) bi -= J[k][i] * r[k];
      b[i] = bi;
    }
    // Damping
    const lambda = 1e-6;
    for (let i = 0; i < nParams; i++) A[i][i] += lambda;
    // Fixed params: force dx=0 (zero row + zero col + 1 na diagonal)
    for (const p of lockedParams) {
      for (let j = 0; j < nParams; j++) { A[p][j] = 0; A[j][p] = 0; }
      A[p][p] = 1;
      b[p] = 0;
    }

    const dx = solveGauss(A, b);
    if (!dx) break;

    // Apply the update with a damped step, so it does not diverge
    for (let p = 0; p < nParams; p++) {
      setParam(p, getParam(p) + dx[p]);
    }
  }

  return { entities: workEntities, converged, iterations: iter, residual: finalRes };
}

/** Gauss elimination with partial pivoting. Returns the solution x, or null when singular. */
function solveGauss(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Copy, rather than mutate what was passed in
  const M: number[][] = A.map(row => [...row, 0]);
  for (let i = 0; i < n; i++) M[i][n] = b[i];

  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    if (Math.abs(M[maxRow][i]) < 1e-12) return null; // singular
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    // Eliminacja
    for (let k = i + 1; k < n; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  // Back-substitute
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }
  return x;
}

/** Pretty-printed constraint name dla UI. */
export function constraintTypeLabel(type: ConstraintType): string {
  const labels: Record<ConstraintType, string> = {
    coincident: 'Coincident',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    parallel: 'Parallel',
    perpendicular: 'Perpendicular',
    tangent: 'Tangent',
    equal: 'Equal',
    distance: 'Distance',
    horizontal_distance: 'Horizontal Distance',
    vertical_distance: 'Vertical Distance',
    radius: 'Radius',
    diameter: 'Diameter',
    angle: 'Angle',
    fixed: 'Fixed',
    symmetric: 'Symmetric',
  };
  return labels[type] ?? type;
}
