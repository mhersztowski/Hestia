/**
 * Pure PCB rendering functions — faithful port of the pure (hook-free) render
 * helpers from cad-app's PcbView.tsx. No React state, no interactivity: every
 * function returns SVG/JSX given plain data. Used by the read-only PcbViewerPage.
 *
 * Ported verbatim from app/cad-app/src/components/PcbView.tsx (editor is the
 * source of truth). Only edits: inlined color literals for `C`, added exports,
 * dropped editor-only helpers.
 */
import type { ReactNode, Key } from 'react';

// ── Kolory (podzbiór edytorowego obiektu C, wstawiony jako literały) ───────────
const C = { schRed: '#9b1c1c', schBlue: '#1414b0', logoTeal: '#13a3b3' };
const RED = C.schRed;

// ── Typy podstawowe ────────────────────────────────────────────────────────────
export type Pt = { x: number; y: number };

export interface CompDef { id: string; name: string; category: string; refPrefix: string; pins: number; draw: (preview?: boolean) => ReactNode }
export interface EasyEdaSym { shapes: string[]; bbox: { x: number; y: number; width: number; height: number } | null }
export interface PlacedComp {
  id: string; defId: string; x: number; y: number; ref: string; label: string; pins: number;
  octopart?: boolean; easyeda?: EasyEdaSym; fp?: EasyEdaSym; savedEls?: El[]; fpEls?: FpEl[];
  pcbX?: number; pcbY?: number; // pozycja footprintu na PCB (niezależna od pozycji symbolu x/y na schemacie)
  // Właściwości komponentu (sheet/PCB) — prezentacja + atrybuty
  layer?: string; rotation?: number; showPrefix?: string; showName?: string; addToBom?: string; locked?: string; convertToPcb?: string; displayFootprint?: string;
  footprint?: string; supplier?: string; supplierPart?: string; manufacturer?: string; mfrPart?: string; jlcpcb?: string; link?: string; model3d?: string;
}

// Pełny model pinu (edytowalny w panelu „Atrybut Pinu")
export interface PinEl {
  t: 'pin'; x: number; y: number;
  name: string; number: string; spice: string;
  showName: boolean; showNumber: boolean;
  length: number; rotation: number;
  pinColor: string; nameColor: string; numberColor: string;
  dot: boolean; clock: boolean; show: boolean;
  electrical: string; fontFamily: string; fontSize: string; locked: boolean; id: string;
}
export interface ShapeStyle { stroke: string; strokeWidth: number; strokeStyle: string; fill: string; locked: boolean; id: string }
export type El =
  | PinEl
  | ({ t: 'line'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'polygon'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'bezier'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'freehand'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'rect'; x: number; y: number; w: number; h: number; roundRadius: number } & ShapeStyle)
  | ({ t: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & ShapeStyle)
  | ({ t: 'arc'; cx: number; cy: number; rx: number; ry: number } & ShapeStyle)
  | ({ t: 'pie'; cx: number; cy: number; rx: number; ry: number } & ShapeStyle)
  | { t: 'arrow'; x: number; y: number; fill: string; arrowType: string; size: number; rotation: number; locked: boolean; id: string }
  | { t: 'text'; x: number; y: number; text: string; color: string; fontFamily: string; fontSize: string; fontWeight: string; fontStyle: string; anchor: string; baseline: string; textType: string; locked: boolean; id: string }
  | { t: 'image'; x: number; y: number; w: number; h: number; url: string; rotation: number; locked: boolean; id: string }
  // ── Elementy sieciowe arkusza (Narzędzia połączeń) ──
  | ({ t: 'wire'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'bus'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'busentry'; x1: number; y1: number; x2: number; y2: number } & ShapeStyle)
  | { t: 'netlabel'; x: number; y: number; name: string; color: string; fontFamily: string; fontSize: string; locked: boolean; id: string }
  | (NetSym & { t: 'netflag'; flagType: 'gnd' | 'vcc' | 'v5' })
  | (NetSym & { t: 'netport' })
  | (NetSym & { t: 'probe' })
  | { t: 'noconnect'; x: number; y: number; stroke: string; locked: boolean; id: string }
  | { t: 'group'; children: El[]; locked: boolean; id: string };
// Wspólne pola symbolu sieciowego z etykietą tekstową (Net Flag / Port sieci / Sonda napięcia).
export interface NetSym { x: number; y: number; name: string; show: boolean; color: string; fontFamily: string; fontSize: string; fontWeight: string; fontStyle: string; anchor: string; textType: string; locked: boolean; id: string }

const SYM_COLOR = '#9b1c1c';

// ── Meta / work state ──────────────────────────────────────────────────────────
export interface SymMeta { addToBom: string; convertTo: string; name: string; footprint: string; pre: string; supplier: string; supplierPart: string; manufacturer: string; mfrPart: string }
export interface FpMeta { units: string; bg: string; gridShow: string; gridColor: string; gridStyle: string; snap: string; gridSize: string; snapSize: string; dragAlt: string; routeWidth: string; routeAngle: string; removeLoop: string; cutSilk: string; footprint: string; pre: string; model3d: string; symbol: string }
export interface SymWork { bg: string; gridShow: string; gridColor: string; gridStyle: string; gridSize: string; snap: string; snapSize: string; altDrag: string }

// ── Stałe skali ────────────────────────────────────────────────────────────────
const W2MM = 0.0254;

// ── Model warstw PCB/footprint ──────────────────────────────────────────────────
type LayerGroup = 'copper' | 'non-copper' | 'other';
interface LayerDef { name: string; color: string; group: LayerGroup; eye?: boolean }
const LAYER_DEFS: LayerDef[] = [
  { name: 'Górna warstwa', color: '#ff2b2b', group: 'copper' },
  { name: 'Dolna warstwa', color: '#0000ff', group: 'copper' },
  { name: 'Górna warstwa opisowa', color: '#f5c518', group: 'non-copper' },
  { name: 'Dolna warstwa opisowa', color: '#6cc04a', group: 'non-copper' },
  { name: 'Górna warstwa maski pasty lutowniczej', color: '#808080', group: 'non-copper' },
  { name: 'Dolna warstwa maski pasty lutowniczej', color: '#7a1414', group: 'non-copper' },
  { name: 'Górna warstwa maski lutowniczej', color: '#800080', group: 'non-copper' },
  { name: 'Dolna warstwa maski lutowniczej', color: '#9b30ff', group: 'non-copper' },
  { name: 'Ratlines', color: '#5b7cff', group: 'other', eye: false },
  { name: 'Obrys płyty', color: '#ff33cc', group: 'other' },
  { name: 'Wielowastwa', color: '#c0c0c0', group: 'copper' },
  { name: 'Dokument', color: '#ffffff', group: 'other' },
  { name: 'Górny montaż', color: '#3cb371', group: 'other' },
  { name: 'Dolny montaż', color: '#4169e1', group: 'other' },
  { name: 'Mechanika', color: '#ff33cc', group: 'other' },
  { name: '3DModel', color: '#87cefa', group: 'other' },
  { name: 'ComponentShapeLayer', color: '#3cb0a0', group: 'other' },
  { name: 'LeadShapeLayer', color: '#cc8888', group: 'other' },
  { name: 'ComponentMarkingLayer', color: '#5fe0c0', group: 'other' },
];
export type LayerState = Record<string, { color: string; visible: boolean }>;
export const defaultLayers = (): LayerState => Object.fromEntries(LAYER_DEFS.map((l) => [l.name, { color: l.color, visible: true }]));
const fpLayer = (l: string) => LAYER_DEFS.find((d) => d.name === l)?.color ?? '#c9a227';

// ── Kolory warstw EasyEDA ───────────────────────────────────────────────────────
// Kolor warstwy footprintu EasyEDA
const fpLayerColor = (layer: string) => ({ '1': '#d94a4a', '2': '#3a6bd6', '3': '#e8c84a', '10': '#c9a227', '11': '#c9a227', '12': '#e8c84a', '100': '#c9a227' } as Record<string, string>)[layer] ?? '#e8c84a';
// Numer warstwy EasyEDA → nazwa naszej warstwy (kolor z panelu Layers); EE_FLIP zamienia górne↔dolne (dla dolnej strony)
const EE_LAYER_NAME: Record<string, string> = { '1': 'Górna warstwa', '2': 'Dolna warstwa', '3': 'Górna warstwa opisowa', '4': 'Dolna warstwa opisowa', '5': 'Górna warstwa maski pasty lutowniczej', '6': 'Dolna warstwa maski pasty lutowniczej', '7': 'Górna warstwa maski lutowniczej', '8': 'Dolna warstwa maski lutowniczej', '10': 'Obrys płyty', '11': 'Wielowastwa', '12': 'Dokument', '13': 'Górny montaż', '14': 'Dolny montaż', '100': 'Wielowastwa' };
const EE_FLIP: Record<string, string> = { '1': '2', '2': '1', '3': '4', '4': '3', '5': '6', '6': '5', '7': '8', '8': '7', '13': '14', '14': '13' };
const eeLayerColor = (layerNum: string, layers?: LayerState, flip?: boolean): string => {
  const ln = flip && EE_FLIP[layerNum] ? EE_FLIP[layerNum] : layerNum;
  const name = EE_LAYER_NAME[ln];
  if (name && layers && layers[name]) return layers[name].color;
  return name ? fpLayer(name) : fpLayerColor(layerNum);
};

// Transform tekstu utrzymujący go „prosto" (poziomo, czytelnie) mimo obrotu/odbicia grupy nadrzędnej.
const uprightT = (x: number, y: number, rot?: number, mir?: boolean): string | undefined => {
  const r = rot || 0; if (!r && !mir) return undefined;
  return mir ? `translate(${x} ${y}) scale(-1 1) rotate(${-r}) translate(${-x} ${-y})` : `rotate(${-r} ${x} ${y})`;
};

// Parser footprintu EasyEDA (packageDetail.dataStr.shape) → SVG na canvas PCB
export function renderFootprint(fp: EasyEdaSym, preview?: boolean, layers?: LayerState, flip?: boolean, tr?: number) {
  const SC = 4; // 1 jednostka ≈ 10 mil → skala dla czytelności
  const cx = fp.bbox ? fp.bbox.x + fp.bbox.width / 2 : 0;
  const cy = fp.bbox ? fp.bbox.y + fp.bbox.height / 2 : 0;
  const out: ReactNode[] = [];
  const col = (ln: string) => eeLayerColor(ln, layers, flip); // kolor wg warstwy (z panelu Layers, z odbiciem strony)
  fp.shapes.forEach((s, i) => {
    const t = s.split('~');
    switch (t[0]) {
      case 'PAD': {
        // PAD~shape~cx~cy~w~h~layer~net~num~holeR~... → t[6] = warstwa (1 top / 2 bottom / 11 multi)
        const shape = t[1], px = +t[2], py = +t[3], w = +t[4], h = +t[5], pc = col(t[6] || '11'), num = t[8], holeR = +t[9] || 0;
        if (shape === 'RECT') out.push(<rect key={`pad${i}`} x={px - w / 2} y={py - h / 2} width={w} height={h} fill={pc} stroke="none" opacity={preview ? 0.6 : 0.95} />);
        else out.push(<ellipse key={`pad${i}`} cx={px} cy={py} rx={w / 2} ry={h / 2} fill={pc} stroke="none" opacity={preview ? 0.6 : 0.95} />);
        if (holeR > 0) out.push(<circle key={`hole${i}`} cx={px} cy={py} r={holeR} fill="#111" stroke="none" />);
        if (num) out.push(<text key={`num${i}`} x={px} y={py + 0.6} fontSize={1.6} fill="#1b1f24" stroke="none" textAnchor="middle" fontFamily="sans-serif" transform={uprightT(px, py + 0.6, tr, flip)}>{num}</text>);
        break;
      }
      case 'TRACK': out.push(<polyline key={`trk${i}`} points={t[4]} fill="none" stroke={col(t[2])} strokeWidth={Math.max(0.15, +t[1] || 0.6)} strokeLinecap="round" opacity={preview ? 0.6 : 1} />); break;
      case 'CIRCLE': out.push(<circle key={`cir${i}`} cx={+t[1]} cy={+t[2]} r={+t[3]} fill="none" stroke={col(t[5])} strokeWidth={Math.max(0.12, +t[4] || 0.3)} opacity={preview ? 0.6 : 1} />); break;
      case 'ARC': out.push(<path key={`arc${i}`} d={t[4]} fill="none" stroke={col(t[2])} strokeWidth={Math.max(0.15, +t[1] || 0.5)} opacity={preview ? 0.6 : 1} />); break;
      default: break; // SOLIDREGION / SVGNODE / TEXT — pomijamy
    }
  });
  return <g transform={`scale(${SC}) translate(${-cx},${-cy})`}>{out}</g>;
}

export function renderPcbPart(comp: PlacedComp, key: Key, preview = false, layers?: LayerState) {
  const bottom = comp.layer === 'Dolna warstwa'; // dolna strona → lustro + zamiana warstw góra↔dół (kolory)
  const rot = comp.rotation || 0;
  // Półwymiary footprintu w przestrzeni tekstu (świat) — do proporcjonalnego rozmiaru/pozycji prefiksu/nazwy.
  let hw = 14, hh = 10;
  let body: ReactNode;
  if (comp.fp) {
    body = renderFootprint(comp.fp, preview, layers, bottom, rot);
    if (comp.fp.bbox) { hw = comp.fp.bbox.width * 2; hh = comp.fp.bbox.height * 2; } // renderFootprint skaluje ×SC(4) → półwymiar = width·2
  } else if (comp.fpEls && comp.fpEls.length) {
    // Footprint z Work Space (własne FpEl na warstwach) — wyśrodkowany w (0,0), renderowany z kolorami warstw.
    const bb = unionBB(comp.fpEls, elBBoxFp);
    hw = bb.w / 2; hh = bb.h / 2;
    body = <g transform={`translate(${-(bb.x + bb.w / 2)},${-(bb.y + bb.h / 2)})`}>{comp.fpEls.map((el, i) => renderFpEl(el, i, preview, layers))}</g>;
  } else {
    body = <g><rect x={-14} y={-10} width={28} height={20} fill="none" stroke="#e8c84a" strokeWidth={1} strokeDasharray={preview ? '3 2' : undefined} /></g>;
  }
  // Footprint na PCB ma WŁASNĄ pozycję (pcbX/pcbY), niezależną od symbolu na schemacie (x/y).
  const px = comp.pcbX ?? comp.x, py = comp.pcbY ?? comp.y;
  const tf = `translate(${px},${py}) rotate(${rot})${bottom ? ' scale(-1,1)' : ''}`;
  // Prefiks/nazwa proporcjonalne do rozmiaru footprintu (świat = mil) — stały fontSize=7 znikał na dużych footprintach z Work Space.
  const refFs = Math.max(6, Math.min(Math.max(hw, hh) * 0.14, Math.min(hw, hh) * 0.8));
  const nameFs = refFs * 0.85;
  const refY = -(hh + refFs * 0.5);
  const nameY = hh + nameFs * 1.1;
  return <g key={key} transform={tf} opacity={preview ? 0.7 : 1}>{body}
    {comp.showPrefix !== 'Nie' && <text x={0} y={refY} fontSize={refFs} fill={bottom ? '#3a6bd6' : '#e8c84a'} stroke="none" textAnchor="middle" fontFamily="sans-serif" transform={uprightT(0, refY, rot, bottom)}>{comp.ref}</text>}
    {comp.showName === 'Tak' && <text x={0} y={nameY} fontSize={nameFs} fill={bottom ? '#3a6bd6' : '#e8c84a'} stroke="none" textAnchor="middle" fontFamily="sans-serif" transform={uprightT(0, nameY, rot, bottom)}>{comp.label}</text>}
  </g>;
}

// Geometria linii pinu: z ścieżki (M x y h/v/l) + punktu kropki wyznacz koniec wewnętrzny (przy body) i kierunek
function parsePinLine(d: string, dot: { x: number; y: number }) {
  const m = d.match(/M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*([hvHVlL])?\s*(-?[\d.]+)?(?:[ ,]+(-?[\d.]+))?/);
  if (!m) return { inner: dot, dir: { x: 1, y: 0 } };
  const sx = +m[1], sy = +m[2], cmd = m[3], a = m[4] ? +m[4] : 0, b = m[5] ? +m[5] : 0;
  let ex = sx, ey = sy;
  if (cmd === 'h') ex = sx + a; else if (cmd === 'H') ex = a;
  else if (cmd === 'v') ey = sy + a; else if (cmd === 'V') ey = a;
  else if (cmd === 'l') { ex = sx + a; ey = sy + b; } else if (cmd === 'L') { ex = a; ey = b; }
  const inner = Math.hypot(ex - dot.x, ey - dot.y) >= Math.hypot(sx - dot.x, sy - dot.y) ? { x: ex, y: ey } : { x: sx, y: sy };
  const len = Math.hypot(inner.x - dot.x, inner.y - dot.y) || 1;
  return { inner, dir: { x: (inner.x - dot.x) / len, y: (inner.y - dot.y) / len } };
}

// Parser symbolu EasyEDA (dataStr.shape) → elementy SVG, wyśrodkowany w (0,0)
type PinInfo = { i: number; dot: Pt; inner: Pt; dir: Pt; name: string; nameColor: string; num: string; numColor: string };
export function renderEasyEdaSymbol(sym: EasyEdaSym, preview?: boolean, tr?: number, mir?: boolean) {
  const p = scProps(preview);
  const cx = sym.bbox ? sym.bbox.x + sym.bbox.width / 2 : 0;
  const cy = sym.bbox ? sym.bbox.y + sym.bbox.height / 2 : 0;
  const out: ReactNode[] = [];
  const pins: PinInfo[] = [];
  sym.shapes.forEach((s, i) => {
    const t = s.split('~');
    switch (t[0]) {
      case 'R': out.push(<rect key={i} x={+t[1]} y={+t[2]} rx={+t[3] || 0} ry={+t[4] || 0} width={+t[5]} height={+t[6]} {...p} />); break;
      case 'E': out.push(<ellipse key={i} cx={+t[1]} cy={+t[2]} rx={+t[3]} ry={+t[4]} {...p} />); break;
      case 'PL': case 'PG': { const pts = t[1]; if (t[0] === 'PG') out.push(<polygon key={i} points={pts} {...p} />); else out.push(<polyline key={i} points={pts} {...p} />); break; }
      case 'PT': case 'A': out.push(<path key={i} d={t[1]} {...p} />); break;
      case 'P': {
        const segs = s.split('^^'); const pathD = segs[2]?.split('~')[0]; const ds = segs[1]?.split('~');
        const dot = ds && ds.length >= 2 ? { x: +ds[0], y: +ds[1] } : null;
        if (pathD) out.push(<path key={`pp${i}`} d={pathD} {...p} />);
        if (dot) out.push(<circle key={`pd${i}`} cx={dot.x} cy={dot.y} r={1.4} fill={RED} stroke="none" />);
        if (dot && pathD) {
          const { inner, dir } = parsePinLine(pathD, dot);
          const nameSeg = segs[3]?.split('~'), numSeg = segs[4]?.split('~');
          pins.push({ i, dot, inner, dir, name: nameSeg && nameSeg[0] === '1' && nameSeg[4] ? nameSeg[4] : '', nameColor: nameSeg?.[8] || '#0000FF', num: numSeg && numSeg[0] === '1' && numSeg[4] ? numSeg[4] : '', numColor: numSeg?.[8] || '#0000FF' });
        }
        break;
      }
      default: break;
    }
  });
  // Rozmieszczenie etykiet pinów: grupuj wg strony, a gdy gęsto — układaj w kilku rzędach (kolumnach),
  // aby nazwy/numery nie nachodziły na siebie (greedy: najniższy wolny rząd wzdłuż osi pinów).
  const fs = 6, gap = 3;
  const sideKey = (pn: PinInfo) => (Math.abs(pn.dir.x) >= Math.abs(pn.dir.y) ? (pn.dir.x >= 0 ? 'L' : 'R') : (pn.dir.y >= 0 ? 'T' : 'B'));
  const groups = new Map<string, PinInfo[]>();
  pins.forEach((pn) => { const g = groups.get(sideKey(pn)) || []; g.push(pn); groups.set(sideKey(pn), g); });
  groups.forEach((arr, k) => {
    const horiz = k === 'L' || k === 'R';
    arr.sort((a, b) => (horiz ? a.inner.y - b.inner.y : a.inner.x - b.inner.x));
    const maxNameLen = arr.reduce((m, pn) => Math.max(m, pn.name.length), 1);
    const nameCol = fs * (maxNameLen * 0.62 + 1.5), numCol = fs * 1.5, half = fs * 0.62;
    const rowEnds: number[] = [];
    arr.forEach((pn) => {
      const along = horiz ? pn.inner.y : pn.inner.x;
      let row = rowEnds.findIndex((e) => e <= along - half);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = along + half;
      if (pn.name) {
        const anchor = pn.dir.x > 0.3 ? 'start' : pn.dir.x < -0.3 ? 'end' : 'middle';
        const off = gap + row * nameCol; const nx = pn.inner.x + pn.dir.x * off, ny = pn.inner.y + pn.dir.y * off + (horiz ? fs * 0.35 : 0);
        out.push(<text key={`pname${pn.i}`} x={nx} y={ny} fontSize={fs} fill={pn.nameColor} stroke="none" textAnchor={anchor} fontFamily="sans-serif" transform={uprightT(nx, ny, tr, mir)}>{pn.name}</text>);
      }
      if (pn.num) {
        const perp = { x: -pn.dir.y, y: pn.dir.x }, sgn = perp.y <= 0 ? 1 : -1;
        const mx = (pn.dot.x + pn.inner.x) / 2, my = (pn.dot.y + pn.inner.y) / 2, off = gap + row * numCol;
        const qx = mx + perp.x * off * sgn, qy = my + perp.y * off * sgn - 0.6;
        out.push(<text key={`pnum${pn.i}`} x={qx} y={qy} fontSize={fs} fill={pn.numColor} stroke="none" textAnchor="middle" fontFamily="sans-serif" transform={uprightT(qx, qy, tr, mir)}>{pn.num}</text>);
      }
    });
  });
  return <g transform={`translate(${-cx},${-cy})`}>{out}</g>;
}

const scProps = (preview?: boolean) => ({ stroke: RED, strokeWidth: 1.4, fill: 'none' as const, strokeDasharray: preview ? '4 3' : undefined });
const txt = (x: number, y: number, s: string, anchor: 'start' | 'middle' | 'end' = 'middle') => <text x={x} y={y} fontSize={9} fill={RED} stroke="none" textAnchor={anchor} fontFamily="sans-serif">{s}</text>;

// Generyczny symbol IC z N pinami (dla części z Octopart) — środek w (0,0)
function drawGenericIC(pins: number, label: string, preview?: boolean) {
  const perSide = Math.max(1, Math.ceil(pins / 2));
  const pitch = 12, h = Math.max(40, perSide * pitch + 10), w = Math.max(60, label.length * 6.5);
  const p = scProps(preview);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < perSide; i++) { const y = -h / 2 + 12 + i * pitch; nodes.push(<line key={`l${i}`} x1={-w / 2 - 16} y1={y} x2={-w / 2} y2={y} {...p} />); nodes.push(<text key={`ln${i}`} x={-w / 2 + 3} y={y + 3} fontSize={7} fill={RED} stroke="none">{i + 1}</text>); }
  for (let i = 0; i < pins - perSide; i++) { const y = -h / 2 + 12 + i * pitch; nodes.push(<line key={`r${i}`} x1={w / 2} y1={y} x2={w / 2 + 16} y2={y} {...p} />); nodes.push(<text key={`rn${i}`} x={w / 2 - 3} y={y + 3} fontSize={7} fill={RED} stroke="none" textAnchor="end">{perSide + i + 1}</text>); }
  return <g>{<rect x={-w / 2} y={-h / 2} width={w} height={h} {...p} />}{nodes}{txt(0, -h / 2 - 6, label)}</g>;
}

const SCHEMATIC_LIB: CompDef[] = [
  { id: 'R', name: 'Resistor', category: 'Passive', refPrefix: 'R', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -10, 'R?')}<line x1={-25} y1={0} x2={-12} y2={0} {...p} /><path d="M-12 0 l3 -6 l6 12 l6 -12 l6 12 l3 -6" {...p} /><line x1={12} y1={0} x2={25} y2={0} {...p} /></g>; } },
  { id: 'C', name: 'Capacitor', category: 'Passive', refPrefix: 'C', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -14, 'C?')}<line x1={-25} y1={0} x2={-4} y2={0} {...p} /><line x1={-4} y1={-9} x2={-4} y2={9} {...p} /><line x1={4} y1={-9} x2={4} y2={9} {...p} /><line x1={4} y1={0} x2={25} y2={0} {...p} /></g>; } },
  { id: 'L', name: 'Inductor', category: 'Passive', refPrefix: 'L', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -12, 'L?')}<line x1={-25} y1={0} x2={-15} y2={0} {...p} /><path d="M-15 0 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0" {...p} /><line x1={15} y1={0} x2={25} y2={0} {...p} /></g>; } },
  { id: 'D', name: 'Diode', category: 'Discrete', refPrefix: 'D', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -12, 'D?')}<line x1={-25} y1={0} x2={-7} y2={0} {...p} /><path d="M-7 -8 l14 8 l-14 8 Z" {...p} /><line x1={7} y1={-8} x2={7} y2={8} {...p} /><line x1={7} y1={0} x2={25} y2={0} {...p} /></g>; } },
  { id: 'LED', name: 'LED', category: 'Discrete', refPrefix: 'D', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -14, 'LED?')}<line x1={-25} y1={0} x2={-7} y2={0} {...p} /><path d="M-7 -8 l14 8 l-14 8 Z" {...p} /><line x1={7} y1={-8} x2={7} y2={8} {...p} /><line x1={7} y1={0} x2={25} y2={0} {...p} /><path d="M6 -10 l6 -6 m-2 -4 l4 0 0 4" {...p} /></g>; } },
  { id: 'Q', name: 'NPN Transistor', category: 'Discrete', refPrefix: 'Q', pins: 3, draw: (pv) => { const p = scProps(pv); return <g>{txt(14, -12, 'Q?')}<circle cx={0} cy={0} r={14} {...p} /><line x1={-20} y1={0} x2={-5} y2={0} {...p} /><line x1={-5} y1={-9} x2={-5} y2={9} {...p} /><line x1={-5} y1={-5} x2={8} y2={-12} {...p} /><line x1={-5} y1={5} x2={8} y2={12} {...p} /><line x1={8} y1={-12} x2={8} y2={-22} {...p} /><line x1={8} y1={12} x2={8} y2={22} {...p} /></g>; } },
  { id: 'GND', name: 'Ground', category: 'Power', refPrefix: 'GND', pins: 1, draw: (pv) => { const p = scProps(pv); return <g><line x1={0} y1={-14} x2={0} y2={0} {...p} /><line x1={-11} y1={0} x2={11} y2={0} {...p} /><line x1={-7} y1={5} x2={7} y2={5} {...p} /><line x1={-3} y1={10} x2={3} y2={10} {...p} /></g>; } },
  { id: 'VCC', name: 'VCC', category: 'Power', refPrefix: 'VCC', pins: 1, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -18, 'VCC')}<line x1={0} y1={14} x2={0} y2={0} {...p} /><line x1={-9} y1={0} x2={9} y2={0} {...p} /></g>; } },
  { id: 'U8', name: 'IC (8-pin)', category: 'IC', refPrefix: 'U', pins: 8, draw: (pv) => drawGenericIC(8, 'U?', pv) },
  { id: 'J1x4', name: 'Header 1x4', category: 'Connector', refPrefix: 'J', pins: 4, draw: (pv) => { const p = scProps(pv); const n: ReactNode[] = []; for (let i = 0; i < 4; i++) { const y = -21 + i * 14; n.push(<line key={i} x1={12} y1={y} x2={26} y2={y} {...p} />); n.push(<circle key={`c${i}`} cx={9} cy={y} r={2} fill={RED} stroke="none" />); } return <g>{txt(0, -30, 'J?')}<rect x={-12} y={-28} width={24} height={56} {...p} />{n}</g>; } },
];
const LIB_BY_ID = Object.fromEntries(SCHEMATIC_LIB.map((d) => [d.id, d]));

export function renderPlaced(comp: PlacedComp, key: Key, preview = false) {
  const def = LIB_BY_ID[comp.defId];
  const rot = comp.rotation || 0, bmir = comp.layer === 'Dolna warstwa'; // teksty utrzymywane „prosto" mimo rotacji/odbicia
  const body = comp.savedEls ? <g>{comp.savedEls.map((el, i) => renderEl(el, i, preview, { rot, mir: bmir }))}</g>
    : comp.easyeda ? renderEasyEdaSymbol(comp.easyeda, preview, rot, bmir)
      : comp.octopart || !def ? drawGenericIC(comp.pins, comp.label, preview)
        : def.draw(preview);
  const labelY = comp.easyeda && comp.easyeda.bbox ? comp.easyeda.bbox.height / 2 + 12 : 30;
  const mir = bmir ? ' scale(-1,1)' : ''; // „Dolna warstwa" = flaga odbicia symbolu
  // Na schemacie prefiks (R1) sterowany showPrefix; wartość (label, np. „10 kΩ") pokazujemy
  // domyślnie — ukrywa ją tylko showName === 'Nie' (części EasyEDA/Octopart zawsze pokazują wartość).
  const showRef = comp.showPrefix !== 'Nie';
  const showVal = !!comp.label && (comp.showName !== 'Nie' || !!comp.easyeda || !!comp.octopart);
  const caption = [showRef ? comp.ref : '', showVal ? comp.label : ''].filter(Boolean).join('  ');
  return <g key={key} transform={`translate(${comp.x},${comp.y})`} opacity={preview ? 0.6 : 1}><g transform={`rotate(${comp.rotation || 0})${mir}`}>{body}</g>{caption && <text x={0} y={labelY} fontSize={8} fill={C.schBlue} stroke="none" textAnchor="middle" fontFamily="sans-serif">{caption}</text>}</g>;
}

// Prostokątny obrys umieszczonego komponentu (do zaznaczania klikiem)
export function placedBBox(comp: PlacedComp): { x: number; y: number; w: number; h: number } {
  if (comp.savedEls && comp.savedEls.length) {
    const bs = comp.savedEls.map(elBBox); const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y)), x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
    return { x: comp.x + x0, y: comp.y + y0, w: x1 - x0, h: y1 - y0 };
  }
  if (comp.easyeda?.bbox) return { x: comp.x - comp.easyeda.bbox.width / 2, y: comp.y - comp.easyeda.bbox.height / 2, w: comp.easyeda.bbox.width, h: comp.easyeda.bbox.height };
  return { x: comp.x - 40, y: comp.y - 25, w: 80, h: 55 };
}
// Obrys komponentu na PCB (renderPcbPart: footprint wyśrodkowany w (x,y), skala ×4)
export function pcbPartBBox(comp: PlacedComp): { x: number; y: number; w: number; h: number } {
  const px = comp.pcbX ?? comp.x, py = comp.pcbY ?? comp.y; // pozycja footprintu na PCB (niezależna od symbolu)
  const b = comp.fp?.bbox;
  if (b) return { x: px - b.width * 2, y: py - b.height * 2, w: b.width * 4, h: b.height * 4 };
  if (comp.fpEls && comp.fpEls.length) { const bb = unionBB(comp.fpEls, elBBoxFp); return { x: px - bb.w / 2, y: py - bb.h / 2, w: bb.w, h: bb.h }; }
  return { x: px - 16, y: py - 12, w: 32, h: 24 };
}

// ── Symbole sieciowe / renderEl ─────────────────────────────────────────────────
const dashOf = (s: string) => (s === 'dash' ? '6 4' : s === 'kropka' ? '2 3' : undefined);
const sa = (e: ShapeStyle, preview?: boolean) => ({ stroke: e.stroke || '#000000', strokeWidth: e.strokeWidth || 1, fill: e.fill && e.fill !== 'none' ? e.fill : 'none', strokeDasharray: preview ? '4 3' : dashOf(e.strokeStyle) } as const);
const ANCHOR: Record<string, 'start' | 'middle' | 'end'> = { 'początek': 'start', 'środek': 'middle', 'koniec': 'end' };
const pinEnd = (p: PinEl) => { const r = (p.rotation || 0) * Math.PI / 180; return { x: p.x + Math.cos(r) * p.length, y: p.y + Math.sin(r) * p.length }; };

// Pozycja etykiety tekstowej symbolu sieciowego (względem punktu zaczepienia).
const netLabelPos = (el: NetSym & { t: 'netflag' | 'netport' | 'probe'; flagType?: string }): Pt =>
  el.t === 'netflag' ? (el.flagType === 'gnd' ? { x: el.x, y: el.y + 34 } : { x: el.x, y: el.y - 24 }) : { x: el.x + 14, y: el.y + 4 };

export function renderEl(el: El, key: Key, preview = false, upr?: { rot: number; mir: boolean }) {
  const ut = (x: number, y: number) => (upr ? uprightT(x, y, upr.rot, upr.mir) : undefined); // teksty „prosto" mimo rotacji
  // własny obrót + odbicie glifu (net/tekst): rotate(rot) wokół zaczepienia, opcjonalnie scale(-1,1)
  const selfRot = (x: number, y: number): string | undefined => {
    const r = (el as { rot?: number }).rot || 0, f = (el as { flip?: boolean }).flip;
    if (!r && !f) return undefined;
    return `translate(${x} ${y}) rotate(${r})${f ? ' scale(-1 1)' : ''} translate(${-x} ${-y})`;
  };
  switch (el.t) {
    case 'pin': {
      const e = pinEnd(el), fs = parseInt(el.fontSize) || 7, out = Math.cos((el.rotation || 0) * Math.PI / 180) >= 0, sw = preview ? 1 : 1.4, dash = preview ? '4 3' : undefined;
      const nx = e.x + (out ? 4 : -4), ny = e.y + fs / 3, mx = (el.x + e.x) / 2, my = el.y - 3;
      return <g key={key} opacity={preview ? 0.6 : el.show === false ? 0.35 : 1}>
        <line x1={el.x} y1={el.y} x2={e.x} y2={e.y} stroke={el.pinColor || SYM_COLOR} strokeWidth={sw} strokeDasharray={dash} />
        {el.dot ? <circle cx={el.x} cy={el.y} r={2.4} fill="none" stroke={el.pinColor || SYM_COLOR} strokeWidth={1} /> : <circle cx={el.x} cy={el.y} r={1.4} fill={el.pinColor || SYM_COLOR} />}
        {el.clock && <path d={`M${e.x},${e.y - 4} L${e.x + (out ? 5 : -5)},${e.y} L${e.x},${e.y + 4}`} fill="none" stroke={el.pinColor || SYM_COLOR} strokeWidth={1} />}
        {el.showName !== false && <text x={nx} y={ny} fontSize={fs} fill={el.nameColor || '#0000FF'} textAnchor={out ? 'start' : 'end'} fontFamily={el.fontFamily || 'sans-serif'} stroke="none" transform={ut(nx, ny)}>{el.name}</text>}
        {el.showNumber !== false && <text x={mx} y={my} fontSize={fs} fill={el.numberColor || '#0000FF'} textAnchor="middle" fontFamily={el.fontFamily || 'sans-serif'} stroke="none" transform={ut(mx, my)}>{el.number}</text>}
      </g>;
    }
    case 'line': return <polyline key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} {...sa(el, preview)} />;
    case 'polygon': return <polygon key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} {...sa(el, preview)} />;
    case 'freehand': return <polyline key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} {...sa(el, preview)} />;
    case 'bezier': { const [a, b, c] = el.pts; if (!a || !b) return null; return <path key={key} d={c ? `M${a.x},${a.y} Q${b.x},${b.y} ${c.x},${c.y}` : `M${a.x},${a.y} L${b.x},${b.y}`} {...sa(el, preview)} />; }
    case 'rect': return <rect key={key} x={Math.min(el.x, el.x + el.w)} y={Math.min(el.y, el.y + el.h)} width={Math.abs(el.w)} height={Math.abs(el.h)} rx={el.roundRadius || 0} ry={el.roundRadius || 0} {...sa(el, preview)} />;
    case 'ellipse': return <ellipse key={key} cx={el.cx} cy={el.cy} rx={Math.abs(el.rx)} ry={Math.abs(el.ry)} {...sa(el, preview)} />;
    case 'arc': return <path key={key} d={`M${el.cx - el.rx},${el.cy} A${Math.abs(el.rx)},${Math.abs(el.ry)} 0 0 1 ${el.cx + el.rx},${el.cy}`} {...sa(el, preview)} />;
    case 'pie': { const a0 = -50 * Math.PI / 180, a1 = 230 * Math.PI / 180; const p0 = { x: el.cx + el.rx * Math.cos(a0), y: el.cy + el.ry * Math.sin(a0) }, p1 = { x: el.cx + el.rx * Math.cos(a1), y: el.cy + el.ry * Math.sin(a1) }; return <path key={key} d={`M${el.cx},${el.cy} L${p0.x},${p0.y} A${Math.abs(el.rx)},${Math.abs(el.ry)} 0 1 1 ${p1.x},${p1.y} Z`} {...sa(el, preview)} />; }
    case 'arrow': { const s = el.size / 15; return <g key={key} transform={`translate(${el.x},${el.y}) rotate(${el.rotation})`} opacity={preview ? 0.6 : 1}><path d={`M0,0 l${-14 * s},${-6 * s} l0,${12 * s} Z`} fill={el.fill || '#000000'} stroke="none" /></g>; }
    case 'text': return <text key={key} x={el.x} y={el.y} fontSize={parseInt(el.fontSize) || 9} fill={el.color || '#0000FF'} fontFamily={el.fontFamily || 'sans-serif'} textAnchor={ANCHOR[el.anchor] || 'start'} fontWeight={el.fontWeight === 'bold' ? 'bold' : undefined} fontStyle={el.fontStyle === 'italic' ? 'italic' : undefined} stroke="none" opacity={preview ? 0.6 : 1} transform={upr ? ut(el.x, el.y) : selfRot(el.x, el.y)}>{el.text}</text>;
    case 'image': return <g key={key} transform={`rotate(${el.rotation} ${el.x + el.w / 2} ${el.y + el.h / 2})`} opacity={preview ? 0.6 : 1}>{el.url ? <image href={el.url} x={el.x} y={el.y} width={el.w} height={el.h} preserveAspectRatio="none" /> : <><rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke="#888" strokeDasharray="4 3" /><circle cx={el.x + el.w * 0.28} cy={el.y + el.h * 0.32} r={4} fill="#888" /></>}</g>;
    case 'wire': case 'bus': return <polyline key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} {...sa(el, preview)} strokeLinejoin="round" strokeLinecap="round" />;
    case 'busentry': return <line key={key} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} {...sa(el, preview)} strokeLinecap="round" />;
    case 'netlabel': return <text key={key} x={el.x} y={el.y} fontSize={parseInt(el.fontSize) || 7} fill={el.color || '#0000ff'} fontFamily={el.fontFamily || 'serif'} stroke="none" opacity={preview ? 0.6 : 1} transform={selfRot(el.x, el.y)}>{el.name}</text>;
    case 'netflag': case 'netport': case 'probe': {
      const lp = netLabelPos(el), fs = parseInt(el.fontSize) || 9;
      const label = el.show !== false && <text x={lp.x} y={lp.y} fontSize={fs} fill={el.color || '#000000'} fontFamily={el.fontFamily || 'serif'} textAnchor={ANCHOR[el.anchor] || 'start'} fontWeight={el.fontWeight === 'bold' ? 'bold' : undefined} fontStyle={el.fontStyle === 'italic' ? 'italic' : undefined} stroke="none" transform={uprightT(lp.x, lp.y, (el as { rot?: number }).rot || 0, (el as { flip?: boolean }).flip)}>{el.name}</text>;
      const gc = el.color || '#000000';
      let glyph: ReactNode = null;
      if (el.t === 'netflag' && el.flagType === 'gnd') glyph = <><line x1={el.x} y1={el.y} x2={el.x} y2={el.y + 12} /><line x1={el.x - 8} y1={el.y + 12} x2={el.x + 8} y2={el.y + 12} /><line x1={el.x - 5} y1={el.y + 16} x2={el.x + 5} y2={el.y + 16} /><line x1={el.x - 2} y1={el.y + 20} x2={el.x + 2} y2={el.y + 20} /></>;
      else if (el.t === 'netflag') glyph = <><line x1={el.x} y1={el.y} x2={el.x} y2={el.y - 12} /><line x1={el.x - 8} y1={el.y - 12} x2={el.x + 8} y2={el.y - 12} /><path d={`M${el.x - 5},${el.y - 12} L${el.x},${el.y - 19} L${el.x + 5},${el.y - 12} Z`} fill={gc} /></>;
      else if (el.t === 'netport') glyph = <polygon points={`${el.x},${el.y} ${el.x + 8},${el.y - 7} ${el.x + 46},${el.y - 7} ${el.x + 46},${el.y + 7} ${el.x + 8},${el.y + 7}`} fill="none" />;
      else glyph = <><circle cx={el.x} cy={el.y} r={5} fill="none" /><line x1={el.x + 5} y1={el.y} x2={el.x + 11} y2={el.y} /><path d={`M${el.x - 2},${el.y + 2} L${el.x},${el.y - 3} L${el.x + 2},${el.y + 2}`} fill="none" /></>;
      return <g key={key} stroke={gc} strokeWidth={1} fill="none" opacity={preview ? 0.6 : 1} transform={selfRot(el.x, el.y)}>{glyph}{label}</g>;
    }
    case 'noconnect': { const s = 6; return <g key={key} stroke={el.stroke || '#33cc33'} strokeWidth={1.4} opacity={preview ? 0.6 : 1} transform={selfRot(el.x, el.y)}><line x1={el.x - s} y1={el.y - s} x2={el.x + s} y2={el.y + s} /><line x1={el.x - s} y1={el.y + s} x2={el.x + s} y2={el.y - s} /></g>; }
    case 'group': return <g key={key} opacity={preview ? 0.6 : 1}>{el.children.map((c, i) => renderEl(c, i, preview, upr))}</g>;
    default: return null;
  }
}

// bbox tekstu etykiety symbolu sieci (do elBBox) — w układzie niezrotowanym
function elTextBBox(el: El): { x: number; y: number; w: number; h: number } | null {
  if (el.t !== 'netflag' && el.t !== 'netport' && el.t !== 'probe') return null;
  if (el.show === false || !el.name) return null;
  const lp = netLabelPos(el), fs = parseInt(el.fontSize) || 9;
  return { x: lp.x, y: lp.y - fs, w: Math.max(16, el.name.length * fs * 0.6), h: fs * 1.4 };
}

// Prostokątny obrys (bbox) elementu — do trafiania kliknięciem
export function elBBox(el: El): { x: number; y: number; w: number; h: number } {
  switch (el.t) {
    case 'pin': { const e = pinEnd(el); return { x: Math.min(el.x, e.x), y: Math.min(el.y, e.y), w: Math.abs(e.x - el.x), h: Math.abs(e.y - el.y) }; }
    case 'line': case 'polygon': case 'bezier': case 'freehand': { const xs = el.pts.map((p) => p.x), ys = el.pts.map((p) => p.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
    case 'rect': return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
    case 'ellipse': case 'arc': case 'pie': return { x: el.cx - Math.abs(el.rx), y: el.cy - Math.abs(el.ry), w: 2 * Math.abs(el.rx), h: 2 * Math.abs(el.ry) };
    case 'arrow': return { x: el.x - el.size, y: el.y - el.size, w: el.size * 2, h: el.size * 2 };
    case 'text': { const fs = parseInt(el.fontSize) || 9; return { x: el.x, y: el.y - fs, w: Math.max(20, el.text.length * fs * 0.6), h: fs * 1.4 }; }
    case 'image': return { x: el.x, y: el.y, w: el.w, h: el.h };
    case 'wire': case 'bus': { const xs = el.pts.map((p) => p.x), ys = el.pts.map((p) => p.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
    case 'busentry': return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
    case 'netlabel': { const fs = parseInt(el.fontSize) || 7; return { x: el.x, y: el.y - fs, w: Math.max(20, el.name.length * fs * 0.6), h: fs * 1.4 }; }
    case 'netflag': case 'netport': case 'probe': { const glyph = el.t === 'netport' ? { x: el.x, y: el.y - 7, w: 46, h: 14 } : el.t === 'probe' ? { x: el.x - 5, y: el.y - 5, w: 16, h: 10 } : (el.flagType === 'gnd' ? { x: el.x - 8, y: el.y, w: 16, h: 20 } : { x: el.x - 8, y: el.y - 19, w: 16, h: 19 }); const tb = elTextBBox(el); if (!tb) return glyph; const x0 = Math.min(glyph.x, tb.x), y0 = Math.min(glyph.y, tb.y); return { x: x0, y: y0, w: Math.max(glyph.x + glyph.w, tb.x + tb.w) - x0, h: Math.max(glyph.y + glyph.h, tb.y + tb.h) - y0 }; }
    case 'noconnect': return { x: el.x - 6, y: el.y - 6, w: 12, h: 12 };
    case 'group': { const bs = el.children.map(elBBox); if (!bs.length) return { x: 0, y: 0, w: 0, h: 0 }; const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y)); return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y }; }
    default: return { x: 0, y: 0, w: 0, h: 0 };
  }
}

// ── FpEl (footprint / PCB) ──────────────────────────────────────────────────────
interface FpBase { id: string; locked: boolean }
export type FpEl =
  | ({ t: 'track'; pts: Pt[]; width: number; layer: string } & FpBase)
  | ({ t: 'pad'; x: number; y: number; shape: string; w: number; h: number; rot: number; holeShape: string; hole: number; plated: string; num: string; expansion: number; layer: string } & FpBase)
  | ({ t: 'via'; x: number; y: number; dia: number; holeW: number } & FpBase)
  | ({ t: 'ftext'; x: number; y: number; text: string; font: string; lineWidth: number; height: number; rot: number; layer: string } & FpBase)
  | ({ t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; width: number; dir: string; arcType: string; layer: string } & FpBase)
  | ({ t: 'fcircle'; cx: number; cy: number; r: number; width: number; layer: string } & FpBase)
  | ({ t: 'hole'; x: number; y: number; hole: number } & FpBase)
  | ({ t: 'fill'; pts: Pt[]; fillType: string; layer: string } & FpBase)
  | ({ t: 'dimension'; x1: number; y1: number; x2: number; y2: number; unit: string; precision: number; width: number; layer: string } & FpBase)
  | ({ t: 'frect'; x: number; y: number; w: number; h: number; fill: string; width: number; layer: string } & FpBase)
  | ({ t: 'copper'; pts: Pt[]; layer: string; name: string; net: string; clearance: number; connect: string; spokeWidth: number; keepIsland: string; fillStyle: string; copperToRa: number; improveProd: string } & FpBase)
  | ({ t: 'group'; children: FpEl[] } & FpBase);

export function renderFpEl(el: FpEl, key: Key, preview = false, layers?: LayerState) {
  const op = preview ? 0.6 : 1;
  const layer = 'layer' in el ? el.layer : undefined;
  const st = layer && layers ? layers[layer] : undefined;
  if (st && !st.visible && !preview) return null; // warstwa ukryta → nie rysuj
  const col = st ? st.color : layer ? fpLayer(layer) : '#c9a227';
  switch (el.t) {
    case 'track': return <polyline key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={col} strokeWidth={el.width} strokeLinecap="round" strokeLinejoin="round" opacity={op} />;
    case 'pad': { const pc = st ? st.color : fpLayer(el.layer); const pad = el.shape === 'Prostokąt' ? <rect x={-el.w / 2} y={-el.h / 2} width={el.w} height={el.h} fill={pc} /> : <ellipse cx={0} cy={0} rx={el.w / 2} ry={el.h / 2} fill={pc} />; return <g key={key} transform={`translate(${el.x},${el.y}) rotate(${el.rot})`} opacity={op}>{pad}{el.hole > 0 && <circle r={el.hole / 2} fill="#111" />}<text y={3} fontSize={7} fill="#1b1f24" textAnchor="middle" fontFamily="sans-serif">{el.num}</text></g>; }
    case 'via': return <g key={key} opacity={op}><circle cx={el.x} cy={el.y} r={el.dia / 2} fill="#c9a227" /><circle cx={el.x} cy={el.y} r={el.holeW / 2} fill="#111" /></g>;
    case 'ftext': return <text key={key} x={el.x} y={el.y} fontSize={el.height} fill={col} fontFamily="sans-serif" transform={`rotate(${el.rot} ${el.x} ${el.y})`} opacity={op}>{el.text}</text>;
    case 'arc': { const rad = (d: number) => d * Math.PI / 180; const p0 = { x: el.cx + el.r * Math.cos(rad(el.a0)), y: el.cy + el.r * Math.sin(rad(el.a0)) }, p1 = { x: el.cx + el.r * Math.cos(rad(el.a1)), y: el.cy + el.r * Math.sin(rad(el.a1)) }; const large = Math.abs(el.a1 - el.a0) % 360 > 180 ? 1 : 0, sweep = el.dir === 'Anti-Clockwise' ? 0 : 1; return <path key={key} d={`M${p0.x},${p0.y} A${el.r},${el.r} 0 ${large} ${sweep} ${p1.x},${p1.y}`} fill="none" stroke={col} strokeWidth={el.width} opacity={op} />; }
    case 'fcircle': return <circle key={key} cx={el.cx} cy={el.cy} r={Math.abs(el.r)} fill="none" stroke={col} strokeWidth={el.width} opacity={op} />;
    case 'hole': return <circle key={key} cx={el.x} cy={el.y} r={el.hole / 2} fill="#111" stroke="#c9a227" strokeWidth={1} opacity={op} />;
    case 'fill': return <polygon key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={col} fillOpacity={0.35} stroke={col} strokeWidth={2} opacity={op} />;
    case 'copper': return <polygon key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={col} fillOpacity={el.fillStyle === 'Brak' ? 0 : 0.28} stroke={col} strokeWidth={2} strokeDasharray={preview ? '4 3' : undefined} opacity={op} />;
    case 'dimension': { const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1); return <g key={key} opacity={op}><line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={col} strokeWidth={el.width} /><text x={(el.x1 + el.x2) / 2} y={(el.y1 + el.y2) / 2 - 4} fontSize={28} fill={col} textAnchor="middle">{(len * W2MM).toFixed(el.precision)}mm</text></g>; }
    case 'frect': return <rect key={key} x={Math.min(el.x, el.x + el.w)} y={Math.min(el.y, el.y + el.h)} width={Math.abs(el.w)} height={Math.abs(el.h)} fill={el.fill === 'Tak' ? col : 'none'} stroke={col} strokeWidth={el.width} opacity={op} />;
    case 'group': return <g key={key} opacity={op}>{el.children.map((c, i) => renderFpEl(c, `${key}-${i}`, preview, layers))}</g>;
    default: return null;
  }
}
export function elBBoxFp(el: FpEl): { x: number; y: number; w: number; h: number } {
  if (el.t === 'group') { if (!el.children.length) return { x: 0, y: 0, w: 0, h: 0 }; const bs = el.children.map(elBBoxFp); const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y)); return { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 }; }
  switch (el.t) {
    case 'track': case 'fill': case 'copper': { const xs = el.pts.map((p) => p.x), ys = el.pts.map((p) => p.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
    case 'pad': return { x: el.x - el.w / 2, y: el.y - el.h / 2, w: el.w, h: el.h };
    case 'via': return { x: el.x - el.dia / 2, y: el.y - el.dia / 2, w: el.dia, h: el.dia };
    case 'ftext': return { x: el.x, y: el.y - el.height, w: Math.max(20, el.text.length * el.height * 0.6), h: el.height * 1.3 };
    case 'arc': case 'fcircle': return { x: el.cx - Math.abs(el.r), y: el.cy - Math.abs(el.r), w: 2 * Math.abs(el.r), h: 2 * Math.abs(el.r) };
    case 'hole': return { x: el.x - el.hole / 2, y: el.y - el.hole / 2, w: el.hole, h: el.hole };
    case 'dimension': { const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2); return { x, y, w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) }; }
    case 'frect': return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
    default: return { x: 0, y: 0, w: 0, h: 0 };
  }
}

// ── Pomocnicze bbox / viewBox ────────────────────────────────────────────────────
export const fitVB = (b: { x: number; y: number; w: number; h: number }, pad = 8) => `${b.x - pad} ${b.y - pad} ${Math.max(1, b.w) + 2 * pad} ${Math.max(1, b.h) + 2 * pad}`;
export const unionBB = <T,>(arr: T[], bb: (e: T) => { x: number; y: number; w: number; h: number }) => {
  if (!arr.length) return { x: -20, y: -20, w: 40, h: 40 };
  const bs = arr.map(bb); const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
};
// Union dwóch bboxów
export const unionBBox = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => { const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y); return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 }; };

// ── Kształt projektu PCB (z /api/projects/{name}) ─────────────────────────────────
export interface PcbProject {
  project?: string;
  activeSheetId?: string;
  sheets?: { id: string; name: string; desc?: string; elements?: El[]; placed?: PlacedComp[] }[];
  pcb?: { name?: string; elements?: FpEl[]; meta?: FpMeta };
  symbols?: { id: string; name: string; elements?: El[]; meta?: SymMeta }[];
  footprints?: { id: string; name: string; elements?: FpEl[]; meta?: FpMeta }[];
}
