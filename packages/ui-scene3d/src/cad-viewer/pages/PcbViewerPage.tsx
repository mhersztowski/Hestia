/**
 * Read-only PCB viewer — renders a saved PCB project as inline SVG (+ 3D).
 * URL: /viewer/pcb/{vfsPath}, vfsPath = "{vfsFilePath}/{view}[/{itemId}]".
 *  - view 'project'|'sheet'|'pcb' → tryb projektu: zakładki Sheet / PCB / 3D.
 *  - view 'symbol'|'footprint' + itemId → element + powiązany footprint/symbol.
 * vfsFilePath = ścieżka VFS bez rozszerzenia; projekt czytany z {vfsFilePath}.pcb.json.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, CircularProgress, Typography, Tabs, Tab } from '@mui/material';
import { readPcbProject } from '../vfs';
import { PanZoom } from '../components/PanZoom';
import {
  renderEl, renderFpEl, renderPlaced, renderPcbPart,
  elBBox, elBBoxFp, placedBBox, pcbPartBBox,
  unionBB, unionBBox, fitVB, defaultLayers,
  type PcbProject, type El, type FpEl, type PlacedComp,
} from '../pcb/render';
import { Pcb3DView } from '../pcb/board3d';

interface Props { vfsPath: string }
type View = 'project' | 'sheet' | 'pcb' | 'symbol' | 'footprint';
type Tab3 = 'sheet' | 'pcb' | '3d';

const FALLBACK_VB = '0 0 800 600';
const VIEWS: View[] = ['project', 'sheet', 'pcb', 'symbol', 'footprint'];

interface Pane { bg: string; viewBox: string; svg: ReactNode[] }

/** Panel SVG z pan/zoom. */
function SvgPane({ pane }: { pane: Pane }) {
  return (
    <PanZoom>
      <Box sx={{ width: '100%', height: '100%', '& svg': { display: 'block', width: '100%', height: '100%' } }}>
        <svg viewBox={pane.viewBox} preserveAspectRatio="xMidYMid meet" style={{ background: pane.bg }}>{pane.svg}</svg>
      </Box>
    </PanZoom>
  );
}

// ── budowanie paneli z danych projektu ────────────────────────────────────────
function symbolPane(els: El[]): Pane {
  return { bg: '#ffffff', viewBox: fitVB(unionBB(els, elBBox)), svg: els.map((e, i) => renderEl(e, i)) };
}
function footprintPane(els: FpEl[]): Pane {
  const layers = defaultLayers();
  return { bg: '#111', viewBox: els.length ? fitVB(unionBB(els, elBBoxFp), 30) : FALLBACK_VB, svg: els.map((e, i) => renderFpEl(e, i, false, layers)) };
}
function sheetPane(project: PcbProject, sheetId?: string): Pane {
  const sheets = project.sheets ?? [];
  const sheet = (sheetId ? sheets.find((s) => s.id === sheetId) : undefined)
    ?? (project.activeSheetId ? sheets.find((s) => s.id === project.activeSheetId) : undefined)
    ?? sheets[0];
  const els: El[] = sheet?.elements ?? [];
  const placed: PlacedComp[] = sheet?.placed ?? [];
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  if (els.length) boxes.push(unionBB(els, elBBox));
  if (placed.length) boxes.push(unionBB(placed, placedBBox));
  const bb = boxes.length ? boxes.reduce((a, b) => unionBBox(a, b)) : null;
  return { bg: '#ffffff', viewBox: bb ? fitVB(bb) : FALLBACK_VB, svg: [...els.map((e, i) => renderEl(e, `e${i}`)), ...placed.map((c, i) => renderPlaced(c, `p${i}`))] };
}
function pcbPane(project: PcbProject): Pane {
  const layers = defaultLayers();
  const els: FpEl[] = project.pcb?.elements ?? [];
  const placed: PlacedComp[] = (project.sheets ?? []).flatMap((s) => s.placed ?? []);
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  if (els.length) boxes.push(unionBB(els, elBBoxFp));
  if (placed.length) boxes.push(unionBB(placed, pcbPartBBox));
  const bb = boxes.length ? boxes.reduce((a, b) => unionBBox(a, b)) : null;
  return { bg: '#111', viewBox: bb ? fitVB(bb, 30) : FALLBACK_VB, svg: [...els.map((e, i) => renderFpEl(e, `el${i}`, false, layers)), ...placed.map((c, i) => renderPcbPart(c, `pc${i}`, false, layers))] };
}

export function PcbViewerPage({ vfsPath }: Props) {
  const [project, setProject] = useState<PcbProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { dir, name, view, itemId } = useMemo(() => {
    const parts = vfsPath.split('/').filter(Boolean);
    let v: View = 'project';
    let item: string | undefined;
    let fileSegs = parts;
    if (parts.length >= 2 && VIEWS.includes(parts[parts.length - 2] as View)) {
      v = parts[parts.length - 2] as View; item = parts[parts.length - 1]; fileSegs = parts.slice(0, -2);
    } else if (parts.length >= 1 && VIEWS.includes(parts[parts.length - 1] as View)) {
      v = parts[parts.length - 1] as View; fileSegs = parts.slice(0, -1);
    }
    return { dir: '/' + fileSegs.slice(0, -1).join('/'), name: fileSegs[fileSegs.length - 1] ?? '', view: v, itemId: item };
  }, [vfsPath]);

  // Tryb elementu (symbol/footprint) vs tryb projektu (zakładki).
  const itemMode = view === 'symbol' || view === 'footprint';
  const [tab, setTab] = useState<Tab3>(view === 'pcb' ? 'pcb' : 'sheet');
  useEffect(() => { setTab(view === 'pcb' ? 'pcb' : 'sheet'); }, [view]);

  useEffect(() => {
    if (!name) { setError('Missing project path'); return; }
    let cancelled = false;
    setProject(null); setError(null);
    (async () => {
      try {
        const data = await readPcbProject(dir, name);
        if (!cancelled) setProject(data as PcbProject);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [dir, name]);

  // Tryb elementu: panel główny + panel powiązanego (footprint↔symbol) po nazwie z meta.
  const itemPanes = useMemo((): { label: string; pane: Pane }[] | null => {
    if (!project || !itemMode) return null;
    const out: { label: string; pane: Pane }[] = [];
    if (view === 'symbol') {
      const syms = project.symbols ?? [];
      const sym = (itemId ? syms.find((s) => s.id === itemId) : undefined) ?? syms[0];
      if (sym) out.push({ label: `Symbol: ${sym.name}`, pane: symbolPane(sym.elements ?? []) });
      const fpName = sym?.meta?.footprint;
      const fp = fpName ? (project.footprints ?? []).find((f) => f.name === fpName) : undefined;
      if (fp) out.push({ label: `Footprint: ${fp.name}`, pane: footprintPane(fp.elements ?? []) });
    } else {
      const fps = project.footprints ?? [];
      const fp = (itemId ? fps.find((s) => s.id === itemId) : undefined) ?? fps[0];
      if (fp) out.push({ label: `Footprint: ${fp.name}`, pane: footprintPane(fp.elements ?? []) });
      const symName = fp?.meta?.symbol;
      const sym = symName ? (project.symbols ?? []).find((s) => s.name === symName) : undefined;
      if (sym) out.push({ label: `Symbol: ${sym.name}`, pane: symbolPane(sym.elements ?? []) });
    }
    return out;
  }, [project, itemMode, view, itemId]);

  // Tryb projektu: panel dla aktywnej zakładki 2D (3D renderowane osobno).
  const projectPane = useMemo((): Pane | null => {
    if (!project || itemMode) return null;
    if (tab === 'pcb') return pcbPane(project);
    if (tab === 'sheet') return sheetPane(project, itemId);
    return null; // 3D
  }, [project, itemMode, tab, itemId]);

  const allPlaced = useMemo(() => (project?.sheets ?? []).flatMap((s) => s.placed ?? []), [project]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: '#1a1a1a', color: '#fff' }}>
      {!itemMode && project && (
        <Tabs
          value={tab}
          onChange={(_, v: Tab3) => setTab(v)}
          variant="fullWidth"
          sx={{ minHeight: 34, borderBottom: '1px solid #333', '& .MuiTab-root': { minHeight: 34, py: 0, fontSize: 12, color: '#aeb4bb' }, '& .Mui-selected': { color: '#4fc3f7' } }}
        >
          <Tab value="sheet" label="Sheet" />
          <Tab value="pcb" label="PCB" />
          <Tab value="3d" label="3D" />
        </Tabs>
      )}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {error && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>Failed to load: {error}</Typography>
          </Box>
        )}
        {!error && !project && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={32} /></Box>
        )}
        {/* Tryb elementu: element + powiązany (stos pionowy). */}
        {!error && itemPanes && itemPanes.map((p, i) => (
          <Box key={i} sx={{ flex: 1, minHeight: 0, position: 'relative', borderTop: i ? '1px solid #333' : 'none', display: 'flex', flexDirection: 'column' }}>
            <Typography sx={{ px: 1, py: 0.25, fontSize: 11, fontWeight: 600, color: '#cfd4d9', bgcolor: '#22262b' }}>{p.label}</Typography>
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}><SvgPane pane={p.pane} /></Box>
          </Box>
        ))}
        {/* Tryb projektu: zakładki. */}
        {!error && !itemMode && project && tab === '3d' && (
          <Pcb3DView pcbEls={project.pcb?.elements ?? []} placed={allPlaced} layers={defaultLayers()} />
        )}
        {!error && !itemMode && projectPane && (
          <SvgPane pane={projectPane} />
        )}
      </Box>
    </Box>
  );
}
