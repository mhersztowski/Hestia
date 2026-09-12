/**
 * PCB 3D board builder — faithful port of the pure 3D helpers from cad-app's
 * PcbView.tsx (editor is the source of truth), plus a read-only `Pcb3DView`
 * component so the viewer can show a "3dView" tab.
 *
 * Ported verbatim from app/cad-app/src/components/PcbView.tsx. Only edits:
 * inlined color literals for `C`, reused typy/funkcje z ./render (FpEl,
 * PlacedComp, LayerState, EasyEdaSym, defaultLayers, pcbPartBBox, elBBoxFp,
 * unionBB), dropped editor-only interactivity (layer visibility panel), and
 * model3d fetch goes through vfs.readModel3dObj.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { SceneGraph, SimpleViewer } from '../../scene3d';
import {
  type FpEl, type PlacedComp, type LayerState, type EasyEdaSym, type Pt,
  pcbPartBBox, unionBB, elBBoxFp,
} from './render';
import { readModel3dObj } from '../vfs';

// ── Skala świata (mil → mm) ─────────────────────────────────────────────────────
const W2MM = 0.0254;

// ── Generator id FpEl (jak w edytorze: gge + sekwencja) ─────────────────────────
let ggeSeq = 118;
const newId = () => `gge${(ggeSeq += 3)}`;
// Konstruktor pada (odwzorowanie edytorowego mkPad) — do placedFpEls
const mkPad = (x: number, y: number, num: string, shape: string, w: number, h: number, hole: number, layer: string, rot = 0): FpEl => ({ t: 'pad', x, y, shape, w, h, rot, holeShape: 'Okrąg', hole, plated: 'Tak', num, expansion: 2, layer, locked: false, id: newId() });

// ── Numer warstwy EasyEDA → nazwa naszej warstwy (z odbiciem strony) ────────────
const EE_LAYER_NAME: Record<string, string> = { '1': 'Górna warstwa', '2': 'Dolna warstwa', '3': 'Górna warstwa opisowa', '4': 'Dolna warstwa opisowa', '5': 'Górna warstwa maski pasty lutowniczej', '6': 'Dolna warstwa maski pasty lutowniczej', '7': 'Górna warstwa maski lutowniczej', '8': 'Dolna warstwa maski lutowniczej', '10': 'Obrys płyty', '11': 'Wielowastwa', '12': 'Dokument', '13': 'Górny montaż', '14': 'Dolny montaż', '100': 'Wielowastwa' };
const EE_FLIP: Record<string, string> = { '1': '2', '2': '1', '3': '4', '4': '3', '5': '6', '6': '5', '7': '8', '8': '7', '13': '14', '14': '13' };
function eeNameFlip(layerNum: string, flip: boolean): string {
  const ln = flip && EE_FLIP[layerNum] ? EE_FLIP[layerNum] : layerNum;
  return EE_LAYER_NAME[ln] || 'Górna warstwa opisowa';
}

// Umieszczony footprint (EasyEDA shapes) → elementy FpEl w układzie świata (mil).
// Odwzorowuje transformację renderPcbPart/renderFootprint: wyśrodkowanie, skala ×4,
// obrót komponentu i lustro + zamiana warstw dla strony dolnej.
// Odbicie nazwy warstwy góra↔dół (footprint na dolnej stronie płytki).
const OUR_LAYER_FLIP: Record<string, string> = {
  'Górna warstwa': 'Dolna warstwa', 'Dolna warstwa': 'Górna warstwa',
  'Górna warstwa opisowa': 'Dolna warstwa opisowa', 'Dolna warstwa opisowa': 'Górna warstwa opisowa',
  'Górna warstwa maski lutowniczej': 'Dolna warstwa maski lutowniczej', 'Dolna warstwa maski lutowniczej': 'Górna warstwa maski lutowniczej',
  'Górna warstwa maski pasty lutowniczej': 'Dolna warstwa maski pasty lutowniczej', 'Dolna warstwa maski pasty lutowniczej': 'Górna warstwa maski pasty lutowniczej',
  'Górny montaż': 'Dolny montaż', 'Dolny montaż': 'Górny montaż',
};
const flipOurLayer = (l: string, bottom: boolean) => (bottom && OUR_LAYER_FLIP[l]) ? OUR_LAYER_FLIP[l] : l;

// Umieszczony footprint z Work Space (własne FpEl) → elementy FpEl w układzie świata (mil).
function placedWsFpEls(comp: PlacedComp): FpEl[] {
  const els = comp.fpEls; if (!els || !els.length) return [];
  const bb = unionBB(els, elBBoxFp);
  const ccx = bb.x + bb.w / 2, ccy = bb.y + bb.h / 2;
  const bottom = comp.layer === 'Dolna warstwa';
  const rad = ((comp.rotation || 0) * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const ortho = Math.abs(sin) > Math.abs(cos);
  const px = comp.pcbX ?? comp.x, py = comp.pcbY ?? comp.y;
  const rotAdd = comp.rotation || 0;
  const q = (sx: number, sy: number): Pt => { let x = sx - ccx; const y = sy - ccy; if (bottom) x = -x; return { x: px + (x * cos - y * sin), y: py + (x * sin + y * cos) }; };
  const L = (l: string) => flipOurLayer(l, bottom);
  const out: FpEl[] = [];
  const tr = (el: FpEl): void => {
    switch (el.t) {
      case 'track': case 'copper': case 'fill': out.push({ ...el, pts: el.pts.map((p) => q(p.x, p.y)), layer: L(el.layer), id: newId() }); break;
      case 'pad': { const p = q(el.x, el.y); let w = el.w, h = el.h; if (ortho) { const t = w; w = h; h = t; } out.push({ ...el, x: p.x, y: p.y, w, h, rot: (el.rot || 0) + rotAdd, layer: L(el.layer), id: newId() }); break; }
      case 'via': case 'hole': { const p = q(el.x, el.y); out.push({ ...el, x: p.x, y: p.y, id: newId() }); break; }
      case 'fcircle': case 'arc': { const p = q(el.cx, el.cy); out.push({ ...el, cx: p.x, cy: p.y, layer: L(el.layer), id: newId() }); break; }
      case 'ftext': { const p = q(el.x, el.y); out.push({ ...el, x: p.x, y: p.y, rot: (el.rot || 0) + rotAdd, layer: L(el.layer), id: newId() }); break; }
      case 'frect': { const p = q(el.x + el.w / 2, el.y + el.h / 2); let w = el.w, h = el.h; if (ortho) { const t = w; w = h; h = t; } out.push({ ...el, x: p.x - w / 2, y: p.y - h / 2, w, h, layer: L(el.layer), id: newId() }); break; }
      case 'dimension': { const a = q(el.x1, el.y1), b = q(el.x2, el.y2); out.push({ ...el, x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer: L(el.layer), id: newId() }); break; }
      case 'group': el.children.forEach(tr); break;
      default: break;
    }
  };
  els.forEach(tr);
  return out;
}

function placedFpEls(comp: PlacedComp): FpEl[] {
  const fp = comp.fp;
  if (!fp) return placedWsFpEls(comp);
  const SC = 4;
  const cx = fp.bbox ? fp.bbox.x + fp.bbox.width / 2 : 0;
  const cy = fp.bbox ? fp.bbox.y + fp.bbox.height / 2 : 0;
  const bottom = comp.layer === 'Dolna warstwa';
  const rad = ((comp.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const ortho = Math.abs(sin) > Math.abs(cos); // obrót ~90/270° → zamiana wymiarów prostokątów
  const px = comp.pcbX ?? comp.x, py = comp.pcbY ?? comp.y; // pozycja footprintu na PCB
  const tp = (sx: number, sy: number): Pt => {
    let x = (sx - cx) * SC; const y = (sy - cy) * SC;
    if (bottom) x = -x;
    return { x: px + (x * cos - y * sin), y: py + (x * sin + y * cos) };
  };
  const out: FpEl[] = [];
  fp.shapes.forEach((s) => {
    const t = s.split('~');
    switch (t[0]) {
      case 'PAD': {
        const shape = /RECT/i.test(t[1]) ? 'Prostokąt' : /OVAL/i.test(t[1]) ? 'Owal' : 'Okrąg';
        const p = tp(+t[2], +t[3]);
        let w = (+t[4] || 0) * SC, h = (+t[5] || 0) * SC;
        if (ortho) { const tmp = w; w = h; h = tmp; }
        out.push(mkPad(p.x, p.y, t[8] || '', shape, w, h, (+t[9] || 0) * 2 * SC, eeNameFlip(t[6] || '11', bottom), comp.rotation || 0));
        break;
      }
      case 'TRACK': {
        const nums = (t[4] || '').trim().split(/[\s,]+/).map(Number);
        const pts: Pt[] = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push(tp(nums[i], nums[i + 1]));
        if (pts.length >= 2) out.push({ t: 'track', pts, width: Math.max(1, (+t[1] || 0.6) * SC), layer: eeNameFlip(t[2] || '3', bottom), locked: false, id: newId() });
        break;
      }
      case 'CIRCLE': {
        const c = tp(+t[1], +t[2]);
        out.push({ t: 'fcircle', cx: c.x, cy: c.y, r: (+t[3] || 0) * SC, width: Math.max(1, (+t[4] || 0.3) * SC), layer: eeNameFlip(t[5] || '3', bottom), locked: false, id: newId() });
        break;
      }
      default: break; // ARC (ścieżka), SOLIDREGION, TEXT — pomijane
    }
  });
  return out;
}

// ── Model 3D płytki (podgląd Scene3D) ──────────────────────────────────────────
const BOARD_THICK_MM = 1.6, CU_THICK_MM = 0.05, BODY_H_MM = 1.2;
const PCB_GREEN = '#0e7d3a'; // klasyczny kolor laminatu PCB (soldermask) — podłoże zawsze zielone
// Wiersze panelu warstw 3D (klucz widoczności + etykieta + nazwa warstwy PCB do koloru + kolor zapasowy)
const BOARD_ROWS: { key: string; label: string; layerName?: string; fallback: string }[] = [
  { key: 'board', label: 'Podłoże (obrys)', fallback: PCB_GREEN },
  { key: 'cu-top', label: 'Górna warstwa (miedź)', layerName: 'Górna warstwa', fallback: '#c9a227' },
  { key: 'cu-bot', label: 'Dolna warstwa (miedź)', layerName: 'Dolna warstwa', fallback: '#c9a227' },
  { key: 'cu-multi', label: 'Wielowarstwa / przeloty', layerName: 'Wielowastwa', fallback: '#c9a227' },
  { key: 'silk-top', label: 'Górna opisowa', layerName: 'Górna warstwa opisowa', fallback: '#f2f2f2' },
  { key: 'silk-bot', label: 'Dolna opisowa', layerName: 'Dolna warstwa opisowa', fallback: '#f2f2f2' },
  { key: 'body-top', label: 'Komponenty (góra)', fallback: '#2b2f36' },
  { key: 'body-bot', label: 'Komponenty (dół)', fallback: '#2b2f36' },
];
// Nazwa warstwy PCB → klucz wiersza panelu 3D
function rowKeyOfLayer(layer: string): string | null {
  switch (layer) {
    case 'Górna warstwa': return 'cu-top';
    case 'Dolna warstwa': return 'cu-bot';
    case 'Wielowastwa': return 'cu-multi';
    case 'Górna warstwa opisowa': return 'silk-top';
    case 'Dolna warstwa opisowa': return 'silk-bot';
    default: return null;
  }
}
// Wysokość bazowa (z, mm) plate wg klucza wiersza
function rowZ(key: string): number {
  switch (key) {
    case 'cu-top': case 'cu-multi': return BOARD_THICK_MM;
    case 'cu-bot': return -CU_THICK_MM;
    case 'silk-top': return BOARD_THICK_MM + CU_THICK_MM;
    case 'silk-bot': return -CU_THICK_MM * 2;
    default: return BOARD_THICK_MM;
  }
}
function board3dBounds(els: FpEl[]): { minx: number; miny: number; maxx: number; maxy: number } {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const acc = (x: number, y: number) => { if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y; };
  for (const e of els) {
    if (e.t === 'frect') { acc(e.x, e.y); acc(e.x + e.w, e.y + e.h); }
    else if (e.t === 'fcircle') { acc(e.cx - e.r, e.cy - e.r); acc(e.cx + e.r, e.cy + e.r); }
    else if (e.t === 'track' || e.t === 'copper' || e.t === 'fill') { for (const p of e.pts) acc(p.x, p.y); }
    else if (e.t === 'pad') { acc(e.x - e.w, e.y - e.h); acc(e.x + e.w, e.y + e.h); }
    else if (e.t === 'arc') { acc(e.cx - e.r, e.cy - e.r); acc(e.cx + e.r, e.cy + e.r); }
  }
  if (minx === Infinity) { minx = miny = 0; maxx = maxy = 1000; }
  return { minx, miny, maxx, maxy };
}
// Wiersze warstw obecne w danej płytce (do panelu widoczności) z kolorem z warstw PCB
export function boardLayerRows(pcbEls: FpEl[], placed: PlacedComp[], layers?: LayerState): { key: string; label: string; color: string }[] {
  const present = new Set<string>(['board']);
  const allEls = [...pcbEls, ...placed.flatMap(placedFpEls)];
  for (const e of allEls) { if ('layer' in e) { const k = rowKeyOfLayer(e.layer); if (k) present.add(k); } }
  for (const c of placed) { if (c.fp || (c.fpEls && c.fpEls.length)) present.add(c.layer === 'Dolna warstwa' ? 'body-bot' : 'body-top'); }
  return BOARD_ROWS.filter((r) => present.has(r.key)).map((r) => ({ key: r.key, label: r.label, color: (r.layerName && layers?.[r.layerName]?.color) || r.fallback }));
}

// ── Modele 3D EasyEDA ────────────────────────────────────────────────────────
// uuid + transformacja modelu są zapisane w footprincie EasyEDA jako `SVGNODE~{json}`
// (attrs.uuid + c_origin/c_rotation/z). Surowy .obj pobieramy z /api/easyeda/model3d/{uuid}.
export interface Model3dInfo { uuid: string; ox: number; oy: number; z: number; rx: number; ry: number; rz: number }
export function parseFp3dModel(fp?: EasyEdaSym): Model3dInfo | null {
  if (!fp?.shapes) return null;
  for (const s of fp.shapes) {
    if (!s.startsWith('SVGNODE')) continue;
    try {
      const node = JSON.parse(s.slice(s.indexOf('~') + 1)) as { attrs?: Record<string, string> };
      const a = node.attrs ?? {};
      if (!a.uuid) continue;
      const [ox, oy] = String(a.c_origin ?? '0,0').split(',').map(Number);
      const [rx, ry, rz] = String(a.c_rotation ?? '0,0,0').split(',').map(Number);
      return { uuid: a.uuid, ox: ox || 0, oy: oy || 0, z: Number(a.z ?? 0) || 0, rx: rx || 0, ry: ry || 0, rz: rz || 0 };
    } catch { /* pomiń wadliwy węzeł */ }
  }
  return null;
}
const deg = (d: number) => (d * Math.PI) / 180;

// THREE.Group modelu płytki: podłoże z otworami (ExtrudeGeometry) + miedź/silk (pady/ścieżki) + obudowy komponentów.
// Jednostki mm, wyśrodkowane w (0,0); kolory z warstw PCB; `hidden` ukrywa wiersze wg klucza.
export function buildBoardGroup(pcbEls: FpEl[], placed: PlacedComp[], layers?: LayerState, hidden?: Set<string>, compModels?: Map<string, { group: THREE.Group; m3d: Model3dInfo }>): THREE.Group {
  const g = new THREE.Group();
  const allEls = [...pcbEls, ...placed.flatMap(placedFpEls)];
  const outline = pcbEls.filter((e) => (e.t === 'frect' || e.t === 'fcircle') && e.layer === 'Obrys płyty');
  const b = board3dBounds(outline.length ? outline : allEls);
  const cxw = (b.minx + b.maxx) / 2, cyw = (b.miny + b.maxy) / 2;
  const X = (x: number) => (x - cxw) * W2MM, Y = (y: number) => -(y - cyw) * W2MM; // świat(mil)→mm, oś Y w górę
  const isHidden = (key: string) => hidden?.has(key) ?? false;
  const col = (name: string | undefined, fallback: string) => (name && layers?.[name]?.color) || fallback;
  const colorByKey = (key: string): string => { const r = BOARD_ROWS.find((x) => x.key === key); return r ? col(r.layerName, r.fallback) : '#c9a227'; };
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  // Materiał z silną emisją własnego koloru → warstwy są czytelne i „świecą" niezależnie od oświetlenia sceny.
  const matFor = (hex: string, kind: 'cu' | 'silk' | 'sub' | 'body') => {
    const ck = kind + hex; let m = matCache.get(ck);
    if (!m) {
      const c = new THREE.Color(hex);
      const emI = kind === 'sub' ? 0.4 : kind === 'body' ? 0.6 : 0.9; // ~pełna emisja dla warstw, mniejsza dla podłoża/obudów
      m = new THREE.MeshStandardMaterial({ color: c, emissive: c.clone(), emissiveIntensity: emI, roughness: kind === 'cu' ? 0.4 : kind === 'body' ? 0.55 : 0.8, metalness: kind === 'cu' ? 0.5 : 0.1, side: THREE.DoubleSide });
      matCache.set(ck, m);
    }
    return m;
  };
  // Globalne oświetlenie sceny (ambient + 2 kierunkowe) — dokładane do modelu, by dodać delikatne cieniowanie brył.
  g.add(new THREE.AmbientLight(0xffffff, 0.75));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.6); keyLight.position.set(0.5, 1, 2); g.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3); fillLight.position.set(-1, -0.6, 1); g.add(fillLight);
  // Otwory (wiercenie) — pady przelotowe, vias, otwory montażowe
  const drills: { x: number; y: number; r: number }[] = [];
  for (const e of allEls) {
    if (e.t === 'pad' && e.hole > 0) drills.push({ x: e.x, y: e.y, r: e.hole / 2 });
    else if (e.t === 'via') drills.push({ x: e.x, y: e.y, r: e.holeW / 2 });
    else if (e.t === 'hole') drills.push({ x: e.x, y: e.y, r: e.hole / 2 });
  }
  // Podłoże jako ExtrudeGeometry z realnymi dziurami
  const circ = outline.find((e) => e.t === 'fcircle') as (FpEl & { t: 'fcircle' }) | undefined;
  if (!isHidden('board')) {
    const shape = new THREE.Shape();
    if (circ) shape.absarc(X(circ.cx), Y(circ.cy), circ.r * W2MM, 0, Math.PI * 2, false);
    else {
      const xs = [X(b.minx), X(b.maxx)], ys = [Y(b.miny), Y(b.maxy)];
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      shape.moveTo(x0, y0); shape.lineTo(x1, y0); shape.lineTo(x1, y1); shape.lineTo(x0, y1); shape.lineTo(x0, y0);
    }
    for (const d of drills) { const path = new THREE.Path(); path.absarc(X(d.x), Y(d.y), Math.max(d.r * W2MM, 0.05), 0, Math.PI * 2, true); shape.holes.push(path); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: BOARD_THICK_MM, bevelEnabled: false, curveSegments: 24 });
    g.add(new THREE.Mesh(geo, matFor(colorByKey('board'), 'sub'))); // podłoże zielone; już w z ∈ [0, thick]
  }
  // Miedź / silk (pady, ścieżki, okręgi)
  for (const e of allEls) {
    if ((e.t === 'frect' || e.t === 'fcircle') && e.layer === 'Obrys płyty') continue;
    if (e.t === 'pad') {
      const key = rowKeyOfLayer(e.layer) ?? 'cu-top';
      if (isHidden(key)) continue;
      const c = colorByKey(key);
      const w = Math.max(e.w * W2MM, 0.05), h = Math.max(e.h * W2MM, 0.05);
      const round = e.shape === 'Okrąg' || e.shape === 'Owal';
      if (e.hole > 0) { // przelotowy → pierścień miedzi na górze i dole (otwór widoczny na wylot)
        const drillR = Math.max(e.hole / 2 * W2MM, 0.05), outR = Math.max(Math.max(w, h) / 2, drillR + 0.12);
        const ringGeo = new THREE.RingGeometry(drillR, outR, round ? 28 : 4);
        for (const zc of [BOARD_THICK_MM + CU_THICK_MM / 2, -CU_THICK_MM / 2]) { const ring = new THREE.Mesh(ringGeo, matFor(c, 'cu')); ring.position.set(X(e.x), Y(e.y), zc); g.add(ring); }
        continue;
      }
      const z = rowZ(key);
      const m = round
        ? (() => { const cy = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, CU_THICK_MM, 20), matFor(c, 'cu')); cy.rotation.x = Math.PI / 2; return cy; })()
        : new THREE.Mesh(new THREE.BoxGeometry(w, h, CU_THICK_MM), matFor(c, 'cu'));
      m.position.set(X(e.x), Y(e.y), z + CU_THICK_MM / 2);
      g.add(m);
      continue;
    }
    const key = 'layer' in e ? rowKeyOfLayer(e.layer) : null;
    if (!key || isHidden(key)) continue;
    const c = colorByKey(key), z = rowZ(key), kind: 'cu' | 'silk' = key.startsWith('cu') ? 'cu' : 'silk';
    if (e.t === 'track' || e.t === 'copper') {
      const wmm = Math.max(('width' in e ? e.width : 8) * W2MM, 0.05);
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const ax = X(e.pts[i].x), ay = Y(e.pts[i].y), bx = X(e.pts[i + 1].x), by = Y(e.pts[i + 1].y);
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
        if (len < 1e-4) continue;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len, wmm, CU_THICK_MM), matFor(c, kind));
        seg.position.set((ax + bx) / 2, (ay + by) / 2, z + CU_THICK_MM / 2);
        seg.rotation.z = Math.atan2(dy, dx);
        g.add(seg);
      }
    } else if (e.t === 'fcircle') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(e.r * W2MM, 0.05), Math.max(e.width * W2MM / 2, 0.04), 6, 40), matFor(c, kind));
      ring.position.set(X(e.cx), Y(e.cy), z + CU_THICK_MM / 2); g.add(ring);
    } else if (e.t === 'frect') {
      const w = Math.max(Math.abs(e.w) * W2MM, 0.05), h = Math.max(Math.abs(e.h) * W2MM, 0.05);
      const rcx = X(e.x + e.w / 2), rcy = Y(e.y + e.h / 2), zc = z + CU_THICK_MM / 2;
      if (e.fill === 'Nie' || e.fill === '') {
        const t = Math.max((e.width || 6) * W2MM, 0.06);
        const bars: [number, number, number, number][] = [[w, t, 0, h / 2], [w, t, 0, -h / 2], [t, h, w / 2, 0], [t, h, -w / 2, 0]];
        for (const [bw, bh, ox, oy] of bars) { const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, CU_THICK_MM), matFor(c, kind)); bar.position.set(rcx + ox, rcy + oy, zc); g.add(bar); }
      } else {
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, CU_THICK_MM), matFor(c, kind));
        box.position.set(rcx, rcy, zc); g.add(box);
      }
    } else if (e.t === 'fill' && e.pts.length >= 3) {
      const shape = new THREE.Shape();
      shape.moveTo(X(e.pts[0].x), Y(e.pts[0].y));
      for (let i = 1; i < e.pts.length; i++) shape.lineTo(X(e.pts[i].x), Y(e.pts[i].y));
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), matFor(c, kind));
      mesh.position.z = z + CU_THICK_MM / 2; g.add(mesh);
    }
  }
  // Obudowy komponentów — realny model 3D EasyEDA jeśli załadowany, inaczej uproszczona bryła z bbox.
  for (const c of placed) {
    if (!c.fp && !(c.fpEls && c.fpEls.length)) continue;
    const bottom = c.layer === 'Dolna warstwa', key = bottom ? 'body-bot' : 'body-top';
    if (isHidden(key)) continue;
    const bb = pcbPartBBox(c);
    const cx = X(bb.x + bb.w / 2), cy = Y(bb.y + bb.h / 2);
    const entry = compModels?.get(c.id);
    if (entry) {
      // Model 3D: obrót własny (c_rotation EasyEDA) + obrót footprintu (Z) + lustro dolnej strony;
      // wyśrodkowany na footprincie w XY i posadzony na powierzchni płytki w Z.
      const obj = entry.group.clone(true);
      obj.rotation.set(deg(entry.m3d.rx), deg(entry.m3d.ry), deg(entry.m3d.rz));
      // Auto-skala: model .obj EasyEDA jest w realnych mm, footprint renderowany jest w skali SC=4
      // (~40% realu). Dopasowujemy rzut XY modelu (po c_rotation baza leży na płytce) do footprintu;
      // skala jednorodna zachowuje proporcje. Zabezpieczenie przed rozdmuchaniem przy złej orientacji.
      obj.updateMatrixWorld(true);
      const mb = new THREE.Box3().setFromObject(obj);
      const mW = mb.max.x - mb.min.x, mH = mb.max.y - mb.min.y, mZ = mb.max.z - mb.min.z;
      const mDiag = Math.hypot(mW, mH);
      const fpDiag = Math.hypot(Math.max(bb.w * W2MM, 0.2), Math.max(bb.h * W2MM, 0.2));
      if (mDiag > 1e-4 && Number.isFinite(mDiag)) {
        let s = fpDiag / mDiag;
        const maxDim = Math.max(mW, mH, mZ) * s;
        if (maxDim > 4 * fpDiag) s *= (4 * fpDiag) / maxDim;
        if (s > 0 && Number.isFinite(s)) obj.scale.setScalar(s);
      }
      const holder = new THREE.Group();
      holder.add(obj);
      holder.rotation.z = deg(-(c.rotation || 0));
      if (bottom) holder.scale.x = -1;
      holder.updateMatrixWorld(true);
      const bx = new THREE.Box3().setFromObject(holder);
      if (Number.isFinite(bx.min.x)) {
        holder.position.x = cx - (bx.min.x + bx.max.x) / 2;
        holder.position.y = cy - (bx.min.y + bx.max.y) / 2;
        holder.position.z = bottom ? (-CU_THICK_MM - bx.max.z) : (BOARD_THICK_MM - bx.min.z);
      } else {
        holder.position.set(cx, cy, bottom ? -CU_THICK_MM : BOARD_THICK_MM);
      }
      g.add(holder);
      continue;
    }
    const w = Math.max(bb.w * W2MM, 0.3), h = Math.max(bb.h * W2MM, 0.3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, BODY_H_MM), matFor(colorByKey(key), 'body'));
    m.position.set(cx, cy, bottom ? -CU_THICK_MM - BODY_H_MM / 2 : BOARD_THICK_MM + BODY_H_MM / 2);
    g.add(m);
  }
  return g;
}

// ── Read-only podgląd 3D płytki (Scene3D / SimpleViewer) ─────────────────────────
// Bez panelu warstw — wszystkie warstwy widoczne (hidden = pusty Set). Ładuje modele
// 3D EasyEDA asynchronicznie (cache po uuid) i przebudowuje grupę po pobraniu.
// EasyEDA osadza materiały (newmtl/Kd) wewnątrz .obj (niestandardowo) — three OBJLoader tego nie
// czyta, więc modele wychodzą szare. Parsujemy kolory sami i nakładamy per-materiał.
function parseObjMtl(text: string): Map<string, THREE.Color> {
  const map = new Map<string, THREE.Color>();
  let cur: THREE.Color | null = null;
  for (const raw of text.split('\n')) {
    const p = raw.trim().split(/\s+/);
    if (p[0] === 'newmtl') { cur = new THREE.Color(0.6, 0.6, 0.6); map.set(p[1], cur); }
    else if (cur && p[0] === 'Kd') cur.setRGB(+p[1] || 0, +p[2] || 0, +p[3] || 0);
  }
  return map;
}
function applyObjColors(grp: THREE.Group, mtl: Map<string, THREE.Color>): void {
  const mk = (name?: string) => new THREE.MeshStandardMaterial({ color: (name && mtl.get(name)) ? mtl.get(name)!.clone() : new THREE.Color(0x9aa4ad), roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide });
  grp.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh || !mesh.geometry) return;
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
    const cur = mesh.material;
    mesh.material = Array.isArray(cur) ? cur.map((m) => mk((m as THREE.Material).name)) : mk((cur as THREE.Material).name);
  });
}

export function Pcb3DView({ pcbEls, placed, layers }: { pcbEls: FpEl[]; placed: PlacedComp[]; layers?: LayerState }): JSX.Element {
  const hidden = useMemo(() => new Set<string>(), []);

  // Modele 3D EasyEDA: dla komponentów z footprintem zawierającym uuid modelu pobieramy .obj,
  // parsujemy raz (cache po uuid) i podmieniamy uproszczoną bryłę na realny model.
  const modelCacheRef = useRef<Map<string, THREE.Group>>(new Map());
  const [modelsVer, setModelsVer] = useState(0);
  const [loadingModels, setLoadingModels] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const jobs = placed.map((c) => ({ id: c.id, m3d: parseFp3dModel(c.fp) })).filter((j): j is { id: string; m3d: Model3dInfo } => !!j.m3d);
    const uuids = [...new Set(jobs.map((j) => j.m3d.uuid))].filter((u) => !modelCacheRef.current.has(u));
    if (!uuids.length) return;
    setLoadingModels(true);
    (async () => {
      const loader = new OBJLoader();
      await Promise.all(uuids.map(async (uuid) => {
        try {
          const text = await readModel3dObj(uuid);
          const grp = loader.parse(text);
          applyObjColors(grp, parseObjMtl(text)); // kolory z wbudowanych materiałów EasyEDA
          modelCacheRef.current.set(uuid, grp);
        } catch { /* model niedostępny — zostaje uproszczona bryła */ }
      }));
      if (!cancelled) { setModelsVer((v) => v + 1); setLoadingModels(false); }
    })();
    return () => { cancelled = true; };
  }, [placed]);

  // Mapa compId → {załadowany model, transform} — budowana z cache przy każdym rebuildzie.
  const compModels = useMemo(() => {
    const map = new Map<string, { group: THREE.Group; m3d: Model3dInfo }>();
    for (const c of placed) { const m3d = parseFp3dModel(c.fp); if (m3d) { const grp = modelCacheRef.current.get(m3d.uuid); if (grp) map.set(c.id, { group: grp, m3d }); } }
    return map;
  }, [placed, modelsVer]);

  const group = useMemo(() => buildBoardGroup(pcbEls, placed, layers, hidden, compModels), [pcbEls, placed, layers, hidden, compModels]);
  const emptyGraph = useMemo(() => new SceneGraph(), []);
  const fitRef = useRef<(() => void) | null>(null);
  useEffect(() => { const id = setTimeout(() => fitRef.current?.(), 80); return () => clearTimeout(id); }, [group]);

  // loadingModels jest odczytywany, by React nie ostrzegał o nieużywanym stanie;
  // sam podgląd nie renderuje wskaźnika (uproszczony, read-only).
  void loadingModels;

  return (
    <SimpleViewer sceneGraph={emptyGraph} extraObjects={group} autoFit fitSceneRef={fitRef} cameraPreset="cad" backgroundColor="#1a1d21" showGrid={false} style={{ width: '100%', height: '100%' }} />
  );
}
