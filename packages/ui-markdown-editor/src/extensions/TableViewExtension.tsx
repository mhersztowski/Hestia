/**
 * TableView — an advanced tabular block for the markdown editor.
 *
 * Rows come from a document env variable (an array of objects, or a single
 * object → one row). Columns map to object fields or an env-substituted
 * template. Column widths (% or px) and row height (px) are configurable via
 * two top-right toolbar icons: Data source and Display.
 *
 * Round-trips through markdown as `@[tableview:<encodeURIComponent(JSON)>]`.
 */
import React, { useMemo, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box, IconButton, Tooltip, Popover, TextField, MenuItem, Typography, Button,
  Divider, Stack,
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useMdEnv } from './MdEnvContext';

export interface TableColumn {
  key: string;
  label: string;
  width: number;
  widthUnit: '%' | 'px';
  /** Optional cell template: `{{field}}` (row field) and `{{env:path}}`. */
  template?: string;
}
export interface TableViewConfig {
  source: { env: string };
  columns: TableColumn[];
  rowHeight: number;
}

const DEFAULT_CONFIG: TableViewConfig = { source: { env: '' }, columns: [], rowHeight: 32 };

function parseConfig(raw: string): TableViewConfig {
  try {
    const c = JSON.parse(decodeURIComponent(raw)) as Partial<TableViewConfig>;
    return {
      source: { env: c.source?.env ?? '' },
      columns: Array.isArray(c.columns) ? c.columns.map((col) => ({
        key: col.key ?? '', label: col.label ?? col.key ?? '',
        width: typeof col.width === 'number' ? col.width : 0,
        widthUnit: col.widthUnit === 'px' ? 'px' : '%',
        template: col.template || undefined,
      })) : [],
      rowHeight: typeof c.rowHeight === 'number' ? c.rowHeight : 32,
    };
  } catch { return { ...DEFAULT_CONFIG }; }
}
const encodeConfig = (c: TableViewConfig) => encodeURIComponent(JSON.stringify(c));

// ── env / template helpers ────────────────────────────────────────────────

function resolveRows(envGet: (n: string) => unknown, envPath: string): Record<string, unknown>[] {
  if (!envPath) return [];
  const val = envGet(envPath);
  if (Array.isArray(val)) return val.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
  if (val && typeof val === 'object') return [val as Record<string, unknown>];
  return [];
}

function stringify(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}

/** Substitute `{{field}}` (from the row) and `{{env:path}}` (from env). */
function applyTemplate(tpl: string, row: Record<string, unknown>, envGet: (n: string) => unknown): string {
  return tpl.replace(/\{\{\s*(env:)?([^}]+?)\s*\}\}/g, (_m, isEnv: string, name: string) =>
    stringify(isEnv ? envGet(name) : row[name]),
  );
}

function autoColumns(rows: Record<string, unknown>[]): TableColumn[] {
  const keys: string[] = [];
  for (const r of rows.slice(0, 20)) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return keys.map((k) => ({ key: k, label: k, width: 0, widthUnit: '%' as const }));
}

// ── NodeView ──────────────────────────────────────────────────────────────

const TableViewNodeView: React.FC<NodeViewProps> = ({ node, editor, updateAttributes }) => {
  const cfg = useMemo(() => parseConfig((node.attrs.config as string) || ''), [node.attrs.config]);
  const env = useMdEnv();
  const [dsAnchor, setDsAnchor] = useState<HTMLElement | null>(null);
  const [dispAnchor, setDispAnchor] = useState<HTMLElement | null>(null);

  const rows = useMemo(() => resolveRows(env.get, cfg.source.env), [env, cfg.source.env, env.version]);
  const columns = cfg.columns.length ? cfg.columns : autoColumns(rows);

  const save = (next: TableViewConfig) => updateAttributes({ config: encodeConfig(next) });

  const cellText = (col: TableColumn, row: Record<string, unknown>) =>
    col.template ? applyTemplate(col.template, row, env.get) : stringify(row[col.key]);

  const widthStyle = (col: TableColumn): string | undefined =>
    col.width > 0 ? `${col.width}${col.widthUnit}` : undefined;

  return (
    <NodeViewWrapper className="md-tableview">
      {editor.isEditable && (
        <Box className="md-tableview-toolbar" contentEditable={false}>
          <Tooltip title="Źródło danych (env)">
            <IconButton size="small" className="md-tableview-btn" onClick={(e) => setDsAnchor(e.currentTarget)}>
              <StorageIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Wygląd (kolumny, wysokość wiersza)">
            <IconButton size="small" className="md-tableview-btn" onClick={(e) => setDispAnchor(e.currentTarget)}>
              <ViewColumnIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <Box className="md-tableview-scroll" contentEditable={false}>
        {columns.length === 0 ? (
          <Box className="md-tableview-empty">
            Brak kolumn. Ustaw źródło danych (env) i kolumny w ikonach po prawej.
          </Box>
        ) : (
          <table className="md-tableview-table">
            <colgroup>
              {columns.map((c, i) => <col key={i} style={{ width: widthStyle(c) }} />)}
            </colgroup>
            <thead>
              <tr>{columns.map((c, i) => <th key={i}>{c.label || c.key}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr style={{ height: cfg.rowHeight }}>
                  <td colSpan={columns.length} className="md-tableview-norows">
                    {cfg.source.env ? `Brak danych w env „${cfg.source.env}"` : 'Nie ustawiono źródła danych'}
                  </td>
                </tr>
              ) : rows.map((row, ri) => (
                <tr key={ri} style={{ height: cfg.rowHeight }}>
                  {columns.map((c, ci) => <td key={ci}>{cellText(c, row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>

      {/* ── Data source popover ── */}
      <Popover open={!!dsAnchor} anchorEl={dsAnchor} onClose={() => setDsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ p: 1.5, width: 340 }} contentEditable={false}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Źródło danych</Typography>
          <TextField
            fullWidth size="small" label="Zmienna env (tablica obiektów)"
            placeholder="np. podroz.miejsca"
            value={cfg.source.env}
            onChange={(e) => save({ ...cfg, source: { env: e.target.value.trim() } })}
            helperText={`Wykryto wierszy: ${rows.length}`}
          />
          <Button size="small" startIcon={<AutoFixHighIcon sx={{ fontSize: 16 }} />} sx={{ mt: 1 }}
            disabled={!rows.length}
            onClick={() => save({ ...cfg, columns: autoColumns(rows) })}>
            Auto-wykryj kolumny
          </Button>
        </Box>
      </Popover>

      {/* ── Display popover (columns + row height) ── */}
      <Popover open={!!dispAnchor} anchorEl={dispAnchor} onClose={() => setDispAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ p: 1.5, width: 440 }} contentEditable={false}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Wygląd</Typography>
          <TextField
            size="small" type="number" label="Wysokość wiersza (px)" sx={{ mb: 1.5, width: 180 }}
            value={cfg.rowHeight}
            onChange={(e) => save({ ...cfg, rowHeight: Math.max(0, Number(e.target.value) || 0) })}
          />
          <Divider sx={{ mb: 1 }} />
          <Typography variant="caption" color="text.secondary">Kolumny</Typography>
          <Stack spacing={1} sx={{ mt: 0.5, maxHeight: 320, overflow: 'auto' }}>
            {cfg.columns.map((col, i) => {
              const upd = (patch: Partial<TableColumn>) => {
                const cols = cfg.columns.slice(); cols[i] = { ...col, ...patch }; save({ ...cfg, columns: cols });
              };
              return (
                <Box key={i} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <TextField size="small" label="Nagłówek" value={col.label} sx={{ width: 110 }}
                    onChange={(e) => upd({ label: e.target.value })} />
                  <TextField size="small" label="Pole" value={col.key} sx={{ width: 90 }}
                    onChange={(e) => upd({ key: e.target.value.trim() })} />
                  <TextField size="small" type="number" label="Szer." value={col.width || ''} sx={{ width: 64 }}
                    onChange={(e) => upd({ width: Math.max(0, Number(e.target.value) || 0) })} />
                  <TextField select size="small" value={col.widthUnit} sx={{ width: 60 }}
                    onChange={(e) => upd({ widthUnit: e.target.value as '%' | 'px' })}>
                    <MenuItem value="%">%</MenuItem>
                    <MenuItem value="px">px</MenuItem>
                  </TextField>
                  <Tooltip title="Szablon (opcjonalny): {{pole}} i {{env:ścieżka}}">
                    <TextField size="small" label="Szablon" value={col.template ?? ''} sx={{ width: 90 }}
                      onChange={(e) => upd({ template: e.target.value || undefined })} />
                  </Tooltip>
                  <IconButton size="small" onClick={() => save({ ...cfg, columns: cfg.columns.filter((_, j) => j !== i) })}>
                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              );
            })}
          </Stack>
          <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />} sx={{ mt: 1 }}
            onClick={() => save({ ...cfg, columns: [...cfg.columns, { key: '', label: 'Kolumna', width: 0, widthUnit: '%' }] })}>
            Dodaj kolumnę
          </Button>
        </Box>
      </Popover>
    </NodeViewWrapper>
  );
};

export const TableView = Node.create({
  name: 'tableView',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      config: {
        default: encodeConfig(DEFAULT_CONFIG),
        parseHTML: (el) => el.getAttribute('data-config') || encodeConfig(DEFAULT_CONFIG),
        renderHTML: (a) => ({ 'data-config': a.config }),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="table-view"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'table-view' })]; },
  addNodeView() { return ReactNodeViewRenderer(TableViewNodeView); },
});

export { encodeConfig, DEFAULT_CONFIG };
export default TableView;
