import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogActions, DialogTitle, Button, Box, Tabs, Tab,
  Tooltip, Typography, IconButton,
} from '@mui/material';
import FunctionsIcon from '@mui/icons-material/Functions';
import CloseIcon from '@mui/icons-material/Close';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Znacznik pozycji kursora w snippetach. Po wstawieniu jest usuwany, a kursor
// (lub zaznaczony tekst) ląduje w tym miejscu — dzięki temu np. \frac{▮}{} od razu
// stawia kursor w liczniku, a zaznaczone „x" + \sqrt{▮} daje \sqrt{x}.
const CUR = '\uE000';

interface Sym {
  /** LaTeX renderowany na przycisku (ikona). */
  r: string;
  /** LaTeX wstawiany do edytora (może zawierać znacznik CUR). Domyślnie = r. */
  i?: string;
  /** Podpowiedź (tooltip). */
  t?: string;
}

interface Category { name: string; syms: Sym[]; }

// ── Palety symboli ────────────────────────────────────────────────────────────
const CATEGORIES: Category[] = [
  {
    name: 'Struktura',
    syms: [
      { r: '\\frac{a}{b}', i: `\\frac{${CUR}}{}`, t: 'Ułamek' },
      { r: '\\sqrt{x}', i: `\\sqrt{${CUR}}`, t: 'Pierwiastek' },
      { r: '\\sqrt[n]{x}', i: `\\sqrt[${CUR}]{}`, t: 'Pierwiastek n-tego stopnia' },
      { r: 'x^{2}', i: `^{${CUR}}`, t: 'Indeks górny (potęga)' },
      { r: 'x_{i}', i: `_{${CUR}}`, t: 'Indeks dolny' },
      { r: 'x_{i}^{2}', i: `_{${CUR}}^{}`, t: 'Indeks dolny i górny' },
      { r: '\\overline{x}', i: `\\overline{${CUR}}`, t: 'Kreska nad' },
      { r: '\\underline{x}', i: `\\underline{${CUR}}`, t: 'Kreska pod' },
      { r: '\\left(x\\right)', i: `\\left( ${CUR} \\right)`, t: 'Nawiasy skalowane ( )' },
      { r: '\\left[x\\right]', i: `\\left[ ${CUR} \\right]`, t: 'Nawiasy [ ]' },
      { r: '\\left\\{x\\right\\}', i: `\\left\\{ ${CUR} \\right\\}`, t: 'Nawiasy { }' },
      { r: '\\left|x\\right|', i: `\\left| ${CUR} \\right|`, t: 'Wartość bezwzględna' },
      { r: '\\binom{n}{k}', i: `\\binom{${CUR}}{}`, t: 'Symbol Newtona' },
    ],
  },
  {
    name: 'Duże operatory',
    syms: [
      { r: '\\sum_{i=1}^{n}', i: `\\sum_{${CUR}}^{}`, t: 'Suma' },
      { r: '\\prod_{i=1}^{n}', i: `\\prod_{${CUR}}^{}`, t: 'Iloczyn' },
      { r: '\\int_{a}^{b}', i: `\\int_{${CUR}}^{}`, t: 'Całka' },
      { r: '\\iint', i: `\\iint ${CUR}`, t: 'Całka podwójna' },
      { r: '\\iiint', i: `\\iiint ${CUR}`, t: 'Całka potrójna' },
      { r: '\\oint', i: `\\oint ${CUR}`, t: 'Całka po konturze' },
      { r: '\\lim_{x\\to0}', i: `\\lim_{${CUR} \\to }`, t: 'Granica' },
      { r: '\\bigcup', i: `\\bigcup_{${CUR}}`, t: 'Suma mnogościowa' },
      { r: '\\bigcap', i: `\\bigcap_{${CUR}}`, t: 'Iloczyn mnogościowy' },
      { r: '\\partial', t: 'Pochodna cząstkowa' },
      { r: '\\nabla', t: 'Nabla / gradient' },
      { r: '\\infty', t: 'Nieskończoność' },
    ],
  },
  {
    name: 'Greckie α',
    syms: [
      { r: '\\alpha' }, { r: '\\beta' }, { r: '\\gamma' }, { r: '\\delta' },
      { r: '\\epsilon' }, { r: '\\varepsilon' }, { r: '\\zeta' }, { r: '\\eta' },
      { r: '\\theta' }, { r: '\\vartheta' }, { r: '\\iota' }, { r: '\\kappa' },
      { r: '\\lambda' }, { r: '\\mu' }, { r: '\\nu' }, { r: '\\xi' },
      { r: '\\pi' }, { r: '\\rho' }, { r: '\\sigma' }, { r: '\\tau' },
      { r: '\\upsilon' }, { r: '\\phi' }, { r: '\\varphi' }, { r: '\\chi' },
      { r: '\\psi' }, { r: '\\omega' },
    ],
  },
  {
    name: 'Greckie Δ',
    syms: [
      { r: '\\Gamma' }, { r: '\\Delta', t: 'Delta (trójkąt)' }, { r: '\\Theta' },
      { r: '\\Lambda' }, { r: '\\Xi' }, { r: '\\Pi' }, { r: '\\Sigma' },
      { r: '\\Upsilon' }, { r: '\\Phi' }, { r: '\\Psi' }, { r: '\\Omega' },
      { r: '\\aleph' }, { r: '\\hbar', t: 'Stała Plancka' }, { r: '\\ell' },
    ],
  },
  {
    name: 'Operatory',
    syms: [
      { r: '\\pm' }, { r: '\\mp' }, { r: '\\times' }, { r: '\\div' },
      { r: '\\cdot' }, { r: '\\ast' }, { r: '\\star' }, { r: '\\circ' },
      { r: '\\bullet' }, { r: '\\oplus' }, { r: '\\ominus' }, { r: '\\otimes' },
      { r: '\\odot' }, { r: '\\wedge' }, { r: '\\vee' }, { r: '\\setminus' },
      { r: '\\sqrt{\\,}', i: `\\sqrt{${CUR}}`, t: 'Pierwiastek' }, { r: '\\%', i: '\\%' },
      { r: '\\prime', i: `'` }, { r: '\\degree', i: '^{\\circ}', t: 'Stopień' },
    ],
  },
  {
    name: 'Relacje',
    syms: [
      { r: '=' }, { r: '\\neq' }, { r: '\\approx' }, { r: '\\equiv' },
      { r: '\\cong' }, { r: '\\sim' }, { r: '\\simeq' }, { r: '\\propto' },
      { r: '\\leq' }, { r: '\\geq' }, { r: '\\ll' }, { r: '\\gg' },
      { r: '\\prec' }, { r: '\\succ' }, { r: '\\doteq' }, { r: '\\triangleq' },
    ],
  },
  {
    name: 'Strzałki',
    syms: [
      { r: '\\to' }, { r: '\\gets' }, { r: '\\leftrightarrow' },
      { r: '\\Rightarrow' }, { r: '\\Leftarrow' }, { r: '\\Leftrightarrow' },
      { r: '\\mapsto' }, { r: '\\longrightarrow' }, { r: '\\longleftarrow' },
      { r: '\\uparrow' }, { r: '\\downarrow' }, { r: '\\updownarrow' },
      { r: '\\nearrow' }, { r: '\\searrow' }, { r: '\\rightleftharpoons' },
    ],
  },
  {
    name: 'Zbiory i logika',
    syms: [
      { r: '\\in' }, { r: '\\notin' }, { r: '\\ni' }, { r: '\\subset' },
      { r: '\\subseteq' }, { r: '\\supset' }, { r: '\\supseteq' }, { r: '\\cup' },
      { r: '\\cap' }, { r: '\\emptyset' }, { r: '\\varnothing' },
      { r: '\\forall' }, { r: '\\exists' }, { r: '\\nexists' }, { r: '\\neg' },
      { r: '\\land' }, { r: '\\lor' }, { r: '\\implies' }, { r: '\\iff' },
      { r: '\\mathbb{R}', i: '\\mathbb{R}', t: 'Liczby rzeczywiste' },
      { r: '\\mathbb{Z}', i: '\\mathbb{Z}' }, { r: '\\mathbb{N}', i: '\\mathbb{N}' },
      { r: '\\mathbb{Q}', i: '\\mathbb{Q}' }, { r: '\\mathbb{C}', i: '\\mathbb{C}' },
    ],
  },
  {
    name: 'Fizyka',
    syms: [
      { r: '\\vec{v}', i: `\\vec{${CUR}}`, t: 'Wektor' },
      { r: '\\hat{n}', i: `\\hat{${CUR}}`, t: 'Wersor / operator' },
      { r: '\\dot{x}', i: `\\dot{${CUR}}`, t: 'Pochodna po czasie' },
      { r: '\\ddot{x}', i: `\\ddot{${CUR}}`, t: 'Druga pochodna po czasie' },
      { r: '\\nabla', t: 'Gradient' },
      { r: '\\nabla\\cdot', i: '\\nabla\\cdot ', t: 'Dywergencja' },
      { r: '\\nabla\\times', i: '\\nabla\\times ', t: 'Rotacja' },
      { r: '\\partial', t: 'Pochodna cząstkowa' },
      { r: '\\Delta', t: 'Delta / laplasjan' },
      { r: '\\hbar' }, { r: '\\propto' }, { r: '^{\\circ}\\!C', i: '^{\\circ}C', t: 'Stopnie Celsjusza' },
      { r: '\\langle\\psi|', i: `\\langle ${CUR} |`, t: 'Bra' },
      { r: '|\\psi\\rangle', i: `| ${CUR} \\rangle`, t: 'Ket' },
      { r: '\\times10^{n}', i: `\\times 10^{${CUR}}`, t: 'Notacja naukowa' },
    ],
  },
  {
    name: 'Funkcje',
    syms: [
      { r: '\\sin' }, { r: '\\cos' }, { r: '\\tan' }, { r: '\\cot' },
      { r: '\\arcsin' }, { r: '\\arccos' }, { r: '\\arctan' },
      { r: '\\sinh' }, { r: '\\cosh' }, { r: '\\tanh' },
      { r: '\\log' }, { r: '\\ln' }, { r: '\\lg' }, { r: '\\exp' },
      { r: '\\min' }, { r: '\\max' }, { r: '\\gcd' }, { r: '\\det' },
      { r: '\\dim' }, { r: '\\deg' }, { r: '\\bmod', i: ' \\bmod ' },
    ],
  },
  {
    name: 'Akcenty',
    syms: [
      { r: '\\bar{x}', i: `\\bar{${CUR}}` }, { r: '\\tilde{x}', i: `\\tilde{${CUR}}` },
      { r: '\\hat{x}', i: `\\hat{${CUR}}` }, { r: '\\widehat{xy}', i: `\\widehat{${CUR}}` },
      { r: '\\widetilde{xy}', i: `\\widetilde{${CUR}}` },
      { r: '\\vec{x}', i: `\\vec{${CUR}}` },
      { r: '\\overrightarrow{AB}', i: `\\overrightarrow{${CUR}}` },
      { r: '\\overleftarrow{AB}', i: `\\overleftarrow{${CUR}}` },
      { r: '\\overline{x}', i: `\\overline{${CUR}}` },
      { r: '\\underline{x}', i: `\\underline{${CUR}}` },
      { r: '\\overbrace{x}', i: `\\overbrace{${CUR}}^{}` },
      { r: '\\underbrace{x}', i: `\\underbrace{${CUR}}_{}` },
    ],
  },
  {
    name: 'Macierze',
    syms: [
      { r: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', i: `\\begin{pmatrix}\n  ${CUR} & \\\\\n   & \n\\end{pmatrix}`, t: 'Macierz ( )' },
      { r: '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}', i: `\\begin{bmatrix}\n  ${CUR} & \\\\\n   & \n\\end{bmatrix}`, t: 'Macierz [ ]' },
      { r: '\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}', i: `\\begin{vmatrix}\n  ${CUR} & \\\\\n   & \n\\end{vmatrix}`, t: 'Wyznacznik' },
      { r: '\\begin{cases}a\\\\b\\end{cases}', i: `\\begin{cases}\n  ${CUR} & \\text{gdy } \\\\\n  0 & \\text{w p.p.}\n\\end{cases}`, t: 'Układ / przypadki' },
      { r: '\\begin{aligned}x&=1\\\\y&=2\\end{aligned}', i: `\\begin{aligned}\n  ${CUR} &= \\\\\n   &= \n\\end{aligned}`, t: 'Wyrównane równania' },
      { r: 'a\\\\b', i: ' \\\\\n', t: 'Nowy wiersz' },
      { r: 'a&b', i: ' & ', t: 'Separator kolumn' },
    ],
  },
];

// Renderuje LaTeX do HTML (na przyciskach palety oraz w podglądzie).
const renderKatex = (latex: string, displayMode: boolean): { html: string; error: string | null } => {
  try {
    const html = katex.renderToString(latex, { displayMode, throwOnError: true, output: 'html' });
    return { html, error: null };
  } catch (e) {
    // Renderujemy też wersję tolerancyjną (czerwony fragment), ale zwracamy komunikat.
    let html = '';
    try { html = katex.renderToString(latex, { displayMode, throwOnError: false, output: 'html' }); } catch { /* ignore */ }
    return { html, error: (e as Error).message.replace(/^KaTeX parse error:\s*/, '') };
  }
};

const SymButton: React.FC<{ sym: Sym; onInsert: (i: string) => void }> = ({ sym, onInsert }) => {
  const html = useMemo(() => renderKatex(sym.r, false).html, [sym.r]);
  return (
    <Tooltip title={sym.t || sym.i || sym.r} arrow disableInteractive>
      <Box
        component="button"
        onClick={() => onInsert(sym.i ?? sym.r)}
        sx={{
          minWidth: 40, height: 38, px: 0.75, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', cursor: 'pointer',
          fontSize: 15, lineHeight: 1, transition: 'all .12s',
          '&:hover': { bgcolor: 'action.hover', borderColor: '#1976d2', transform: 'translateY(-1px)', boxShadow: 1 },
          '&:active': { transform: 'none' },
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Tooltip>
  );
};

export interface MathEditorDialogProps {
  open: boolean;
  initialLatex: string;
  displayMode: boolean; // true = MathBlock (display), false = inline
  onSave: (latex: string) => void;
  onClose: () => void;
}

export const MathEditorDialog: React.FC<MathEditorDialogProps> = ({ open, initialLatex, displayMode, onSave, onClose }) => {
  const [value, setValue] = useState(initialLatex);
  const [tab, setTab] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) { setValue(initialLatex); setTab(0); } }, [open, initialLatex]);

  // Wstawia snippet w miejscu kursora; jeśli jest zaznaczenie i snippet ma znacznik
  // CUR — owija zaznaczenie (np. zaznacz „x" → \sqrt{x}). Kursor ląduje na CUR.
  const insert = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    const start = ta ? ta.selectionStart : value.length;
    const end = ta ? ta.selectionEnd : value.length;
    const selected = value.slice(start, end);
    const markerIdx = snippet.indexOf(CUR);
    let body: string;
    let caret: number;
    if (markerIdx >= 0) {
      const filled = snippet.slice(0, markerIdx) + selected + snippet.slice(markerIdx + 1);
      body = filled;
      caret = start + markerIdx + selected.length;
    } else {
      body = snippet;
      caret = start + snippet.length;
    }
    const next = value.slice(0, start) + body + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (t) { t.focus(); t.setSelectionRange(caret, caret); }
    });
  }, [value]);

  const preview = useMemo(() => renderKatex(value.trim() || '\\;', displayMode), [value, displayMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(value); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      // Zapobiega przejęciu klawiszy przez ProseMirror pod spodem.
      onKeyDown={(e) => e.stopPropagation()}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5 }}>
        <FunctionsIcon sx={{ color: '#1976d2' }} />
        <Typography sx={{ fontWeight: 700, flex: 1 }}>Edytor równań (LaTeX)</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Podgląd na żywo */}
        <Box sx={{
          minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
          p: 2, borderRadius: 2, bgcolor: '#fafafa', border: '1px solid', borderColor: 'divider', overflowX: 'auto',
        }}>
          {value.trim()
            ? <span dangerouslySetInnerHTML={{ __html: preview.html }} />
            : <Typography sx={{ color: 'text.disabled', fontStyle: 'italic' }}>Podgląd równania…</Typography>}
        </Box>
        {preview.error && (
          <Typography sx={{ fontSize: 12, color: 'error.main', fontFamily: 'monospace', px: 0.5 }}>
            ⚠ {preview.error}
          </Typography>
        )}

        {/* Pole LaTeX */}
        <Box
          component="textarea"
          ref={textareaRef}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          placeholder={'Wpisz LaTeX lub użyj palety poniżej, np. \\frac{a}{b}, \\sum_{i=1}^{n} x_i'}
          sx={{
            width: '100%', minHeight: 90, resize: 'vertical', p: 1.5, borderRadius: 1.5,
            border: '2px solid #1976d2', outline: 'none', bgcolor: 'background.paper',
            fontFamily: "'Fira Code','Monaco','Consolas',monospace", fontSize: 14, lineHeight: 1.6,
          }}
        />

        {/* Palety symboli */}
        <Box>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
            sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: 12.5, py: 0.5 } }}>
            {CATEGORIES.map((c) => <Tab key={c.name} label={c.name} />)}
          </Tabs>
          <Box sx={{
            display: 'flex', flexWrap: 'wrap', gap: 0.75, p: 1, mt: 1, maxHeight: 190, overflowY: 'auto',
            border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: '#fcfcfd',
          }}>
            {CATEGORIES[tab].syms.map((s, i) => <SymButton key={i} sym={s} onInsert={insert} />)}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Ctrl/⌘ + Enter — zapisz · Esc — anuluj</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose}>Anuluj</Button>
          <Button variant="contained" onClick={() => onSave(value)}>Zapisz</Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default MathEditorDialog;
