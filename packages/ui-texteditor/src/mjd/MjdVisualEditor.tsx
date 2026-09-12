/**
 * MjdVisualEditor — visual JSON + JSON Schema designer
 *
 * Three modes:
 *  data     – edit raw JSON values on a canvas
 *  schema   – design JSON Schema definitions with typed property nodes & edges
 *  validate – overlay schema errors on the data canvas
 *
 * Layout:
 *  ┌────────────────────────────────────────────────────────────────────────┐
 *  │ Toolbar                                                                │
 *  ├──────────┬──────────────────────────────────────────┬─────────────────┤
 *  │ JsonTree │           Canvas (ReactFlow)              │  Inspector      │
 *  │ Palette  │                                          │  (context form) │
 *  │ Views    │                                          │                 │
 *  └──────────┴──────────────────────────────────────────┴─────────────────┘
 */

import React, { useState, useCallback, useReducer, useRef, useEffect, useMemo, type ReactNode } from 'react';
import {
  Box, IconButton, Tooltip, Typography, Divider, Paper, Chip,
  Menu, MenuItem, ListItemText, ListItemIcon,
  TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  ToggleButton, ToggleButtonGroup, Switch, FormControlLabel,
  Select, FormControl, InputLabel, Badge, Tab, Tabs,
  useTheme, alpha,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import AddIcon from '@mui/icons-material/Add';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LayersIcon from '@mui/icons-material/Layers';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DataArrayIcon from '@mui/icons-material/DataArray';
import AbcIcon from '@mui/icons-material/Abc';
import PinIcon from '@mui/icons-material/Pin';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import RemoveIcon from '@mui/icons-material/Remove';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TuneIcon from '@mui/icons-material/Tune';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  Handle, Position, NodeTypes, MarkerType,
  ReactFlowProvider,
} from '@xyflow/react';
import type { Node, NodeProps, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface MjdVisualEditorProps {
  value: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  height?: string | number;
}

type EditorMode = 'data' | 'schema' | 'validate';

// Supported JSON Schema types
type JsType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

// Minimal JSON Schema representation
interface JSchema {
  $schema?: string; $id?: string; type?: JsType | JsType[];
  title?: string; description?: string;
  // Object
  properties?: Record<string, JSchema>; required?: string[];
  additionalProperties?: boolean | JSchema;
  minProperties?: number; maxProperties?: number;
  // Array
  items?: JSchema; minItems?: number; maxItems?: number; uniqueItems?: boolean;
  // String
  minLength?: number; maxLength?: number; pattern?: string; format?: string;
  // Number
  minimum?: number; maximum?: number;
  exclusiveMinimum?: number; exclusiveMaximum?: number; multipleOf?: number;
  // Common
  enum?: unknown[]; const?: unknown; default?: unknown;
  // Composition
  oneOf?: JSchema[]; anyOf?: JSchema[]; allOf?: JSchema[];
  not?: JSchema;
  // Defs
  $ref?: string; $defs?: Record<string, JSchema>; definitions?: Record<string, JSchema>;
}

type ValidationError = { path: string[]; message: string; keyword: string };

type SavedView = { id: string; name: string; visibleKeys: string[] };

type HistoryState = {
  past: Record<string, unknown>[];
  present: Record<string, unknown>;
  future: Record<string, unknown>[];
};
type HistoryAction =
  | { type: 'set'; data: Record<string, unknown> }
  | { type: 'undo' } | { type: 'redo' };

type CtxMenu = { anchor: { left: number; top: number }; path: string[]; submenu: 'new' | 'view' | null } | null;

// ReactFlow node data shapes
type DataNodeData = {
  nodeId: string; label: string; jsonPath: string[];
  value: unknown; jtype: string;
  errors: ValidationError[];
  onEdit: (v: unknown) => void;
};
type SchemaNodeData = {
  nodeId: string; label: string; jsonPath: string[];
  schema: JSchema; isRoot: boolean; isDef: boolean; isRequired: boolean;
  errors: ValidationError[];
  onEditSchema: (s: JSchema) => void;
};
type DataFlowNode = Node<DataNodeData, 'data'>;
type SchemaFlowNode = Node<SchemaNodeData, 'schema'>;
type AnyFlowNode = DataFlowNode | SchemaFlowNode;

// ═══════════════════════════════════════════════════════════════════════════════
// 2. JSON SCHEMA ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function getJsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function isJsonSchema(obj: Record<string, unknown>): boolean {
  return !!(
    obj.$schema || obj.$defs || obj.definitions ||
    (obj.properties && typeof obj.properties === 'object') ||
    (['string','number','integer','boolean','object','array','null'].includes(obj.type as string))
  );
}

function inferSchema(value: unknown): JSchema {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    const itemSchema = value.length ? inferSchema(value[0]) : {};
    return { type: 'array', items: itemSchema };
  }
  if (typeof value === 'object') {
    const props: Record<string, JSchema> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      props[k] = inferSchema(v);
    return { type: 'object', properties: props, required: Object.keys(props) };
  }
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return {};
}

const FORMAT_PATTERNS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uri: /^https?:\/\/.+/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}(:\d{2})?$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ipv4: /^(\d{1,3}\.){3}\d{1,3}$/,
  hostname: /^[a-z0-9][a-z0-9\-\.]{0,253}[a-z0-9]$/i,
};

function validateValue(value: unknown, schema: JSchema, path: string[] = []): ValidationError[] {
  const errs: ValidationError[] = [];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const vt = getJsonType(value);
    const ok = types.some(t =>
      t === vt || (t === 'integer' && typeof value === 'number' && Number.isInteger(value))
    );
    if (!ok) errs.push({ path, message: `Expected ${types.join('|')}, got ${vt}`, keyword: 'type' });
  }
  if (schema.enum != null && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(value)))
    errs.push({ path, message: `Must be one of: ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`, keyword: 'enum' });
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value))
    errs.push({ path, message: `Must equal: ${JSON.stringify(schema.const)}`, keyword: 'const' });
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength)
      errs.push({ path, message: `Too short (min ${schema.minLength})`, keyword: 'minLength' });
    if (schema.maxLength != null && value.length > schema.maxLength)
      errs.push({ path, message: `Too long (max ${schema.maxLength})`, keyword: 'maxLength' });
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      errs.push({ path, message: `Pattern mismatch: ${schema.pattern}`, keyword: 'pattern' });
    if (schema.format && FORMAT_PATTERNS[schema.format] && !FORMAT_PATTERNS[schema.format].test(value))
      errs.push({ path, message: `Invalid format: ${schema.format}`, keyword: 'format' });
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum)
      errs.push({ path, message: `Must be ≥ ${schema.minimum}`, keyword: 'minimum' });
    if (schema.maximum != null && value > schema.maximum)
      errs.push({ path, message: `Must be ≤ ${schema.maximum}`, keyword: 'maximum' });
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum)
      errs.push({ path, message: `Must be > ${schema.exclusiveMinimum}`, keyword: 'exclusiveMinimum' });
    if (schema.exclusiveMaximum != null && value >= schema.exclusiveMaximum)
      errs.push({ path, message: `Must be < ${schema.exclusiveMaximum}`, keyword: 'exclusiveMaximum' });
    if (schema.multipleOf != null && value % schema.multipleOf !== 0)
      errs.push({ path, message: `Must be multiple of ${schema.multipleOf}`, keyword: 'multipleOf' });
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (schema.required) for (const r of schema.required)
      if (!(r in obj)) errs.push({ path: [...path, r], message: 'Required field missing', keyword: 'required' });
    if (schema.properties)
      for (const [k, ps] of Object.entries(schema.properties))
        if (k in obj) errs.push(...validateValue(obj[k], ps, [...path, k]));
    if (schema.minProperties != null && Object.keys(obj).length < schema.minProperties)
      errs.push({ path, message: `Min ${schema.minProperties} properties required`, keyword: 'minProperties' });
    if (schema.maxProperties != null && Object.keys(obj).length > schema.maxProperties)
      errs.push({ path, message: `Max ${schema.maxProperties} properties allowed`, keyword: 'maxProperties' });
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems)
      errs.push({ path, message: `Min ${schema.minItems} items`, keyword: 'minItems' });
    if (schema.maxItems != null && value.length > schema.maxItems)
      errs.push({ path, message: `Max ${schema.maxItems} items`, keyword: 'maxItems' });
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length)
      errs.push({ path, message: 'Items must be unique', keyword: 'uniqueItems' });
    if (schema.items)
      value.forEach((item, i) => errs.push(...validateValue(item, schema.items!, [...path, String(i)])));
  }
  return errs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

function historyReducer(s: HistoryState, a: HistoryAction): HistoryState {
  if (a.type === 'set')
    return { past: [...s.past.slice(-49), s.present], present: a.data, future: [] };
  if (a.type === 'undo' && s.past.length)
    return { past: s.past.slice(0, -1), present: s.past.at(-1)!, future: [s.present, ...s.future] };
  if (a.type === 'redo' && s.future.length)
    return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) };
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PATH HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getAtPath(root: unknown, path: string[]): unknown {
  let cur = root;
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
function setAtPath(root: Record<string, unknown>, path: string[], val: unknown): Record<string, unknown> {
  if (!path.length) return val as Record<string, unknown>;
  const [h, ...rest] = path;
  if (!rest.length) return { ...root, [h]: val };
  const child = root[h];
  const co = child && typeof child === 'object' && !Array.isArray(child) ? child as Record<string, unknown> : {};
  return { ...root, [h]: setAtPath(co, rest, val) };
}
function deleteAtPath(root: Record<string, unknown>, path: string[]): Record<string, unknown> {
  if (!path.length) return root;
  const [h, ...rest] = path;
  if (!rest.length) { const { [h]: _, ...r } = root; return r; }
  const child = root[h];
  const co = child && typeof child === 'object' && !Array.isArray(child) ? child as Record<string, unknown> : {};
  return { ...root, [h]: deleteAtPath(co, rest) };
}
function autoLayout(keys: string[], colW = 290, rowH = 210, cols = 3): Record<string, { x: number; y: number }> {
  const r: Record<string, { x: number; y: number }> = {};
  keys.forEach((k, i) => { r[k] = { x: (i % cols) * (colW + 24), y: Math.floor(i / cols) * (rowH + 24) }; });
  return r;
}
function defaultForType(t: string): unknown {
  return { string: '', number: 0, integer: 0, boolean: false, object: {}, array: [], null: null }[t] ?? '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. THEME HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

type ColorMap = Record<string, string>;
const TYPE_COLORS_DARK: ColorMap = { string:'#ce9178',number:'#b5cea8',integer:'#b5cea8',boolean:'#569cd6',object:'#4fc3f7',array:'#c586c0',null:'#888',enum:'#ffd700',const:'#ff9800',oneOf:'#f48fb1',anyOf:'#80cbc4',allOf:'#a5d6a7',ref:'#ce93d8' };
const TYPE_COLORS_LIGHT: ColorMap = { string:'#a31515',number:'#098658',integer:'#098658',boolean:'#0070c1',object:'#1565c0',array:'#7b3814',null:'#888',enum:'#b8860b',const:'#e65100',oneOf:'#c2185b',anyOf:'#00695c',allOf:'#2e7d32',ref:'#7b1fa2' };

function typeColors(dark: boolean): ColorMap { return dark ? TYPE_COLORS_DARK : TYPE_COLORS_LIGHT; }

const TYPE_ICONS: Record<string, ReactNode> = {
  object: <DataObjectIcon sx={{ fontSize: 12 }} />,
  array:  <DataArrayIcon sx={{ fontSize: 12 }} />,
  string: <AbcIcon sx={{ fontSize: 12 }} />,
  number: <PinIcon sx={{ fontSize: 12 }} />,
  integer:<PinIcon sx={{ fontSize: 12 }} />,
  boolean:<ToggleOnIcon sx={{ fontSize: 12 }} />,
  null:   <RemoveIcon sx={{ fontSize: 12 }} />,
  enum:   <ListAltIcon sx={{ fontSize: 12 }} />,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CANVAS NODE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Shared node shell ────────────────────────────────────────────────────────

function NodeShell({ selected, accentColor, header, children, errors = [] }: {
  selected: boolean; accentColor: string;
  header: React.ReactNode; children: React.ReactNode;
  errors?: ValidationError[];
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Paper elevation={selected ? 5 : 1} sx={{
      minWidth: 210, maxWidth: 320,
      bgcolor: theme.palette.background.paper,
      border: `${selected ? 2 : 1}px solid ${selected ? accentColor : theme.palette.divider}`,
      borderRadius: 1.5, overflow: 'hidden', cursor: 'default',
      boxShadow: selected ? `0 0 0 3px ${alpha(accentColor, 0.25)}` : undefined,
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      {/* Accent bar */}
      <Box sx={{ height: 3, bgcolor: accentColor }} />
      {/* Header */}
      <Box sx={{ px: 1.5, py: 0.75, bgcolor: isDark ? alpha(accentColor, 0.08) : alpha(accentColor, 0.06), borderBottom: `1px solid ${theme.palette.divider}` }}>
        {header}
      </Box>
      {/* Body */}
      <Box sx={{ px: 1.5, py: 0.5, maxHeight: 280, overflowY: 'auto' }}>
        {children}
      </Box>
      {/* Validation errors */}
      {errors.length > 0 && (
        <Box sx={{ px: 1.5, py: 0.5, bgcolor: alpha('#f44336', 0.06), borderTop: `1px solid ${alpha('#f44336', 0.3)}` }}>
          {errors.slice(0, 3).map((e, i) => (
            <Typography key={i} sx={{ fontSize: 10, color: '#f44336', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ErrorOutlineIcon sx={{ fontSize: 10 }} /> {e.message}
            </Typography>
          ))}
          {errors.length > 3 && <Typography sx={{ fontSize: 10, color: '#f44336' }}>+{errors.length - 3} more errors</Typography>}
        </Box>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
    </Paper>
  );
}

// ─── Data Node ────────────────────────────────────────────────────────────────

function DataNodeComponent({ data, selected }: NodeProps<DataFlowNode>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const tc = typeColors(isDark);
  const { label, value, jtype, errors, onEdit } = data;
  const accent = tc[jtype] ?? tc.string;
  const keyColor = isDark ? '#9cdcfe' : theme.palette.primary.dark;

  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const startEdit = (field: string, v: unknown) => {
    setEditField(field);
    setEditVal(typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? ''));
  };
  const commitEdit = (field: string) => {
    let parsed: unknown = editVal;
    try { parsed = JSON.parse(editVal); } catch { /* string fallback */ }
    if (jtype === 'object' && field !== '__prim') {
      onEdit({ ...(value as Record<string, unknown>), [field]: parsed });
    } else if (jtype !== 'object' && jtype !== 'array') {
      onEdit(parsed);
    }
    setEditField(null);
  };

  const renderVal = (v: unknown) => {
    const t = getJsonType(v);
    const c = tc[t] ?? theme.palette.text.secondary;
    if (t === 'object') return <Box component="span" sx={{ color: tc.object, fontFamily: 'monospace', fontSize: 11 }}>{`{ ${Object.keys(v as object).length} props }`}</Box>;
    if (t === 'array') return <Box component="span" sx={{ color: tc.array, fontFamily: 'monospace', fontSize: 11 }}>{`[ ${(v as unknown[]).length} items ]`}</Box>;
    if (t === 'string') return <Box component="span" sx={{ color: c, fontFamily: 'monospace', fontSize: 11 }}>{`"${String(v).slice(0, 40)}"`}</Box>;
    return <Box component="span" sx={{ color: c, fontFamily: 'monospace', fontSize: 11 }}>{String(v)}</Box>;
  };

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ color: accent, display: 'flex' }}>{TYPE_ICONS[jtype]}</Box>
      <Typography sx={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: accent, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Typography>
      <Chip label={jtype} size="small" variant="outlined" sx={{ height: 16, fontSize: 10, color: accent, borderColor: accent, '& .MuiChip-label': { px: 0.5 } }} />
    </Box>
  );

  const rows = jtype === 'object'
    ? Object.entries(value as Record<string, unknown>)
    : jtype === 'array'
    ? (value as unknown[]).slice(0, 8).map((v, i) => [`[${i}]`, v] as [string, unknown])
    : null;

  const body = rows ? (
    <>
      {rows.map(([k, v]) => (
        <Box key={k} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: '3px', borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: keyColor, minWidth: 72, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</Typography>
          {editField === k ? (
            <TextField size="small" value={editVal} autoFocus
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => commitEdit(k)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(k); if (e.key === 'Escape') setEditField(null); }}
              sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11, fontFamily: 'monospace', py: 0.25 } }} />
          ) : (
            <Box sx={{ flex: 1, cursor: 'text', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} onDoubleClick={() => startEdit(k, v)}>
              {renderVal(v)}
            </Box>
          )}
        </Box>
      ))}
      {jtype === 'array' && (value as unknown[]).length > 8 && (
        <Typography sx={{ fontSize: 10, color: 'text.disabled', py: 0.5 }}>+{(value as unknown[]).length - 8} more…</Typography>
      )}
    </>
  ) : (
    editField === '__prim' ? (
      <TextField size="small" value={editVal} autoFocus fullWidth multiline={jtype === 'string'}
        onChange={e => setEditVal(e.target.value)}
        onBlur={() => commitEdit('__prim')}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) commitEdit('__prim'); if (e.key === 'Escape') setEditField(null); }}
        sx={{ mt: 0.5, '& .MuiInputBase-input': { fontSize: 12, fontFamily: 'monospace' } }} />
    ) : (
      <Box sx={{ py: 0.5, cursor: 'text' }} onDoubleClick={() => startEdit('__prim', value)}>{renderVal(value)}</Box>
    )
  );

  return <NodeShell selected={!!selected} accentColor={accent} header={header} errors={errors}>{body}</NodeShell>;
}

// ─── Schema Node ──────────────────────────────────────────────────────────────

function SchemaNodeComponent({ data, selected }: NodeProps<SchemaFlowNode>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const tc = typeColors(isDark);
  const { label, schema, isRoot, isDef, isRequired } = data;

  const mainType = Array.isArray(schema.type) ? schema.type[0] : (schema.type ?? 'object');
  const accent = tc[mainType] ?? tc.object;

  const constraints: string[] = [];
  if (schema.minLength != null) constraints.push(`≥${schema.minLength}`);
  if (schema.maxLength != null) constraints.push(`≤${schema.maxLength}`);
  if (schema.minimum != null) constraints.push(`min:${schema.minimum}`);
  if (schema.maximum != null) constraints.push(`max:${schema.maximum}`);
  if (schema.minItems != null) constraints.push(`[≥${schema.minItems}]`);
  if (schema.maxItems != null) constraints.push(`[≤${schema.maxItems}]`);
  if (schema.pattern) constraints.push(`/${schema.pattern.slice(0, 12)}${schema.pattern.length > 12 ? '…' : ''}/`);
  if (schema.format) constraints.push(schema.format);
  if (schema.uniqueItems) constraints.push('unique');

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ color: accent, display: 'flex' }}>{TYPE_ICONS[mainType]}</Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Typography>
          {isRequired && <Chip label="required" size="small" color="error" sx={{ height: 14, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }} />}
          {isRoot && <Chip label="root" size="small" color="info" sx={{ height: 14, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }} />}
          {isDef && <Chip label="$def" size="small" color="secondary" sx={{ height: 14, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }} />}
        </Box>
        {schema.title && <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.2 }}>{schema.title}</Typography>}
      </Box>
      <Chip label={mainType} size="small" variant="outlined" sx={{ height: 16, fontSize: 10, color: accent, borderColor: accent, flexShrink: 0, '& .MuiChip-label': { px: 0.5 } }} />
    </Box>
  );

  const body = (
    <>
      {/* Properties for object schemas */}
      {schema.properties && (
        Object.entries(schema.properties).map(([k, s]) => {
          const pt = Array.isArray(s.type) ? s.type[0] : (s.type ?? 'string');
          const pc = tc[pt] ?? tc.string;
          const req = schema.required?.includes(k);
          return (
            <Box key={k} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: '3px', borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', minWidth: 80, flexShrink: 0 }}>
                {req && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#f44336', flexShrink: 0 }} />}
                <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: isDark ? '#9cdcfe' : theme.palette.primary.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
                <Box component="span" sx={{ fontSize: 10, color: pc, fontFamily: 'monospace' }}>{pt}</Box>
                {s.format && <Chip label={s.format} size="small" sx={{ height: 14, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }} />}
                {s.enum && <Chip label="enum" size="small" color="warning" sx={{ height: 14, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }} />}
              </Box>
            </Box>
          );
        })
      )}
      {/* Enum values */}
      {schema.enum && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pt: 0.5 }}>
          {schema.enum.slice(0, 8).map((v, i) => (
            <Chip key={i} label={JSON.stringify(v)} size="small" sx={{ height: 18, fontSize: 10, fontFamily: 'monospace', '& .MuiChip-label': { px: 0.75 } }} />
          ))}
          {schema.enum.length > 8 && <Typography sx={{ fontSize: 10, color: 'text.disabled', alignSelf: 'center' }}>+{schema.enum.length - 8}</Typography>}
        </Box>
      )}
      {/* Items type for arrays */}
      {schema.items && mainType === 'array' && (
        <Box sx={{ py: '3px' }}>
          <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>
            items: <Box component="span" sx={{ color: tc[(schema.items.type as string) ?? 'string'] ?? tc.string, fontFamily: 'monospace' }}>{(schema.items.type as string) ?? '?'}</Box>
          </Typography>
        </Box>
      )}
      {/* Composition */}
      {(schema.oneOf || schema.anyOf || schema.allOf) && (
        <Box sx={{ py: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {schema.oneOf && <Chip label={`oneOf(${schema.oneOf.length})`} size="small" sx={{ height: 16, fontSize: 10, bgcolor: alpha(tc.oneOf, 0.15), color: tc.oneOf, '& .MuiChip-label': { px: 0.5 } }} />}
          {schema.anyOf && <Chip label={`anyOf(${schema.anyOf.length})`} size="small" sx={{ height: 16, fontSize: 10, bgcolor: alpha(tc.anyOf, 0.15), color: tc.anyOf, '& .MuiChip-label': { px: 0.5 } }} />}
          {schema.allOf && <Chip label={`allOf(${schema.allOf.length})`} size="small" sx={{ height: 16, fontSize: 10, bgcolor: alpha(tc.allOf, 0.15), color: tc.allOf, '& .MuiChip-label': { px: 0.5 } }} />}
        </Box>
      )}
      {/* Constraint badges */}
      {constraints.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pt: 0.5 }}>
          {constraints.map((c, i) => <Chip key={i} label={c} size="small" variant="outlined" sx={{ height: 16, fontSize: 10, fontFamily: 'monospace', '& .MuiChip-label': { px: 0.5 } }} />)}
        </Box>
      )}
      {schema.description && (
        <Typography sx={{ fontSize: 10, color: 'text.secondary', pt: 0.5, fontStyle: 'italic' }}>{schema.description.slice(0, 80)}{schema.description.length > 80 ? '…' : ''}</Typography>
      )}
    </>
  );

  return <NodeShell selected={!!selected} accentColor={accent} header={header} errors={data.errors}>{body}</NodeShell>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES: NodeTypes = { data: DataNodeComponent as any, schema: SchemaNodeComponent as any };

// ═══════════════════════════════════════════════════════════════════════════════
// 7. INSPECTOR PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const STRING_FORMATS = ['', 'email', 'uri', 'date', 'time', 'date-time', 'uuid', 'ipv4', 'ipv6', 'hostname'];

function NumField({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <TextField size="small" type="number" label={label} fullWidth
      value={value ?? ''} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />
  );
}

function Inspector({ mode, selectedId, data, schema, onEditData, onEditSchema }: {
  mode: EditorMode;
  selectedId: string | null;
  data: Record<string, unknown>;
  schema: JSchema | null;
  onEditData: (path: string[], val: unknown) => void;
  onEditSchema: (path: string[], val: unknown) => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const tc = typeColors(isDark);
  const [tab, setTab] = useState(0);

  if (!selectedId) {
    return (
      <Box sx={{ p: 2, color: 'text.disabled', textAlign: 'center' }}>
        <TuneIcon sx={{ fontSize: 32, mb: 1, opacity: 0.4 }} />
        <Typography variant="caption" display="block">Select a node to inspect</Typography>
      </Box>
    );
  }

  // In data mode — inspect the JSON value
  if (mode === 'data' || mode === 'validate') {
    const value = data[selectedId];
    const jtype = getJsonType(value);
    const accent = tc[jtype] ?? tc.string;
    const inferred = inferSchema(value);
    const validationErrors = schema ? validateValue(value, schema.properties?.[selectedId] ?? {}, [selectedId]) : [];

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ color: accent }}>{TYPE_ICONS[jtype]}</Box>
            <Typography sx={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: accent }}>{selectedId}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">JSON type: {jtype}</Typography>
        </Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0, '& .MuiTab-root': { fontSize: 11, minWidth: 60, py: 0.5 } }}>
          <Tab label="Value" />
          <Tab label="Schema" />
          {mode === 'validate' && <Tab label={<Badge badgeContent={validationErrors.length} color="error">Errors</Badge>} />}
        </Tabs>
        <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
          {tab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {jtype === 'string' && (
                <TextField size="small" label="Value" fullWidth multiline maxRows={6}
                  value={value as string}
                  onChange={e => onEditData([selectedId], e.target.value)} />
              )}
              {(jtype === 'number' || jtype === 'integer') && (
                <TextField size="small" label="Value" type="number" fullWidth
                  value={value as number}
                  onChange={e => onEditData([selectedId], Number(e.target.value))} />
              )}
              {jtype === 'boolean' && (
                <FormControlLabel
                  control={<Switch checked={!!value} onChange={e => onEditData([selectedId], e.target.checked)} />}
                  label="Value" />
              )}
              {jtype === 'null' && <Typography color="text.secondary" variant="caption">null — no value</Typography>}
              {jtype === 'object' && (
                <Box>
                  {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                    <Box key={k} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
                      <Typography sx={{ fontSize: 11, fontFamily: 'monospace', pt: 1, minWidth: 70, color: isDark ? '#9cdcfe' : theme.palette.primary.dark }}>{k}:</Typography>
                      <TextField size="small" fullWidth value={typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
                        onChange={e => {
                          let pv: unknown = e.target.value;
                          try { pv = JSON.parse(e.target.value); } catch { /* string */ }
                          onEditData([selectedId], { ...(value as Record<string, unknown>), [k]: pv });
                        }}
                        sx={{ '& .MuiInputBase-input': { fontSize: 11, fontFamily: 'monospace' } }} />
                      <IconButton size="small" onClick={() => {
                        const { [k]: _, ...rest } = value as Record<string, unknown>;
                        onEditData([selectedId], rest);
                      }}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
                    </Box>
                  ))}
                  <Button size="small" startIcon={<AddIcon />} onClick={() => {
                    const key = `field${Date.now()}`;
                    onEditData([selectedId], { ...(value as Record<string, unknown>), [key]: '' });
                  }}>Add property</Button>
                </Box>
              )}
              {jtype === 'array' && (
                <Box>
                  {(value as unknown[]).map((item, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                      <Typography sx={{ fontSize: 11, color: 'text.disabled', minWidth: 24 }}>[{i}]</Typography>
                      <TextField size="small" fullWidth value={typeof item === 'object' ? JSON.stringify(item) : String(item ?? '')}
                        onChange={e => {
                          let pv: unknown = e.target.value;
                          try { pv = JSON.parse(e.target.value); } catch { /* string */ }
                          const next = [...(value as unknown[])]; next[i] = pv;
                          onEditData([selectedId], next);
                        }}
                        sx={{ '& .MuiInputBase-input': { fontSize: 11, fontFamily: 'monospace' } }} />
                      <IconButton size="small" onClick={() => {
                        const next = (value as unknown[]).filter((_, j) => j !== i);
                        onEditData([selectedId], next);
                      }}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
                    </Box>
                  ))}
                  <Button size="small" startIcon={<AddIcon />} onClick={() => onEditData([selectedId], [...(value as unknown[]), ''])}>Add item</Button>
                </Box>
              )}
            </Box>
          )}
          {tab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Inferred schema</Typography>
              <Box sx={{ bgcolor: isDark ? '#1e1e2e' : theme.palette.grey[50], p: 1, borderRadius: 1, fontFamily: 'monospace', fontSize: 11 }}>
                <pre style={{ margin: 0, overflow: 'auto' }}>{JSON.stringify(inferred, null, 2)}</pre>
              </Box>
            </Box>
          )}
          {tab === 2 && mode === 'validate' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {validationErrors.length === 0
                ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
                    <CheckCircleOutlineIcon /> <Typography variant="body2">Valid</Typography>
                  </Box>
                : validationErrors.map((e, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, p: 1, bgcolor: alpha('#f44336', 0.06), borderRadius: 1, borderLeft: `3px solid #f44336` }}>
                      <ErrorOutlineIcon sx={{ fontSize: 16, color: '#f44336', flexShrink: 0, mt: 0.25 }} />
                      <Box>
                        <Typography sx={{ fontSize: 11 }}>{e.message}</Typography>
                        <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace' }}>{e.path.join(' › ')} [{e.keyword}]</Typography>
                      </Box>
                    </Box>
                  ))}
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // Schema mode — inspect the schema definition
  if (mode === 'schema') {
    const nodeSchema: JSchema = (() => {
      if (!schema) return {};
      if (selectedId === '__root__') return schema;
      if (selectedId.startsWith('prop__')) return schema.properties?.[selectedId.slice(6)] ?? {};
      const defs = schema.$defs ?? schema.definitions;
      if (selectedId.startsWith('def__') && defs) return defs[selectedId.slice(5)] ?? {};
      return {};
    })();

    const mainType = Array.isArray(nodeSchema.type) ? nodeSchema.type[0] : (nodeSchema.type ?? 'object');

    const patchSchema = (patch: Partial<JSchema>) => {
      if (!schema) return;
      if (selectedId === '__root__') {
        onEditSchema([], { ...schema, ...patch });
      } else if (selectedId.startsWith('prop__')) {
        const propName = selectedId.slice(6);
        onEditSchema(['properties', propName], { ...nodeSchema, ...patch });
      } else if (selectedId.startsWith('def__')) {
        const defName = selectedId.slice(5);
        onEditSchema(['$defs', defName], { ...nodeSchema, ...patch });
      }
    };

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Typography sx={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: tc[mainType] ?? tc.object }}>
            {selectedId.startsWith('prop__') ? selectedId.slice(6) : selectedId.startsWith('def__') ? `$def:${selectedId.slice(5)}` : 'Root Schema'}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Type */}
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontSize: 12 }}>Type</InputLabel>
            <Select label="Type" value={mainType ?? ''} onChange={e => patchSchema({ type: e.target.value as JsType })}
              sx={{ fontSize: 12 }}>
              {['string','number','integer','boolean','object','array','null'].map(t => <MenuItem key={t} value={t} sx={{ fontSize: 12 }}>{t}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField size="small" label="Title" fullWidth value={nodeSchema.title ?? ''}
            onChange={e => patchSchema({ title: e.target.value || undefined })}
            sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />

          <TextField size="small" label="Description" fullWidth multiline maxRows={3}
            value={nodeSchema.description ?? ''}
            onChange={e => patchSchema({ description: e.target.value || undefined })}
            sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />

          {/* String constraints */}
          {(mainType === 'string') && (
            <>
              <Divider><Typography sx={{ fontSize: 10 }}>String</Typography></Divider>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: 12 }}>Format</InputLabel>
                <Select label="Format" value={nodeSchema.format ?? ''} onChange={e => patchSchema({ format: e.target.value || undefined })} sx={{ fontSize: 12 }}>
                  {STRING_FORMATS.map(f => <MenuItem key={f} value={f} sx={{ fontSize: 12 }}>{f || '(none)'}</MenuItem>)}
                </Select>
              </FormControl>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <NumField label="minLength" value={nodeSchema.minLength} onChange={v => patchSchema({ minLength: v })} />
                <NumField label="maxLength" value={nodeSchema.maxLength} onChange={v => patchSchema({ maxLength: v })} />
              </Box>
              <TextField size="small" label="Pattern (regex)" fullWidth value={nodeSchema.pattern ?? ''}
                onChange={e => patchSchema({ pattern: e.target.value || undefined })}
                sx={{ '& .MuiInputBase-input': { fontSize: 12, fontFamily: 'monospace' } }} />
            </>
          )}

          {/* Number constraints */}
          {(mainType === 'number' || mainType === 'integer') && (
            <>
              <Divider><Typography sx={{ fontSize: 10 }}>Number</Typography></Divider>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <NumField label="minimum" value={nodeSchema.minimum} onChange={v => patchSchema({ minimum: v })} />
                <NumField label="maximum" value={nodeSchema.maximum} onChange={v => patchSchema({ maximum: v })} />
                <NumField label="exclusiveMin" value={nodeSchema.exclusiveMinimum} onChange={v => patchSchema({ exclusiveMinimum: v })} />
                <NumField label="exclusiveMax" value={nodeSchema.exclusiveMaximum} onChange={v => patchSchema({ exclusiveMaximum: v })} />
              </Box>
              <NumField label="multipleOf" value={nodeSchema.multipleOf} onChange={v => patchSchema({ multipleOf: v })} />
            </>
          )}

          {/* Array constraints */}
          {mainType === 'array' && (
            <>
              <Divider><Typography sx={{ fontSize: 10 }}>Array</Typography></Divider>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <NumField label="minItems" value={nodeSchema.minItems} onChange={v => patchSchema({ minItems: v })} />
                <NumField label="maxItems" value={nodeSchema.maxItems} onChange={v => patchSchema({ maxItems: v })} />
              </Box>
              <FormControlLabel control={<Switch size="small" checked={!!nodeSchema.uniqueItems} onChange={e => patchSchema({ uniqueItems: e.target.checked || undefined })} />} label={<Typography sx={{ fontSize: 12 }}>uniqueItems</Typography>} />
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: 12 }}>Items type</InputLabel>
                <Select label="Items type" value={nodeSchema.items?.type as string ?? ''}
                  onChange={e => patchSchema({ items: e.target.value ? { type: e.target.value as JsType } : undefined })}
                  sx={{ fontSize: 12 }}>
                  <MenuItem value="" sx={{ fontSize: 12 }}>(any)</MenuItem>
                  {['string','number','integer','boolean','object','array'].map(t => <MenuItem key={t} value={t} sx={{ fontSize: 12 }}>{t}</MenuItem>)}
                </Select>
              </FormControl>
            </>
          )}

          {/* Object constraints */}
          {mainType === 'object' && (
            <>
              <Divider><Typography sx={{ fontSize: 10 }}>Object</Typography></Divider>
              <FormControlLabel
                control={<Switch size="small" checked={nodeSchema.additionalProperties === false} onChange={e => patchSchema({ additionalProperties: e.target.checked ? false : undefined })} />}
                label={<Typography sx={{ fontSize: 12 }}>No additionalProperties</Typography>} />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <NumField label="minProperties" value={nodeSchema.minProperties} onChange={v => patchSchema({ minProperties: v })} />
                <NumField label="maxProperties" value={nodeSchema.maxProperties} onChange={v => patchSchema({ maxProperties: v })} />
              </Box>
              {/* Required toggles */}
              {nodeSchema.properties && (
                <Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, mb: 0.5 }}>Required fields</Typography>
                  {Object.keys(nodeSchema.properties).map(k => {
                    const req = nodeSchema.required?.includes(k) ?? false;
                    return (
                      <FormControlLabel key={k} sx={{ display: 'flex', m: 0 }}
                        control={<Switch size="small" checked={req} onChange={e => {
                          const reqs = new Set(nodeSchema.required ?? []);
                          e.target.checked ? reqs.add(k) : reqs.delete(k);
                          patchSchema({ required: reqs.size ? Array.from(reqs) : undefined });
                        }} />}
                        label={<Typography sx={{ fontSize: 12, fontFamily: 'monospace' }}>{k}</Typography>} />
                    );
                  })}
                </Box>
              )}
              {/* Add property */}
              <Button size="small" startIcon={<AddIcon />} onClick={() => {
                const pName = `prop${Date.now()}`;
                patchSchema({ properties: { ...nodeSchema.properties, [pName]: { type: 'string' } } });
              }}>Add property</Button>
            </>
          )}

          {/* Enum editor */}
          <>
            <Divider><Typography sx={{ fontSize: 10 }}>Enum / Const</Typography></Divider>
            {nodeSchema.enum ? (
              <Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {nodeSchema.enum.map((v, i) => (
                    <Chip key={i} label={JSON.stringify(v)} size="small" onDelete={() => {
                      const next = nodeSchema.enum!.filter((_, j) => j !== i);
                      patchSchema({ enum: next.length ? next : undefined });
                    }} sx={{ height: 20, fontSize: 11 }} />
                  ))}
                </Box>
                <EnumAdder onAdd={v => patchSchema({ enum: [...(nodeSchema.enum ?? []), v] })} />
              </Box>
            ) : (
              <Button size="small" onClick={() => patchSchema({ enum: [] })}>Enable enum</Button>
            )}
          </>

          {/* Default */}
          <Divider><Typography sx={{ fontSize: 10 }}>Default</Typography></Divider>
          <TextField size="small" label="Default (JSON)" fullWidth
            value={nodeSchema.default !== undefined ? JSON.stringify(nodeSchema.default) : ''}
            onChange={e => {
              try { patchSchema({ default: e.target.value ? JSON.parse(e.target.value) : undefined }); } catch { /* invalid JSON */ }
            }}
            sx={{ '& .MuiInputBase-input': { fontSize: 12, fontFamily: 'monospace' } }} />
        </Box>
      </Box>
    );
  }

  return null;
}

function EnumAdder({ onAdd }: { onAdd: (v: unknown) => void }) {
  const [raw, setRaw] = useState('');
  const submit = () => {
    if (!raw.trim()) return;
    let v: unknown = raw;
    try { v = JSON.parse(raw); } catch { /* string */ }
    onAdd(v);
    setRaw('');
  };
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <TextField size="small" placeholder='Value (JSON or string)' value={raw} onChange={e => setRaw(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11 } }} />
      <Button size="small" onClick={submit}>Add</Button>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. LEFT PANELS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── JSON Tree ────────────────────────────────────────────────────────────────

function getTypeColors(isDark: boolean): ColorMap { return isDark ? TYPE_COLORS_DARK : TYPE_COLORS_LIGHT; }

function TreeNode({ keyName, value, path, depth, expanded, selected, onToggle, onSelect, onContextMenu }: {
  keyName: string; value: unknown; path: string[]; depth: number;
  expanded: Set<string>; selected: string | null;
  onToggle: (s: string) => void; onSelect: (p: string[]) => void;
  onContextMenu: (e: React.MouseEvent, p: string[]) => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const tc = getTypeColors(isDark);
  const ps = path.join('\0');
  const isSel = selected === ps;
  const canExpand = value !== null && typeof value === 'object';
  const isExp = expanded.has(ps);
  const jt = getJsonType(value);
  const col = tc[jt] ?? theme.palette.text.secondary;

  const preview = () => {
    if (jt === 'object') return `{${Object.keys(value as object).length}}`;
    if (jt === 'array') return `[${(value as unknown[]).length}]`;
    const s = String(value);
    return jt === 'string' ? `"${s.slice(0, 22)}${s.length > 22 ? '…' : ''}"` : s;
  };

  return (
    <Box>
      <Box sx={{
        display: 'flex', alignItems: 'center', pl: `${depth * 10 + 4}px`, pr: 0.5, py: '1px',
        cursor: 'pointer', borderRadius: '2px', userSelect: 'none',
        bgcolor: isSel ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
        '&:hover': { bgcolor: isSel ? alpha(theme.palette.primary.main, 0.16) : alpha(theme.palette.text.primary, 0.04) },
      }} onClick={() => onSelect(path)} onContextMenu={e => { e.preventDefault(); onContextMenu(e, path); }}>
        <Box sx={{ width: 12, flexShrink: 0, display: 'flex', alignItems: 'center' }}
          onClick={e => { e.stopPropagation(); if (canExpand) onToggle(ps); }}>
          {canExpand ? (isExp ? <ExpandMoreIcon sx={{ fontSize: 12 }} /> : <ChevronRightIcon sx={{ fontSize: 12 }} />) : null}
        </Box>
        <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: isDark ? '#9cdcfe' : theme.palette.primary.dark, flexShrink: 0 }}>{keyName}</Typography>
        <Typography sx={{ fontSize: 9, fontFamily: 'monospace', color: col, ml: 0.25, flexShrink: 0, opacity: 0.7 }}>:{jt}</Typography>
        {!canExpand && <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: col, ml: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview()}</Typography>}
      </Box>
      {canExpand && isExp && (
        <Box>
          {Array.isArray(value)
            ? (value as unknown[]).map((v, i) => <TreeNode key={i} keyName={`[${i}]`} value={v} path={[...path, String(i)]} depth={depth+1} expanded={expanded} selected={selected} onToggle={onToggle} onSelect={onSelect} onContextMenu={onContextMenu} />)
            : Object.entries(value as Record<string, unknown>).map(([k, v]) => <TreeNode key={k} keyName={k} value={v} path={[...path, k]} depth={depth+1} expanded={expanded} selected={selected} onToggle={onToggle} onSelect={onSelect} onContextMenu={onContextMenu} />)}
        </Box>
      )}
    </Box>
  );
}

// ─── Type Palette ─────────────────────────────────────────────────────────────

const PALETTE_ITEMS: Array<{ type: string; label: string; icon: ReactNode; color: string }> = [
  { type: 'object',  label: '{ }',  icon: <DataObjectIcon sx={{ fontSize: 14 }} />, color: TYPE_COLORS_LIGHT.object },
  { type: 'array',   label: '[ ]',  icon: <DataArrayIcon sx={{ fontSize: 14 }} />,  color: TYPE_COLORS_LIGHT.array },
  { type: 'string',  label: '"a"',  icon: <AbcIcon sx={{ fontSize: 14 }} />,         color: TYPE_COLORS_LIGHT.string },
  { type: 'number',  label: '123',  icon: <PinIcon sx={{ fontSize: 14 }} />,         color: TYPE_COLORS_LIGHT.number },
  { type: 'boolean', label: 't/f',  icon: <ToggleOnIcon sx={{ fontSize: 14 }} />,   color: TYPE_COLORS_LIGHT.boolean },
  { type: 'null',    label: 'null', icon: <RemoveIcon sx={{ fontSize: 14 }} />,     color: TYPE_COLORS_LIGHT.null },
];
const SCHEMA_PALETTE_ITEMS = [
  { type: 'string',  label: 'String',  schema: { type: 'string' as JsType } },
  { type: 'number',  label: 'Number',  schema: { type: 'number' as JsType } },
  { type: 'integer', label: 'Integer', schema: { type: 'integer' as JsType } },
  { type: 'boolean', label: 'Boolean', schema: { type: 'boolean' as JsType } },
  { type: 'object',  label: 'Object',  schema: { type: 'object' as JsType, properties: {} } },
  { type: 'array',   label: 'Array',   schema: { type: 'array' as JsType } },
  { type: 'enum',    label: 'Enum',    schema: { type: 'string' as JsType, enum: [] } },
];

function TypePalette({ mode, onAddDataNode, onAddSchemaNode }: {
  mode: EditorMode;
  onAddDataNode: (type: string) => void;
  onAddSchemaNode: (name: string, schema: JSchema) => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const tc = getTypeColors(isDark);
  const [newName, setNewName] = useState('');

  return (
    <Box sx={{ px: 0.5, py: 0.5 }}>
      {mode === 'data' || mode === 'validate' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
          {PALETTE_ITEMS.map(it => (
            <Tooltip key={it.type} title={`Add ${it.type}`}>
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.5, borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`, cursor: 'pointer',
                '&:hover': { bgcolor: alpha(tc[it.type] ?? theme.palette.primary.main, 0.1), borderColor: tc[it.type] ?? theme.palette.primary.main },
              }} onClick={() => onAddDataNode(it.type)}>
                <Box sx={{ color: tc[it.type] }}>{it.icon}</Box>
                <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: tc[it.type] }}>{it.label}</Typography>
              </Box>
            </Tooltip>
          ))}
        </Box>
      ) : (
        <Box>
          <TextField size="small" placeholder="prop name" fullWidth value={newName}
            onChange={e => setNewName(e.target.value)}
            sx={{ mb: 0.75, '& .MuiInputBase-input': { fontSize: 11 } }} />
          {SCHEMA_PALETTE_ITEMS.map(it => (
            <Box key={it.type} sx={{
              display: 'flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.5, mb: 0.5, borderRadius: 1,
              border: `1px solid ${theme.palette.divider}`, cursor: 'pointer',
              '&:hover': { bgcolor: alpha(tc[it.type] ?? theme.palette.primary.main, 0.1) },
            }} onClick={() => {
              const name = newName.trim() || `${it.type}${Date.now()}`;
              onAddSchemaNode(name, it.schema as JSchema);
              setNewName('');
            }}>
              <Box sx={{ color: tc[it.type] }}>{TYPE_ICONS[it.type]}</Box>
              <Typography sx={{ fontSize: 11 }}>{it.label}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Views ────────────────────────────────────────────────────────────────────

function ViewsPanel({ views, currentViewId, topLevelKeys, onSelect, onAdd, onDelete, onRename, onToggleKey }: {
  views: SavedView[]; currentViewId: string | null; topLevelKeys: string[];
  onSelect: (id: string) => void; onAdd: () => void;
  onDelete: (id: string) => void; onRename: (id: string, n: string) => void;
  onToggleKey: (viewId: string, key: string, v: boolean) => void;
}) {
  const theme = useTheme();
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [exp, setExp] = useState<Set<string>>(new Set());

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, gap: 0.5, flexShrink: 0 }}>
        <LayersIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, flexGrow: 1 }}>Views</Typography>
        <Tooltip title="New view"><IconButton size="small" onClick={onAdd}><AddIcon sx={{ fontSize: 13 }} /></IconButton></Tooltip>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {views.map(v => {
          const isSel = v.id === currentViewId;
          const isExp = exp.has(v.id);
          return (
            <Box key={v.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, py: '2px', cursor: 'pointer', bgcolor: isSel ? alpha(theme.palette.primary.main, 0.1) : 'transparent', '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) } }} onClick={() => onSelect(v.id)}>
                <Box sx={{ width: 14, flexShrink: 0, display: 'flex', alignItems: 'center' }} onClick={e => { e.stopPropagation(); setExp(p => { const n = new Set(p); n.has(v.id) ? n.delete(v.id) : n.add(v.id); return n; }); }}>
                  {isExp ? <ExpandMoreIcon sx={{ fontSize: 12 }} /> : <ChevronRightIcon sx={{ fontSize: 12 }} />}
                </Box>
                {editId === v.id ? (
                  <TextField size="small" value={editName} autoFocus onClick={e => e.stopPropagation()}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={() => { onRename(v.id, editName); setEditId(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') { onRename(v.id, editName); setEditId(null); } if (e.key === 'Escape') setEditId(null); }}
                    sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11, py: 0.25 } }} />
                ) : (
                  <Typography sx={{ fontSize: 11, flex: 1 }} onDoubleClick={e => { e.stopPropagation(); setEditId(v.id); setEditName(v.name); }}>{v.name}</Typography>
                )}
                <IconButton size="small" onClick={e => { e.stopPropagation(); onDelete(v.id); }}><DeleteIcon sx={{ fontSize: 11 }} /></IconButton>
              </Box>
              {isExp && topLevelKeys.map(k => {
                const vis = v.visibleKeys.includes(k);
                return (
                  <Box key={k} sx={{ display: 'flex', alignItems: 'center', pl: 3, pr: 0.5, py: '1px', gap: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => onToggleKey(v.id, k, !vis)}>
                    <Box sx={{ width: 10, height: 10, border: '1px solid', borderColor: vis ? 'primary.main' : 'text.disabled', borderRadius: 0.25, bgcolor: vis ? 'primary.main' : 'transparent', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: vis ? 'text.primary' : 'text.disabled' }}>{k}</Typography>
                  </Box>
                );
              })}
            </Box>
          );
        })}
        {views.length === 0 && <Typography variant="caption" sx={{ px: 1, py: 1, display: 'block', color: 'text.disabled' }}>No views — click + to create</Typography>}
      </Box>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function MjdVisualEditor({ value, onChange, height }: MjdVisualEditorProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Canvas theme
  const canvasBg = isDark ? '#0f0f1a' : theme.palette.grey[50];
  const gridColor = isDark ? '#1a1a2e' : theme.palette.grey[200];

  // Auto-detect mode from JSON content
  const autoMode: EditorMode = useMemo(() => isJsonSchema(value) ? 'schema' : 'data', []);
  const [mode, setMode] = useState<EditorMode>(autoMode);

  // History
  const [hist, dispatch] = useReducer(historyReducer, { past: [], present: value, future: [] });
  const data = hist.present;

  const commit = useCallback((nd: Record<string, unknown>) => { dispatch({ type: 'set', data: nd }); onChange(nd); }, [onChange]);
  const undo = useCallback(() => { if (!hist.past.length) return; dispatch({ type: 'undo' }); onChange(hist.past.at(-1)!); }, [hist.past, onChange]);
  const redo = useCallback(() => { if (!hist.future.length) return; dispatch({ type: 'redo' }); onChange(hist.future[0]); }, [hist.future, onChange]);

  // Schema (when in schema mode, interpret data as JSchema)
  const schema: JSchema | null = useMemo(() => mode === 'schema' || mode === 'validate' ? data as JSchema : null, [data, mode]);

  // Tree state
  const [treeExp, setTreeExp] = useState<Set<string>>(new Set());
  const [treeSelected, setTreeSelected] = useState<string | null>(null);

  // Canvas selection
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);
  const closeCtx = () => setCtxMenu(null);

  // Clipboard
  const [clipboard, setClipboard] = useState<{ path: string[]; val: unknown; cut: boolean } | null>(null);

  // Views
  const [views, setViews] = useState<SavedView[]>([]);
  const [currentViewId, setCurrentViewId] = useState<string | null>(null);

  // Find
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState('');

  // Left panel tab
  const [leftTab, setLeftTab] = useState(0); // 0=tree, 1=palette, 2=views

  // Canvas positions
  const topKeys = Object.keys(data);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => autoLayout(topKeys));
  const [schemaPositions, setSchemaPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Ensure new keys get a position
  useEffect(() => {
    setPositions(prev => {
      const missing = topKeys.filter(k => !prev[k]);
      if (!missing.length) return prev;
      const maxY = Object.values(prev).reduce((m, p) => Math.max(m, p.y), 0) + 240;
      const extra: Record<string, { x: number; y: number }> = {};
      missing.forEach((k, i) => { extra[k] = { x: (i % 3) * 314, y: maxY + Math.floor(i / 3) * 234 }; });
      return { ...prev, ...extra };
    });
  }, [topKeys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // View filter
  const currentView = views.find(v => v.id === currentViewId);
  const visibleDataKeys = currentView ? topKeys.filter(k => currentView.visibleKeys.includes(k)) : topKeys;

  // ─── Validation ─────────────────────────────────────────────────────────────

  const validationErrors = useMemo((): ValidationError[] => {
    if (mode !== 'validate' || !schema) return [];
    return validateValue(data, schema);
  }, [mode, data, schema]);

  const errorsByKey = useMemo((): Map<string, ValidationError[]> => {
    const m = new Map<string, ValidationError[]>();
    validationErrors.forEach(e => {
      const k = e.path[0] ?? '__root__';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    });
    return m;
  }, [validationErrors]);

  // ─── Build canvas nodes (data mode) ─────────────────────────────────────────

  const dataFlowNodes = useMemo((): DataFlowNode[] =>
    visibleDataKeys.map(key => ({
      id: key, type: 'data' as const,
      position: positions[key] ?? { x: 0, y: 0 },
      selected: selectedId === key,
      data: {
        nodeId: key, label: key, jsonPath: [key],
        value: data[key], jtype: getJsonType(data[key]),
        errors: errorsByKey.get(key) ?? [],
        onEdit: (v: unknown) => commit({ ...data, [key]: v }),
      },
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [visibleDataKeys.join(','), positions, data, selectedId, errorsByKey]);

  // ─── Build canvas nodes + edges (schema mode) ────────────────────────────────

  const { schemaFlowNodes, schemaEdges } = useMemo((): { schemaFlowNodes: SchemaFlowNode[]; schemaEdges: Edge[] } => {
    if (mode !== 'schema') return { schemaFlowNodes: [], schemaEdges: [] };
    const nodes: SchemaFlowNode[] = [];
    const edges: Edge[] = [];
    const s = data as JSchema;

    // Root node
    const rootPos = schemaPositions['__root__'] ?? { x: 300, y: 30 };
    nodes.push({
      id: '__root__', type: 'schema' as const, position: rootPos, selected: selectedId === '__root__',
      data: { nodeId: '__root__', label: s.title ?? 'root', jsonPath: [], schema: s, isRoot: true, isDef: false, isRequired: false, errors: [], onEditSchema: (ns: JSchema) => commit(ns as Record<string, unknown>) },
    });

    // Properties
    if (s.properties) {
      let i = 0;
      for (const [pName, pSchema] of Object.entries(s.properties)) {
        const id = `prop__${pName}`;
        const pos = schemaPositions[id] ?? { x: 50 + i * 220, y: 280 };
        const isReq = s.required?.includes(pName) ?? false;
        nodes.push({
          id, type: 'schema' as const, position: pos, selected: selectedId === id,
          data: { nodeId: id, label: pName, jsonPath: ['properties', pName], schema: pSchema, isRoot: false, isDef: false, isRequired: isReq, errors: [], onEditSchema: (ns: JSchema) => commit({ ...data, properties: { ...(data.properties as Record<string, unknown>), [pName]: ns } }) },
        });
        edges.push({
          id: `e__${pName}`, source: '__root__', target: id, type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          style: { stroke: isReq ? '#f44336' : (isDark ? '#4fc3f7' : theme.palette.primary.main), strokeDasharray: isReq ? undefined : '5,3' },
          label: isReq ? '●req' : undefined, labelStyle: { fontSize: 10, fill: '#f44336' },
        });
        i++;
      }
    }

    // $defs / definitions
    const defs = s.$defs ?? s.definitions;
    if (defs) {
      let i = 0;
      for (const [defName, defSchema] of Object.entries(defs)) {
        const id = `def__${defName}`;
        const pos = schemaPositions[id] ?? { x: 700 + i * 220, y: 30 };
        nodes.push({
          id, type: 'schema' as const, position: pos, selected: selectedId === id,
          data: { nodeId: id, label: defName, jsonPath: ['$defs', defName], schema: defSchema, isRoot: false, isDef: true, isRequired: false, errors: [], onEditSchema: (ns: JSchema) => commit({ ...data, $defs: { ...(data.$defs as Record<string, unknown>), [defName]: ns } }) },
        });
        i++;
      }
    }

    return { schemaFlowNodes: nodes, schemaEdges: edges };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, data, selectedId, schemaPositions, isDark]);

  const flowNodes = mode === 'schema' ? schemaFlowNodes : dataFlowNodes;
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes as AnyFlowNode[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(schemaEdges);

  useEffect(() => { setNodes(flowNodes as AnyFlowNode[]); }, [flowNodes, setNodes]);
  useEffect(() => { setEdges(schemaEdges); }, [schemaEdges, setEdges]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    if (mode === 'schema') {
      setSchemaPositions(p => ({ ...p, [node.id]: node.position }));
    } else {
      setPositions(p => ({ ...p, [node.id]: node.position }));
    }
  }, [mode]);

  // ─── Tree callbacks ──────────────────────────────────────────────────────────

  const handleTreeToggle = (ps: string) => setTreeExp(p => { const n = new Set(p); n.has(ps) ? n.delete(ps) : n.add(ps); return n; });
  const handleTreeSelect = (path: string[]) => { setTreeSelected(path.join('\0')); if (path.length === 1) setSelectedId(path[0]); };
  const handleCtxMenu = (e: React.MouseEvent, path: string[]) => {
    e.preventDefault();
    setCtxMenu({ anchor: { left: e.clientX, top: e.clientY }, path, submenu: null });
    handleTreeSelect(path);
  };

  // ─── Context menu actions ────────────────────────────────────────────────────

  const ctxAdd = (type: string) => {
    if (!ctxMenu) return;
    const { path } = ctxMenu;
    const newKey = `field${Date.now()}`;
    const v = defaultForType(type);
    if (!path.length) commit({ ...data, [newKey]: v });
    else {
      const t = getAtPath(data, path);
      if (t && typeof t === 'object' && !Array.isArray(t)) commit(setAtPath(data, [...path, newKey], v));
      else if (Array.isArray(t)) commit(setAtPath(data, path, [...t, v]));
    }
    closeCtx();
  };
  const ctxCut = () => { if (!ctxMenu) return; setClipboard({ path: ctxMenu.path, val: getAtPath(data, ctxMenu.path), cut: true }); commit(deleteAtPath(data, ctxMenu.path)); closeCtx(); };
  const ctxCopy = () => { if (!ctxMenu) return; setClipboard({ path: ctxMenu.path, val: getAtPath(data, ctxMenu.path), cut: false }); closeCtx(); };
  const ctxPaste = () => {
    if (!ctxMenu || !clipboard) return;
    const { path } = ctxMenu;
    if (!path.length) commit({ ...data, [`pasted_${Date.now()}`]: clipboard.val });
    else {
      const t = getAtPath(data, path);
      if (t && typeof t === 'object' && !Array.isArray(t)) commit(setAtPath(data, [...path, `pasted_${Date.now()}`], clipboard.val));
    }
    closeCtx();
  };
  const ctxDelete = () => { if (!ctxMenu) return; commit(deleteAtPath(data, ctxMenu.path)); closeCtx(); };
  const ctxAddToView = (all: boolean) => {
    if (!ctxMenu || !currentViewId) return;
    const rk = ctxMenu.path[0];
    setViews(prev => prev.map(v => {
      if (v.id !== currentViewId) return v;
      const ks = new Set(v.visibleKeys);
      if (rk) ks.add(rk);
      if (all) topKeys.forEach(k => ks.add(k));
      return { ...v, visibleKeys: Array.from(ks) };
    }));
    closeCtx();
  };

  // ─── Add node actions ────────────────────────────────────────────────────────

  const addDataNode = (type: string) => {
    const key = `${type}${Date.now()}`;
    commit({ ...data, [key]: defaultForType(type) });
  };

  const addSchemaNode = (name: string, s: JSchema) => {
    // Adds as a property if root is object schema, else as a top-level key
    if ((data as JSchema).properties !== undefined) {
      commit({ ...data, properties: { ...((data as JSchema).properties ?? {}), [name]: s } });
    } else {
      commit({ ...data, [name]: s });
    }
  };

  // ─── Views ───────────────────────────────────────────────────────────────────

  const addView = () => {
    const id = `v_${Date.now()}`;
    setViews(p => [...p, { id, name: `View ${p.length + 1}`, visibleKeys: [...topKeys] }]);
    setCurrentViewId(id);
  };

  // ─── Find ────────────────────────────────────────────────────────────────────

  const findResults = useMemo(() => {
    if (!findQ.trim()) return [];
    const q = findQ.toLowerCase(); const res: string[] = [];
    function search(obj: unknown, path: string[]) {
      if (typeof obj === 'string' && obj.toLowerCase().includes(q)) res.push(path.join(' › '));
      if (obj && typeof obj === 'object' && !Array.isArray(obj))
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) { if (k.toLowerCase().includes(q)) res.push([...path, k].join(' › ')); search(v, [...path, k]); }
      if (Array.isArray(obj)) obj.forEach((v, i) => search(v, [...path, String(i)]));
    }
    search(data, []); return res.slice(0, 50);
  }, [findQ, data]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement)) return;
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); }
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setFindOpen(true); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [undo, redo]);

  // ─── Schema editing helper ───────────────────────────────────────────────────

  const handleEditSchema = (path: string[], val: unknown) => {
    if (!path.length) { commit(val as Record<string, unknown>); return; }
    commit(setAtPath(data, path, val));
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const validCount = validationErrors.length;
  const modeColor = { data: theme.palette.info.main, schema: theme.palette.primary.main, validate: validCount > 0 ? theme.palette.error.main : theme.palette.success.main };

  return (
    <Box ref={containerRef} tabIndex={-1}
      sx={{ display: 'flex', flexDirection: 'column', height: height ?? '100%', bgcolor: 'background.default', outline: 'none' }}
    >
      {/* ── Toolbar ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Undo/Redo */}
        <Tooltip title="Undo (Ctrl+Z)"><span><IconButton size="small" onClick={undo} disabled={!hist.past.length}><UndoIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
        <Tooltip title="Redo (Ctrl+Y)"><span><IconButton size="small" onClick={redo} disabled={!hist.future.length}><RedoIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Mode toggle */}
        <ToggleButtonGroup size="small" value={mode} exclusive onChange={(_, v) => v && setMode(v)}>
          <ToggleButton value="data" sx={{ px: 1, gap: 0.5, fontSize: 11 }}>
            <DataObjectIcon sx={{ fontSize: 14 }} /> Data
          </ToggleButton>
          <ToggleButton value="schema" sx={{ px: 1, gap: 0.5, fontSize: 11 }}>
            <AccountTreeIcon sx={{ fontSize: 14 }} /> Schema
          </ToggleButton>
          <ToggleButton value="validate" sx={{ px: 1, gap: 0.5, fontSize: 11 }}>
            {validCount > 0
              ? <Badge badgeContent={validCount} color="error"><CheckCircleOutlineIcon sx={{ fontSize: 14 }} /></Badge>
              : <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />}
            Validate
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Find (Ctrl+F)"><IconButton size="small" onClick={() => setFindOpen(true)}><SearchIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
        <Tooltip title="Add root key"><IconButton size="small" onClick={() => commit({ ...data, [`key${Date.now()}`]: '' })}><AddIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>

        {currentViewId && (
          <Chip size="small" label={views.find(v => v.id === currentViewId)?.name} onDelete={() => setCurrentViewId(null)}
            sx={{ fontSize: 11, height: 22, ml: 0.5 }} />
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* Status */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: modeColor[mode] }} />
          <Typography variant="caption" color="text.secondary">
            {mode} · {topKeys.length} keys
            {mode === 'validate' && validCount > 0 && ` · ${validCount} error${validCount > 1 ? 's' : ''}`}
          </Typography>
        </Box>
      </Box>

      {/* ── Main layout ── */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left panel ── */}
        <Box sx={{ width: 210, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', flexShrink: 0 }}>
          {/* Tab bar */}
          <Tabs value={leftTab} onChange={(_, v) => setLeftTab(v)} variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0, minHeight: 32, '& .MuiTab-root': { minHeight: 32, fontSize: 10, py: 0.5 } }}>
            <Tab label="Tree" />
            <Tab label="Palette" />
            <Tab label="Views" />
          </Tabs>

          {leftTab === 0 && (
            <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
              {topKeys.map(key => (
                <TreeNode key={key} keyName={key} value={data[key]} path={[key]} depth={0}
                  expanded={treeExp} selected={treeSelected}
                  onToggle={handleTreeToggle} onSelect={handleTreeSelect} onContextMenu={handleCtxMenu} />
              ))}
              {!topKeys.length && <Typography variant="caption" sx={{ px: 1.5, py: 1, display: 'block', color: 'text.disabled' }}>Empty — click + to add</Typography>}
            </Box>
          )}

          {leftTab === 1 && (
            <Box sx={{ flex: 1, overflow: 'auto', p: 0.5 }}>
              <TypePalette mode={mode} onAddDataNode={addDataNode} onAddSchemaNode={addSchemaNode} />
            </Box>
          )}

          {leftTab === 2 && (
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ViewsPanel
                views={views} currentViewId={currentViewId} topLevelKeys={topKeys}
                onSelect={setCurrentViewId} onAdd={addView}
                onDelete={id => { setViews(p => p.filter(v => v.id !== id)); if (currentViewId === id) setCurrentViewId(null); }}
                onRename={(id, name) => setViews(p => p.map(v => v.id === id ? { ...v, name } : v))}
                onToggleKey={(vid, k, vis) => setViews(p => p.map(v => {
                  if (v.id !== vid) return v;
                  const ks = new Set(v.visibleKeys);
                  vis ? ks.add(k) : ks.delete(k);
                  return { ...v, visibleKeys: Array.from(ks) };
                }))}
              />
            </Box>
          )}
        </Box>

        {/* ── Canvas ── */}
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              nodeTypes={NODE_TYPES}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              style={{ background: canvasBg }}
            >
              <Background color={gridColor} gap={20} />
              <Controls />
              <MiniMap style={{ background: isDark ? '#181828' : theme.palette.grey[100] }}
                nodeColor={theme.palette.primary.main}
                maskColor={isDark ? 'rgba(15,15,26,0.7)' : 'rgba(248,250,252,0.7)'} />
            </ReactFlow>
          </ReactFlowProvider>
        </Box>

        {/* ── Right Inspector ── */}
        <Box sx={{ width: 240, borderLeft: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', flexShrink: 0 }}>
          <Box sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TuneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>Inspector</Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Inspector
              mode={mode}
              selectedId={selectedId?.startsWith('prop__') || selectedId?.startsWith('def__') || selectedId === '__root__' ? selectedId : selectedId}
              data={data}
              schema={schema}
              onEditData={(path, val) => commit(setAtPath(data, path, val))}
              onEditSchema={handleEditSchema}
            />
          </Box>
        </Box>
      </Box>

      {/* ── Context menus ── */}
      <Menu open={!!ctxMenu && ctxMenu.submenu === null} onClose={closeCtx} anchorReference="anchorPosition" anchorPosition={ctxMenu?.anchor} PaperProps={{ sx: { minWidth: 180 } }}>
        <MenuItem onClick={() => setCtxMenu(m => m ? { ...m, submenu: 'new' } : m)}><ListItemIcon><AddIcon fontSize="small" /></ListItemIcon><ListItemText>New</ListItemText><ChevronRightIcon sx={{ ml: 1 }} fontSize="small" /></MenuItem>
        <MenuItem onClick={ctxCut}><ListItemIcon><ContentCutIcon fontSize="small" /></ListItemIcon><ListItemText>Cut</ListItemText></MenuItem>
        <MenuItem onClick={ctxCopy}><ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon><ListItemText>Copy</ListItemText></MenuItem>
        <MenuItem onClick={ctxPaste} disabled={!clipboard}><ListItemIcon><ContentPasteIcon fontSize="small" /></ListItemIcon><ListItemText>Paste</ListItemText></MenuItem>
        <MenuItem onClick={ctxDelete}><ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon><ListItemText>Delete</ListItemText></MenuItem>
        <Divider />
        <MenuItem onClick={() => { closeCtx(); setFindOpen(true); }}><ListItemIcon><SearchIcon fontSize="small" /></ListItemIcon><ListItemText>Find</ListItemText></MenuItem>
        <Divider />
        <MenuItem disabled={!currentViewId} onClick={() => setCtxMenu(m => m ? { ...m, submenu: 'view' } : m)}><ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon><ListItemText>View</ListItemText><ChevronRightIcon sx={{ ml: 1 }} fontSize="small" /></MenuItem>
      </Menu>
      <Menu open={!!ctxMenu && ctxMenu.submenu === 'new'} onClose={closeCtx} anchorReference="anchorPosition" anchorPosition={ctxMenu ? { top: ctxMenu.anchor.top, left: ctxMenu.anchor.left + 185 } : undefined}>
        {['string','number','boolean','object','array','null'].map(t => (
          <MenuItem key={t} dense onClick={() => ctxAdd(t)}>
            <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: getTypeColors(isDark)[t] ?? 'text.primary' }}>{t}</Typography>
          </MenuItem>
        ))}
      </Menu>
      <Menu open={!!ctxMenu && ctxMenu.submenu === 'view'} onClose={closeCtx} anchorReference="anchorPosition" anchorPosition={ctxMenu ? { top: ctxMenu.anchor.top, left: ctxMenu.anchor.left + 185 } : undefined}>
        <MenuItem dense onClick={() => ctxAddToView(false)}><ListItemText>Add to view</ListItemText></MenuItem>
        <MenuItem dense onClick={() => ctxAddToView(true)}><ListItemText>Add all to view</ListItemText></MenuItem>
      </Menu>

      {/* ── Find dialog ── */}
      <Dialog open={findOpen} onClose={() => setFindOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Find in JSON</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" placeholder="Search keys and values…" value={findQ}
            onChange={e => setFindQ(e.target.value)}
            slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 18 }} /> } }} />
          <Box sx={{ mt: 1, maxHeight: 260, overflow: 'auto' }}>
            {findResults.map((p, i) => (
              <Box key={i} sx={{ px: 1, py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 0.5 }}
                onClick={() => {
                  const parts = p.split(' › ');
                  const newExp = new Set(treeExp);
                  for (let j = 1; j < parts.length; j++) newExp.add(parts.slice(0, j).join('\0'));
                  setTreeExp(newExp);
                  setTreeSelected(parts.join('\0'));
                  if (parts.length === 1) setSelectedId(parts[0]);
                  setFindOpen(false);
                }}>
                <Typography sx={{ fontSize: 12, fontFamily: 'monospace' }}>{p}</Typography>
              </Box>
            ))}
            {findQ && !findResults.length && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 1 }}>No results</Typography>}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setFindOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
