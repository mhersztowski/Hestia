/**
 * Visual QObject / QWidget scene builder.
 *
 * Opens as a fullscreen dialog from the Automate Script fullscreen editor.
 * Lets the user compose a QWidget hierarchy by clicking (palette → tree),
 * edit properties of each node, and either:
 *   Mode "code"  — copy/insert a self-contained JS snippet that
 *                  creates + mounts the scene from scratch.
 *   Mode "scene" — apply changes to the LIVE scene via api.scripts.getRoots().
 *
 * No pixel-level drag-canvas (that needs a real Qt host). Instead the builder
 * is tree-based: palette click adds a widget as a child of the selected node,
 * Up/Down buttons reorder siblings, Delete removes a subtree.
 *
 * Live preview: if the QWidget classes are already in globalThis (because the
 * user ran the qt.module.js script), we render a real <qt-canvas> element.
 * Otherwise a "not loaded yet" placeholder is shown.
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import {
  Dialog,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Button,
  Tooltip,
  Divider,
  TextField,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButtonGroup,
  ToggleButton,
  Collapse,
  Chip,
  Snackbar,
  Alert,
} from '@mui/material';
import { type QObjectSceneNode } from './qobjectScene';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CodeIcon from '@mui/icons-material/Code';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';

// ─── Widget catalog ───────────────────────────────────────────────────────────

interface WidgetMeta {
  type: string;
  icon: string;
  desc: string;
}

const WIDGET_CATALOG: Array<{ category: string; widgets: WidgetMeta[] }> = [
  {
    category: 'Layout',
    widgets: [
      { type: 'QVBoxLayout', icon: '⬍', desc: 'Vertical layout' },
      { type: 'QHBoxLayout', icon: '⬌', desc: 'Horizontal layout' },
      { type: 'QGridLayout', icon: '⊞', desc: 'Grid layout' },
      { type: 'QFormLayout', icon: '≡', desc: 'Form layout (label+field)' },
    ],
  },
  {
    category: 'Container',
    widgets: [
      { type: 'QGroupBox', icon: '▣', desc: 'Group box with title' },
      { type: 'QTabWidget', icon: '⊟', desc: 'Tabbed widget' },
      { type: 'QStackedWidget', icon: '⊟', desc: 'Stacked pages' },
      { type: 'QScrollArea', icon: '⬜', desc: 'Scrollable area' },
      { type: 'QFrame', icon: '▢', desc: 'Frame / separator' },
    ],
  },
  {
    category: 'Display',
    widgets: [
      { type: 'QLabel', icon: 'T', desc: 'Text label' },
      { type: 'QProgressBar', icon: '▬', desc: 'Progress bar' },
      { type: 'QListWidget', icon: '≡', desc: 'List of items' },
    ],
  },
  {
    category: 'Input',
    widgets: [
      { type: 'QPushButton', icon: '⊟', desc: 'Push button' },
      { type: 'QToolButton', icon: '⊞', desc: 'Tool button (icon+text)' },
      { type: 'QCheckBox', icon: '☐', desc: 'Check box' },
      { type: 'QRadioButton', icon: '◉', desc: 'Radio button' },
      { type: 'QSlider', icon: '─⊙', desc: 'Slider' },
      { type: 'QScrollBar', icon: '⊺', desc: 'Scroll bar' },
      { type: 'QDial', icon: '◎', desc: 'Dial knob' },
      { type: 'QSpinBox', icon: '#↕', desc: 'Integer spin box' },
      { type: 'QDoubleSpinBox', icon: '#.↕', desc: 'Float spin box' },
      { type: 'QLineEdit', icon: '▭', desc: 'Single-line text input' },
      { type: 'QTextEdit', icon: '▬', desc: 'Multi-line text input' },
      { type: 'QComboBox', icon: '⊟▾', desc: 'Drop-down combo box' },
    ],
  },
  {
    category: 'Advanced',
    widgets: [
      { type: 'QWidget', icon: '▢', desc: 'Generic widget base' },
      { type: 'QInkCanvas', icon: '✏', desc: 'Pressure-sensitive ink canvas' },
    ],
  },
];

// ─── Property definitions ─────────────────────────────────────────────────────

type PropType = 'string' | 'number' | 'boolean' | 'select';

interface PropDef {
  key: string;
  label: string;
  type: PropType;
  default: unknown;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  multiline?: boolean;
}

const WIDGET_PROPS: Record<string, PropDef[]> = {
  QLabel: [
    { key: 'text', label: 'Text', type: 'string', default: 'Label' },
    { key: 'alignment', label: 'Alignment', type: 'select', default: 'Qt.AlignLeft', options: ['Qt.AlignLeft', 'Qt.AlignHCenter', 'Qt.AlignRight', 'Qt.AlignTop', 'Qt.AlignBottom'] },
    { key: 'wordWrap', label: 'Word wrap', type: 'boolean', default: false },
  ],
  QPushButton: [
    { key: 'text', label: 'Text', type: 'string', default: 'Button' },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'checkable', label: 'Checkable', type: 'boolean', default: false },
    { key: 'checked', label: 'Checked', type: 'boolean', default: false },
  ],
  QToolButton: [
    { key: 'text', label: 'Text', type: 'string', default: '' },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'checkable', label: 'Checkable', type: 'boolean', default: false },
    { key: 'checked', label: 'Checked', type: 'boolean', default: false },
  ],
  QCheckBox: [
    { key: 'text', label: 'Text', type: 'string', default: 'Check box' },
    { key: 'checked', label: 'Checked', type: 'boolean', default: false },
    { key: 'tristate', label: 'Tristate', type: 'boolean', default: false },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  QRadioButton: [
    { key: 'text', label: 'Text', type: 'string', default: 'Radio button' },
    { key: 'checked', label: 'Checked', type: 'boolean', default: false },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  QSlider: [
    { key: 'minimum', label: 'Minimum', type: 'number', default: 0, min: 0, max: 9999, step: 1 },
    { key: 'maximum', label: 'Maximum', type: 'number', default: 100, min: 1, max: 99999, step: 1 },
    { key: 'value', label: 'Value', type: 'number', default: 50, min: 0, max: 99999, step: 1 },
    { key: 'orientation', label: 'Orientation', type: 'select', default: 'Qt.Horizontal', options: ['Qt.Horizontal', 'Qt.Vertical'] },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  QScrollBar: [
    { key: 'minimum', label: 'Minimum', type: 'number', default: 0, min: 0, max: 9999, step: 1 },
    { key: 'maximum', label: 'Maximum', type: 'number', default: 100, min: 1, max: 99999, step: 1 },
    { key: 'value', label: 'Value', type: 'number', default: 0, min: 0, max: 99999, step: 1 },
    { key: 'orientation', label: 'Orientation', type: 'select', default: 'Qt.Horizontal', options: ['Qt.Horizontal', 'Qt.Vertical'] },
  ],
  QDial: [
    { key: 'minimum', label: 'Minimum', type: 'number', default: 0, min: 0, max: 9999, step: 1 },
    { key: 'maximum', label: 'Maximum', type: 'number', default: 100, min: 1, max: 99999, step: 1 },
    { key: 'value', label: 'Value', type: 'number', default: 0, min: 0, max: 99999, step: 1 },
    { key: 'notchesVisible', label: 'Notches', type: 'boolean', default: true },
    { key: 'wrapping', label: 'Wrapping', type: 'boolean', default: false },
  ],
  QProgressBar: [
    { key: 'minimum', label: 'Minimum', type: 'number', default: 0, min: 0, max: 9999, step: 1 },
    { key: 'maximum', label: 'Maximum', type: 'number', default: 100, min: 1, max: 99999, step: 1 },
    { key: 'value', label: 'Value', type: 'number', default: 50, min: 0, max: 99999, step: 1 },
    { key: 'orientation', label: 'Orientation', type: 'select', default: 'Qt.Horizontal', options: ['Qt.Horizontal', 'Qt.Vertical'] },
    { key: 'textVisible', label: 'Text visible', type: 'boolean', default: true },
  ],
  QSpinBox: [
    { key: 'minimum', label: 'Minimum', type: 'number', default: 0, min: -99999, max: 99999, step: 1 },
    { key: 'maximum', label: 'Maximum', type: 'number', default: 100, min: -99999, max: 99999, step: 1 },
    { key: 'value', label: 'Value', type: 'number', default: 0, min: -99999, max: 99999, step: 1 },
    { key: 'singleStep', label: 'Step', type: 'number', default: 1, min: 1, max: 1000, step: 1 },
    { key: 'prefix', label: 'Prefix', type: 'string', default: '' },
    { key: 'suffix', label: 'Suffix', type: 'string', default: '' },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  QDoubleSpinBox: [
    { key: 'minimum', label: 'Minimum', type: 'number', default: 0 },
    { key: 'maximum', label: 'Maximum', type: 'number', default: 100 },
    { key: 'value', label: 'Value', type: 'number', default: 0 },
    { key: 'singleStep', label: 'Step', type: 'number', default: 0.1 },
    { key: 'decimals', label: 'Decimals', type: 'number', default: 2, min: 0, max: 10, step: 1 },
    { key: 'prefix', label: 'Prefix', type: 'string', default: '' },
    { key: 'suffix', label: 'Suffix', type: 'string', default: '' },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  QLineEdit: [
    { key: 'text', label: 'Text', type: 'string', default: '' },
    { key: 'placeholderText', label: 'Placeholder', type: 'string', default: '' },
    { key: 'readOnly', label: 'Read only', type: 'boolean', default: false },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  QTextEdit: [
    { key: 'plainText', label: 'Text', type: 'string', default: '', multiline: true },
    { key: 'readOnly', label: 'Read only', type: 'boolean', default: false },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  QGroupBox: [
    { key: 'title', label: 'Title', type: 'string', default: 'Group' },
    { key: 'checkable', label: 'Checkable', type: 'boolean', default: false },
    { key: 'checked', label: 'Checked', type: 'boolean', default: true },
    { key: 'flat', label: 'Flat', type: 'boolean', default: false },
  ],
  QComboBox: [
    { key: 'currentIndex', label: 'Current index', type: 'number', default: 0, min: 0, max: 99, step: 1 },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  QListWidget: [],
  QTabWidget: [
    { key: 'currentIndex', label: 'Current tab', type: 'number', default: 0, min: 0, max: 9, step: 1 },
  ],
  QTabBar: [
    { key: 'currentIndex', label: 'Current tab', type: 'number', default: 0, min: 0, max: 9, step: 1 },
  ],
  QStackedWidget: [
    { key: 'currentIndex', label: 'Current page', type: 'number', default: 0, min: 0, max: 9, step: 1 },
  ],
  QScrollArea: [],
  QFrame: [
    { key: 'frameShape', label: 'Shape', type: 'select', default: 'QFrame.StyledPanel', options: ['QFrame.NoFrame', 'QFrame.Box', 'QFrame.Panel', 'QFrame.StyledPanel', 'QFrame.HLine', 'QFrame.VLine'] },
    { key: 'frameShadow', label: 'Shadow', type: 'select', default: 'QFrame.Raised', options: ['QFrame.Plain', 'QFrame.Raised', 'QFrame.Sunken'] },
  ],
  QVBoxLayout: [
    { key: 'spacing', label: 'Spacing', type: 'number', default: 4, min: 0, max: 40, step: 1 },
  ],
  QHBoxLayout: [
    { key: 'spacing', label: 'Spacing', type: 'number', default: 4, min: 0, max: 40, step: 1 },
  ],
  QGridLayout: [
    { key: 'horizontalSpacing', label: 'H Spacing', type: 'number', default: 4, min: 0, max: 40, step: 1 },
    { key: 'verticalSpacing', label: 'V Spacing', type: 'number', default: 4, min: 0, max: 40, step: 1 },
  ],
  QFormLayout: [
    { key: 'spacing', label: 'Spacing', type: 'number', default: 4, min: 0, max: 40, step: 1 },
  ],
  QWidget: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  QInkCanvas: [
    { key: 'strokeWidth', label: 'Stroke width', type: 'number', default: 2, min: 0.5, max: 20, step: 0.5 },
  ],
};

// ─── Scene node ───────────────────────────────────────────────────────────────

interface SceneNode {
  id: string;
  className: string;
  objectName: string;
  properties: Array<{ key: string; value: unknown }>;
  children: SceneNode[];
  collapsed?: boolean;
}

const LAYOUT_TYPES = new Set([
  'QVBoxLayout', 'QHBoxLayout', 'QGridLayout', 'QFormLayout',
]);
const CONTAINER_TYPES = new Set([
  'QGroupBox', 'QTabWidget', 'QTabBar', 'QStackedWidget',
  'QScrollArea', 'QFrame', 'QWidget',
]);

function canHaveChildren(type: string): boolean {
  return LAYOUT_TYPES.has(type) || CONTAINER_TYPES.has(type);
}

function isLayout(type: string): boolean {
  return LAYOUT_TYPES.has(type);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function defaultObjectName(type: string, counter: number): string {
  return `${lcFirst(type)}_${counter}`;
}

function makeNode(type: string, counter: number): SceneNode {
  const defs = WIDGET_PROPS[type] ?? [];
  return {
    id: uid(),
    className: type,
    objectName: defaultObjectName(type, counter),
    properties: defs.map(d => ({ key: d.key, value: d.default })),
    children: [],
  };
}

// ─── Code generation ──────────────────────────────────────────────────────────

function generateInitCode(roots: SceneNode[]): string {
  if (!roots.length) return '// No widgets in scene — add some first.';
  const lines: string[] = [
    '// ── QObject Scene — generated by Scene Builder ─────────────────────',
    '// Requires: qobject.module.js + qt.module.js (embedded or @library:lit)',
    '',
  ];
  const varNames = new Map<string, string>();

  function varFor(node: SceneNode): string {
    if (!varNames.has(node.id)) {
      varNames.set(node.id, `_${node.objectName}`);
    }
    return varNames.get(node.id)!;
  }

  function emitNode(node: SceneNode): void {
    const v = varFor(node);
    lines.push(`const ${v} = new ${node.className}();`);
    if (node.objectName) lines.push(`${v}.setObjectName('${node.objectName}');`);
    for (const { key, value } of node.properties) {
      if (value === undefined || value === null) continue;
      const defs = WIDGET_PROPS[node.className] ?? [];
      const def = defs.find(d => d.key === key);
      // Skip unmodified defaults to keep code short.
      if (def && value === def.default) continue;
      const setter = `set${ucFirst(key)}`;
      lines.push(`${v}.${setter}(${JSON.stringify(value)});`);
    }
    for (const child of node.children) {
      emitNode(child);
      const cv = varFor(child);
      if (isLayout(node.className)) {
        lines.push(`${v}.addWidget(${cv});`);
      } else if (CONTAINER_TYPES.has(node.className)) {
        if (isLayout(child.className)) {
          lines.push(`${v}.setLayout(${cv});`);
        } else {
          lines.push(`${v}.addWidget(${cv});`);
        }
      }
    }
  }

  for (const root of roots) {
    emitNode(root);
    lines.push('');
  }

  const rootVar = roots.length === 1 ? varFor(roots[0]) : varFor(roots[0]);
  lines.push(
    '// ── Mount to QtCanvas ───────────────────────────────────────────────',
    "const _qtTag = (typeof QtCanvas !== 'undefined' && QtCanvas.__tag) ? QtCanvas.__tag : 'qt-canvas';",
    "const _canvas = document.createElement(_qtTag);",
    "_canvas.style.cssText = 'width:100%;height:420px;display:block;';",
    "display.dom(_canvas);",
    "await new Promise(r => setTimeout(r, 40));",
  );
  if (roots.length === 1) {
    lines.push(`_canvas.setRootWidget(${rootVar});`);
    lines.push(`globalThis.__qscene_roots = [${rootVar}];`);
  } else {
    lines.push('// Multiple roots — pick one:');
    for (const root of roots) {
      lines.push(`// _canvas.setRootWidget(${varFor(root)});`);
    }
    lines.push(`_canvas.setRootWidget(${rootVar});`);
    lines.push(`globalThis.__qscene_roots = [${roots.map(r => varFor(r)).join(', ')}];`);
  }
  return lines.join('\n');
}


function generateModifyCode(roots: SceneNode[]): string {
  if (!roots.length) return '// No widgets in scene — add some first.';
  const lines: string[] = [
    '// ── QObject Scene — Scene Builder (Mode 2: load from QObject panel + override) ──',
    '// Requires: qt.module.js embedded via "Dodaj Bibliotekę" and Scene JSON set in block settings.',
    '',
    '// 1. Build live objects from QObject Scene JSON (api.scripts.getRoots uses scene from panel).',
    'const _roots = api.scripts.getRoots();',
    "if (!_roots.length) {",
    "  api.notify('No scene — embed qt.module.js and set Scene JSON path in block settings (⚙).', 'warning');",
    "  return;",
    "}",
    'const _root = _roots[0];',
    'globalThis.__qscene_roots = _roots;',
    '',
    '// 2. Mount on canvas.',
    "const _qtTag = (typeof QtCanvas !== 'undefined' && QtCanvas.__tag) ? QtCanvas.__tag : 'qt-canvas';",
    "const _canvas = document.createElement(_qtTag);",
    "_canvas.style.cssText = 'width:100%;height:420px;display:block;';",
    'display.dom(_canvas);',
    'await new Promise(r => setTimeout(r, 40));',
    '_canvas.setRootWidget(_root);',
    '',
    '// 3. Apply Scene Builder property overrides.',
  ];

  const seen = new Set<string>();

  function emitModify(node: SceneNode, isRoot: boolean): void {
    const vBase = `_w_${node.objectName || node.className.toLowerCase()}`;
    let v = vBase;
    let suffix = 2;
    while (seen.has(v)) v = `${vBase}_${suffix++}`;
    seen.add(v);

    if (isRoot) {
      lines.push(`const ${v} = _root;`);
    } else {
      lines.push(`const ${v} = _root.findChild?.('${node.objectName}') ?? null;`);
    }
    const props = node.properties.filter(({ value }) => value !== undefined && value !== null);
    if (props.length) {
      lines.push(`if (${v}) {`);
      for (const { key, value } of props) {
        const setter = `set${ucFirst(key)}`;
        lines.push(`  if (typeof ${v}.${setter} === 'function') ${v}.${setter}(${JSON.stringify(value)});`);
      }
      lines.push(`}`);
    }
    for (const child of node.children) {
      if (child.objectName) emitModify(child, false);
    }
  }

  for (const root of roots) {
    emitModify(root, true);
  }
  lines.push('', '_root.update?.();');
  return lines.join('\n');
}

// ─── Live preview (best-effort QtCanvas) ─────────────────────────────────────

function buildLiveNode(node: SceneNode): unknown {
  const g = globalThis as unknown as Record<string, new (...a: unknown[]) => Record<string, unknown>>;
  const Cls = g[node.className];
  if (typeof Cls !== 'function') return null;
  let obj: Record<string, unknown>;
  try { obj = new Cls(); } catch { return null; }

  if (node.objectName && typeof obj['setObjectName'] === 'function') {
    try { (obj['setObjectName'] as (s: string) => void)(node.objectName); } catch { /* ignore */ }
  }
  for (const { key, value } of node.properties) {
    const setter = `set${ucFirst(key)}`;
    if (typeof obj[setter] === 'function') {
      try { (obj[setter] as (v: unknown) => void)(value); } catch { /* ignore */ }
    }
  }
  for (const child of node.children) {
    const childObj = buildLiveNode(child);
    if (!childObj) continue;
    if (isLayout(node.className) && typeof obj['addWidget'] === 'function') {
      try { (obj['addWidget'] as (w: unknown) => void)(childObj); } catch { /* ignore */ }
    } else if (CONTAINER_TYPES.has(node.className)) {
      if (isLayout(child.className) && typeof obj['setLayout'] === 'function') {
        try { (obj['setLayout'] as (l: unknown) => void)(childObj); } catch { /* ignore */ }
      } else if (typeof obj['addWidget'] === 'function') {
        try { (obj['addWidget'] as (w: unknown) => void)(childObj); } catch { /* ignore */ }
      }
    }
  }
  return obj;
}

// ─── Immutable scene helpers ──────────────────────────────────────────────────

function findNode(roots: SceneNode[], id: string): SceneNode | null {
  for (const r of roots) {
    if (r.id === id) return r;
    const found = findNode(r.children, id);
    if (found) return found;
  }
  return null;
}

type ParentInfo = { parent: SceneNode | null; siblings: SceneNode[]; idx: number };

function findParent(roots: SceneNode[], id: string): ParentInfo {
  for (let i = 0; i < roots.length; i++) {
    if (roots[i].id === id) return { parent: null, siblings: roots, idx: i };
    const res = findParentInChildren(roots[i], id);
    if (res) return res;
  }
  return { parent: null, siblings: roots, idx: -1 };
}

function findParentInChildren(node: SceneNode, id: string): ParentInfo | null {
  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i].id === id) {
      return { parent: node, siblings: node.children, idx: i };
    }
    const res = findParentInChildren(node.children[i], id);
    if (res) return res;
  }
  return null;
}

function updateNode(
  roots: SceneNode[],
  id: string,
  patch: Partial<SceneNode>,
): SceneNode[] {
  return roots.map(r => {
    if (r.id === id) return { ...r, ...patch };
    return { ...r, children: updateNode(r.children, id, patch) };
  });
}

function deleteNode(roots: SceneNode[], id: string): SceneNode[] {
  return roots
    .filter(r => r.id !== id)
    .map(r => ({ ...r, children: deleteNode(r.children, id) }));
}

function addChildNode(
  roots: SceneNode[],
  parentId: string,
  child: SceneNode,
): SceneNode[] {
  return roots.map(r => {
    if (r.id === parentId) return { ...r, children: [...r.children, child] };
    return { ...r, children: addChildNode(r.children, parentId, child) };
  });
}

function moveNode(roots: SceneNode[], id: string, dir: 'up' | 'down'): SceneNode[] {
  const info = findParent(roots, id);
  if (info.idx === -1) return roots;
  const sibs = [...info.siblings];
  const newIdx = dir === 'up' ? info.idx - 1 : info.idx + 1;
  if (newIdx < 0 || newIdx >= sibs.length) return roots;
  [sibs[info.idx], sibs[newIdx]] = [sibs[newIdx], sibs[info.idx]];
  if (!info.parent) return sibs;
  return updateNode(roots, info.parent.id, { children: sibs });
}

// ─── Counter for auto-naming ──────────────────────────────────────────────────

function useCounter() {
  const ref = useRef(0);
  return useCallback(() => { ref.current++; return ref.current; }, []);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface TreeItemProps {
  node: SceneNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onToggleCollapse: (id: string) => void;
  onAddChild: (parentId: string, type: string) => void;
  nextCount: () => number;
}

const TreeItem: React.FC<TreeItemProps> = ({
  node, depth, selectedId, onSelect, onDelete, onMove,
  onToggleCollapse, onAddChild, nextCount,
}) => {
  const selected = selectedId === node.id;
  const hasKids = node.children.length > 0;
  const meta = WIDGET_CATALOG
    .flatMap(c => c.widgets)
    .find(w => w.type === node.className);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          pl: depth * 2 + 0.5,
          pr: 0.5,
          py: 0.25,
          bgcolor: selected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
          cursor: 'pointer',
          borderRadius: 0.5,
        }}
        onClick={() => onSelect(node.id)}
      >
        {/* Collapse toggle */}
        {hasKids ? (
          <IconButton size="small" sx={{ p: 0.2, mr: 0.25 }}
            onClick={e => { e.stopPropagation(); onToggleCollapse(node.id); }}>
            {node.collapsed ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ExpandLessIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        ) : (
          <Box sx={{ width: 22, flexShrink: 0 }} />
        )}
        {/* Icon */}
        <Typography sx={{ fontFamily: 'monospace', fontSize: 13, mr: 0.75, opacity: 0.7, width: 18, textAlign: 'center', flexShrink: 0 }}>
          {meta?.icon ?? '▢'}
        </Typography>
        {/* Class name + objectName */}
        <Typography variant="caption" sx={{ fontWeight: 500, mr: 0.5, flexShrink: 0 }}>
          {node.className}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.objectName}
        </Typography>
        {/* Action buttons — show on hover/select */}
        <Box sx={{ display: 'flex', opacity: selected ? 1 : 0, '&:hover': { opacity: 1 }, flexShrink: 0 }}>
          <Tooltip title="Move up">
            <IconButton size="small" sx={{ p: 0.2 }}
              onClick={e => { e.stopPropagation(); onMove(node.id, 'up'); }}>
              <ArrowUpwardIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Move down">
            <IconButton size="small" sx={{ p: 0.2 }}
              onClick={e => { e.stopPropagation(); onMove(node.id, 'down'); }}>
              <ArrowDownwardIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" sx={{ p: 0.2, color: 'error.main' }}
              onClick={e => { e.stopPropagation(); onDelete(node.id); }}>
              <DeleteIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Children */}
      {hasKids && !node.collapsed && (
        <Box>
          {node.children.map(child => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onMove={onMove}
              onToggleCollapse={onToggleCollapse}
              onAddChild={onAddChild}
              nextCount={nextCount}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

// ─── Properties panel ─────────────────────────────────────────────────────────

interface PropsPanelProps {
  node: SceneNode;
  onChange: (id: string, patch: Partial<SceneNode>) => void;
}

const PropertiesPanel: React.FC<PropsPanelProps> = ({ node, onChange }) => {
  const defs = WIDGET_PROPS[node.className] ?? [];
  const propMap = useMemo(() => {
    const m = new Map<string, unknown>();
    for (const { key, value } of node.properties) m.set(key, value);
    return m;
  }, [node.properties]);

  function setProp(key: string, value: unknown) {
    const next = node.properties.map(p => p.key === key ? { key, value } : p);
    // If it's a new key, append.
    if (!next.find(p => p.key === key)) next.push({ key, value });
    onChange(node.id, { properties: next });
  }

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto', flex: 1 }}>
      {/* Header */}
      <Box>
        <Typography variant="caption" color="text.secondary">Type</Typography>
        <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
          {node.className}
        </Typography>
      </Box>
      <TextField
        label="objectName"
        size="small"
        value={node.objectName}
        onChange={e => onChange(node.id, { objectName: e.target.value })}
        inputProps={{ spellCheck: false, style: { fontFamily: 'monospace', fontSize: 12 } }}
        fullWidth
      />
      {defs.length === 0 && (
        <Typography variant="caption" color="text.secondary">No configurable properties.</Typography>
      )}
      {defs.map(def => {
        const val = propMap.has(def.key) ? propMap.get(def.key) : def.default;
        if (def.type === 'boolean') {
          return (
            <FormControlLabel
              key={def.key}
              control={
                <Switch
                  size="small"
                  checked={Boolean(val)}
                  onChange={e => setProp(def.key, e.target.checked)}
                />
              }
              label={<Typography variant="caption">{def.label}</Typography>}
              sx={{ ml: 0, '& .MuiFormControlLabel-label': { fontSize: 12 } }}
            />
          );
        }
        if (def.type === 'select') {
          return (
            <FormControl key={def.key} size="small" fullWidth>
              <InputLabel sx={{ fontSize: 12 }}>{def.label}</InputLabel>
              <Select
                value={String(val ?? def.default)}
                label={def.label}
                onChange={e => setProp(def.key, e.target.value)}
                sx={{ fontSize: 12 }}
              >
                {def.options!.map(o => (
                  <MenuItem key={o} value={o} sx={{ fontSize: 12 }}>{o}</MenuItem>
                ))}
              </Select>
            </FormControl>
          );
        }
        if (def.type === 'number') {
          return (
            <TextField
              key={def.key}
              label={def.label}
              size="small"
              type="number"
              value={val ?? def.default}
              inputProps={{ min: def.min, max: def.max, step: def.step ?? 1, style: { fontFamily: 'monospace', fontSize: 12 } }}
              onChange={e => setProp(def.key, parseFloat(e.target.value))}
              fullWidth
            />
          );
        }
        // string
        return (
          <TextField
            key={def.key}
            label={def.label}
            size="small"
            value={String(val ?? def.default)}
            multiline={def.multiline}
            rows={def.multiline ? 3 : undefined}
            onChange={e => setProp(def.key, e.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
            fullWidth
          />
        );
      })}
    </Box>
  );
};

// ─── Live preview panel ───────────────────────────────────────────────────────

interface LivePreviewProps {
  roots: SceneNode[];
  version: number;
}

const LivePreview: React.FC<LivePreviewProps> = ({ roots, version }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    const QtCanvas = g['QtCanvas'] as { __tag?: string } | undefined;
    if (!QtCanvas) {
      setMsg('QObject classes not loaded — embed qt.module.js and run the script first.');
      return;
    }
    if (!containerRef.current) return;
    setMsg(null);

    const tag = (QtCanvas as { __tag?: string }).__tag ?? 'qt-canvas';
    const canvas = document.createElement(tag) as HTMLElement & {
      setRootWidget: (w: unknown) => void;
    };
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(canvas);

    if (roots.length > 0) {
      requestAnimationFrame(() => {
        try {
          const rootObj = buildLiveNode(roots[0]);
          if (rootObj) canvas.setRootWidget(rootObj);
        } catch { /* ignore preview errors */ }
      });
    }

    return () => {
      if (containerRef.current?.contains(canvas)) {
        containerRef.current.removeChild(canvas);
      }
    };
  }, [roots, version]);

  return (
    <Box sx={{ flex: 1, position: 'relative', bgcolor: '#000', overflow: 'hidden' }}>
      {msg && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
          <Typography variant="caption" color="text.secondary" textAlign="center">{msg}</Typography>
        </Box>
      )}
      <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
    </Box>
  );
};

// ─── Palette ──────────────────────────────────────────────────────────────────

interface PaletteProps {
  onAdd: (type: string) => void;
  selectedCanHaveChildren: boolean;
}

const Palette: React.FC<PaletteProps> = ({ onAdd, selectedCanHaveChildren }) => {
  const [expanded, setExpanded] = useState<string[]>(['Layout', 'Display', 'Input']);

  const toggle = (cat: string) =>
    setExpanded(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat],
    );

  return (
    <Box sx={{ overflowY: 'auto', flex: 1 }}>
      {WIDGET_CATALOG.map(cat => (
        <Box key={cat.category}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={() => toggle(cat.category)}
          >
            {expanded.includes(cat.category) ? <ExpandLessIcon sx={{ fontSize: 14, mr: 0.5 }} /> : <ExpandMoreIcon sx={{ fontSize: 14, mr: 0.5 }} />}
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {cat.category}
            </Typography>
          </Box>
          <Collapse in={expanded.includes(cat.category)}>
            {cat.widgets.map(w => (
              <Tooltip key={w.type} title={w.desc} placement="right">
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.5,
                    py: 0.4,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                    opacity: !selectedCanHaveChildren && cat.category !== 'Layout' ? 0.4 : 1,
                  }}
                  onClick={() => onAdd(w.type)}
                >
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 12, width: 20, textAlign: 'center', flexShrink: 0, opacity: 0.6 }}>
                    {w.icon}
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {w.type}
                  </Typography>
                </Box>
              </Tooltip>
            ))}
          </Collapse>
          <Divider />
        </Box>
      ))}
    </Box>
  );
};

// ─── Code preview ─────────────────────────────────────────────────────────────

const CodePreview: React.FC<{ code: string }> = ({ code }) => (
  <Box
    component="pre"
    sx={{
      m: 0,
      p: 1.5,
      fontFamily: 'monospace',
      fontSize: 11,
      lineHeight: 1.55,
      overflowY: 'auto',
      flex: 1,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      color: 'text.primary',
    }}
  >
    {code}
  </Box>
);

// ─── Main dialog ──────────────────────────────────────────────────────────────

export interface QObjectSceneBuilderProps {
  open: boolean;
  onClose: () => void;
  /** Insert generated code into the script editor (Mode Init). */
  onInsertCode: (code: string) => void;
  /** Returns live QObject root instances currently running in the script block.
   *  These are the same objects as api.scripts.getRoots() inside the script. */
  getLiveRoots: () => unknown[];
  /** Initial scene loaded from the QObject scene JSON — pre-populates the tree. */
  initialRoots?: QObjectSceneNode[];
  /** Called after Apply live — syncs the builder tree back to the QObject scene panel. */
  onRootsChange?: (roots: QObjectSceneNode[]) => void;
}

function qsceneToBuilderNodes(nodes: QObjectSceneNode[]): SceneNode[] {
  return nodes.map(n => ({
    id: n.id,
    className: n.className,
    objectName: n.objectName ?? '',
    properties: n.properties.map(p => ({ key: p.key, value: p.value as unknown })),
    children: qsceneToBuilderNodes(n.children),
  }));
}

function builderToQsceneNodes(nodes: SceneNode[]): QObjectSceneNode[] {
  return nodes.map(n => ({
    id: n.id,
    className: n.className,
    objectName: n.objectName || undefined,
    properties: n.properties.map(p => ({ key: p.key, value: String(p.value ?? '') })),
    children: builderToQsceneNodes(n.children),
  }));
}

type OutputMode = 'code' | 'scene';
type RightPanel = 'props' | 'code' | 'preview';

const QObjectSceneBuilderDialog: React.FC<QObjectSceneBuilderProps> = ({
  open,
  onClose,
  onInsertCode,
  getLiveRoots,
  initialRoots,
  onRootsChange,
}) => {
  const [roots, setRoots] = useState<SceneNode[]>(() =>
    initialRoots && initialRoots.length > 0 ? qsceneToBuilderNodes(initialRoots) : [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<OutputMode>('code');
  const [rightPanel, setRightPanel] = useState<RightPanel>('props');
  const [previewVersion, setPreviewVersion] = useState(0);
  const [snack, setSnack] = useState<string | null>(null);
  const [snackSeverity, setSnackSeverity] = useState<'success' | 'error'>('success');
  const nextCount = useCounter();

  const selectedNode = useMemo(
    () => (selectedId ? findNode(roots, selectedId) : null),
    [roots, selectedId],
  );
  const selectedCanHaveChildren = selectedNode
    ? canHaveChildren(selectedNode.className)
    : true; // no selection → add as root

  // ── Tree mutations ─────────────────────────────────────────────────────────

  const handleAdd = useCallback((type: string) => {
    const newNode = makeNode(type, nextCount());
    if (!selectedId || !selectedNode || !canHaveChildren(selectedNode.className)) {
      // Add as new root.
      setRoots(prev => [...prev, newNode]);
    } else {
      setRoots(prev => addChildNode(prev, selectedId, newNode));
    }
    setSelectedId(newNode.id);
  }, [selectedId, selectedNode, nextCount]);

  const handleDelete = useCallback((id: string) => {
    setRoots(prev => deleteNode(prev, id));
    setSelectedId(prev => prev === id ? null : prev);
  }, []);

  const handleMove = useCallback((id: string, dir: 'up' | 'down') => {
    setRoots(prev => moveNode(prev, id, dir));
  }, []);

  const handleToggleCollapse = useCallback((id: string) => {
    setRoots(prev => updateNode(prev, id, {
      collapsed: !findNode(prev, id)?.collapsed,
    }));
  }, []);

  const handlePropChange = useCallback((id: string, patch: Partial<SceneNode>) => {
    setRoots(prev => updateNode(prev, id, patch));
  }, []);

  const handleAddChild = useCallback((parentId: string, type: string) => {
    const newNode = makeNode(type, nextCount());
    setRoots(prev => addChildNode(prev, parentId, newNode));
    setSelectedId(newNode.id);
  }, [nextCount]);

  // ── Code generation ────────────────────────────────────────────────────────

  const generatedCode = useMemo(
    () => mode === 'code' ? generateInitCode(roots) : generateModifyCode(roots),
    [roots, mode],
  );

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(generatedCode).then(() => {
      setSnack('Code copied to clipboard.');
    });
  }, [generatedCode]);

  const handleInsert = useCallback(() => {
    onInsertCode(generatedCode);
    setSnack('Code inserted into script editor.');
  }, [generatedCode, onInsertCode]);

  const handleApplyLive = useCallback(() => {
    if (!roots.length) {
      setSnackSeverity('error');
      setSnack('No widgets in scene — nothing to apply.');
      return;
    }

    // Always sync Scene Builder tree → QObject scene panel (updates the JSON scene).
    onRootsChange?.(builderToQsceneNodes(roots));

    // Try to also apply to the live canvas objects (if the script is running).
    const liveRoots = getLiveRoots();
    if (!liveRoots.length) {
      setSnackSeverity('success');
      setSnack('Scene updated. Run the script to reflect changes on canvas.');
      return;
    }

    type LiveObj = Record<string, unknown> & {
      findChild?: (n: string) => unknown;
      update?: () => void;
    };

    function applyProps(node: SceneNode, liveObj: unknown) {
      const o = liveObj as LiveObj;
      for (const { key, value } of node.properties) {
        if (value === undefined || value === null) continue;
        const setter = `set${ucFirst(key)}`;
        if (typeof o[setter] === 'function') {
          try { (o[setter] as (v: unknown) => void)(value); } catch { /* skip */ }
        }
      }
    }

    function applySubtree(node: SceneNode, liveRoot: LiveObj) {
      const isRoot = roots.includes(node);
      if (isRoot) {
        applyProps(node, liveRoot);
      } else if (node.objectName) {
        const found = liveRoot.findChild?.(node.objectName);
        if (found) applyProps(node, found);
      }
      for (const child of node.children) applySubtree(child, liveRoot);
    }

    let changed = 0;
    for (let i = 0; i < Math.min(roots.length, liveRoots.length); i++) {
      const liveRoot = liveRoots[i] as LiveObj;
      applySubtree(roots[i], liveRoot);
      try { liveRoot.update?.(); } catch { /* ignore repaint error */ }
      changed++;
    }

    setSnackSeverity('success');
    setSnack(`Scene updated + canvas refreshed (${changed} root${changed !== 1 ? 's' : ''}).`);
  }, [roots, getLiveRoots, onRootsChange]);

  const handleRefreshPreview = useCallback(() => {
    setPreviewVersion(v => v + 1);
  }, []);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
      >
        {/* ── App bar ── */}
        <AppBar position="relative" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar variant="dense" sx={{ gap: 1, minHeight: 48, px: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
              QWidget Scene Builder
            </Typography>

            {/* Mode toggle */}
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Mode:</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={mode}
              onChange={(_e, v) => { if (v) setMode(v); }}
              sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: 11 } }}
            >
              <ToggleButton value="code">
                <Tooltip title="Mode 1 — generate code that creates the scene from scratch">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CodeIcon sx={{ fontSize: 14 }} /> Init
                  </Box>
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="scene">
                <Tooltip title="Mode 2 — generate code that modifies the live scene via api.scripts.getRoots()">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <FlashOnIcon sx={{ fontSize: 14 }} /> Live
                  </Box>
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />

            {/* Right panel selector */}
            <ToggleButtonGroup
              size="small"
              exclusive
              value={rightPanel}
              onChange={(_e, v) => { if (v) setRightPanel(v); }}
              sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 0.75 } }}
            >
              <ToggleButton value="props">
                <Tooltip title="Properties"><Typography sx={{ fontSize: 11 }}>Props</Typography></Tooltip>
              </ToggleButton>
              <ToggleButton value="code">
                <Tooltip title="Generated code preview"><CodeIcon sx={{ fontSize: 14 }} /></Tooltip>
              </ToggleButton>
              <ToggleButton value="preview">
                <Tooltip title="Live QtCanvas preview"><VisibilityIcon sx={{ fontSize: 14 }} /></Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />

            {/* Actions */}
            <Tooltip title="Copy generated code">
              <IconButton size="small" onClick={handleCopy}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CodeIcon sx={{ fontSize: 14 }} />}
              onClick={handleInsert}
              sx={{ fontSize: 11, py: 0.25, px: 1 }}
            >
              Insert code
            </Button>
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<FlashOnIcon sx={{ fontSize: 14 }} />}
              onClick={handleApplyLive}
              sx={{ fontSize: 11, py: 0.25, px: 1 }}
            >
              Apply live
            </Button>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* ── Body (3 columns) ── */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 48px)' }}>

          {/* ── Left: Palette ── */}
          <Box
            sx={{
              width: 180,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              borderRight: 1,
              borderColor: 'divider',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                WIDGET PALETTE
              </Typography>
            </Box>
            <Box sx={{ px: 0.75, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                {selectedNode
                  ? canHaveChildren(selectedNode.className)
                    ? `Add child to ${selectedNode.className}`
                    : `${selectedNode.className} can't have children — adds as sibling root`
                  : 'Click to add root widget'}
              </Typography>
            </Box>
            <Palette onAdd={handleAdd} selectedCanHaveChildren={selectedCanHaveChildren} />
          </Box>

          {/* ── Center: Scene tree ── */}
          <Box
            sx={{
              width: 280,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              borderRight: 1,
              borderColor: 'divider',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover', display: 'flex', alignItems: 'center' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ flex: 1 }}>
                SCENE TREE
              </Typography>
              <Tooltip title="Add root widget">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setSelectedId(null)}>
                  <AddIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear scene">
                <IconButton size="small" sx={{ p: 0.25, color: 'error.main' }}
                  onClick={() => { setRoots([]); setSelectedId(null); }}>
                  <DeleteIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
              {roots.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ p: 1.5, display: 'block' }}>
                  No widgets yet — click a widget in the palette to add the first root.
                </Typography>
              ) : (
                roots.map(node => (
                  <TreeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onDelete={handleDelete}
                    onMove={handleMove}
                    onToggleCollapse={handleToggleCollapse}
                    onAddChild={handleAddChild}
                    nextCount={nextCount}
                  />
                ))
              )}
            </Box>
            {/* Status bar */}
            <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1, py: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                {roots.length === 0
                  ? 'Empty scene'
                  : `${roots.length} root${roots.length > 1 ? 's' : ''}${selectedNode ? ` · selected: ${selectedNode.objectName}` : ''}`}
              </Typography>
            </Box>
          </Box>

          {/* ── Right: Props / Code / Preview ── */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {rightPanel === 'props' && (
              <>
                <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    PROPERTIES{selectedNode ? ` — ${selectedNode.className}` : ''}
                  </Typography>
                </Box>
                {selectedNode ? (
                  <PropertiesPanel node={selectedNode} onChange={handlePropChange} />
                ) : (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Select a widget in the scene tree to edit its properties.
                    </Typography>
                  </Box>
                )}
              </>
            )}

            {rightPanel === 'code' && (
              <>
                <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ flex: 1 }}>
                    GENERATED CODE — {mode === 'code' ? 'Mode 1 (init)' : 'Mode 2 (live update)'}
                  </Typography>
                  <Chip
                    label={mode === 'code' ? 'Init' : 'Live'}
                    size="small"
                    color={mode === 'code' ? 'primary' : 'success'}
                    sx={{ height: 18, fontSize: 10 }}
                  />
                  <Tooltip title="Copy code">
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopy}>
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <CodePreview code={generatedCode} />
              </>
            )}

            {rightPanel === 'preview' && (
              <>
                <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ flex: 1 }}>
                    LIVE PREVIEW — Qt widget render
                  </Typography>
                  <Tooltip title="Refresh preview">
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={handleRefreshPreview}>
                      <RefreshIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <LivePreview roots={roots} version={previewVersion} />
              </>
            )}
          </Box>
        </Box>
      </Dialog>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={2500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackSeverity} onClose={() => setSnack(null)} sx={{ fontSize: 12 }}>
          {snack}
        </Alert>
      </Snackbar>
    </>
  );
};

export default QObjectSceneBuilderDialog;
