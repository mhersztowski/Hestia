import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import TableRowsIcon from '@mui/icons-material/TableRows';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ExtensionIcon from '@mui/icons-material/Extension';
import type { MjdDocument, MjdFieldDef, MjdFieldType } from '@hestia/core';
import { getFieldsForView } from '@hestia/core';
import { MjdVisualEditor } from './MjdVisualEditor';

export interface MjdDataEditorProps {
  definition: MjdDocument;
  value: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

// --- Field Controls ---

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: MjdFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = field.label ?? field.name;
  const helperText = field.description;

  switch (field.type) {
    case 'string':
      return (
        <TextField
          label={label}
          helperText={helperText}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          fullWidth
          size="small"
        />
      );
    case 'number':
      return (
        <TextField
          label={label}
          helperText={helperText}
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          required={field.required}
          fullWidth
          size="small"
        />
      );
    case 'boolean':
      return (
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
            />
          }
          label={<>
            {label}
            {helperText && <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{helperText}</Typography>}
          </>}
        />
      );
    case 'date':
      return (
        <TextField
          label={label}
          helperText={helperText}
          type="datetime-local"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          fullWidth
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      );
    case 'enum':
      return (
        <FormControl fullWidth size="small" required={field.required}>
          <InputLabel>{label}</InputLabel>
          <Select
            value={(value as string) ?? ''}
            label={label}
            onChange={(e) => onChange(e.target.value)}
          >
            {(field.options ?? []).map((opt) => (
              <MenuItem key={opt} value={opt}>{opt}</MenuItem>
            ))}
          </Select>
          {helperText && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>{helperText}</Typography>}
        </FormControl>
      );
    case 'array':
      return (
        <ArrayFieldControl
          field={field}
          value={value as unknown[] | undefined}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

function ArrayFieldControl({
  field,
  value,
  onChange,
}: {
  field: MjdFieldDef;
  value: unknown[] | undefined;
  onChange: (v: unknown) => void;
}) {
  const items = value ?? [];
  const itemType = field.itemType ?? 'string';
  const label = field.label ?? field.name;
  // Container ref + pending-focus index drive the "Enter to next item"
  // UX. We can't use auto-focus on the new item because <FieldControl>
  // doesn't expose a ref; instead, after the parent state update lands
  // we querySelector the inputs in document order and focus the requested
  // one. Same pattern Slack / GitHub use for tag-token inputs.
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusIndexAfterRender, setFocusIndexAfterRender] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndexAfterRender === null) return;
    const root = containerRef.current;
    if (!root) return;
    const inputs = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    const target = inputs[focusIndexAfterRender];
    if (target) {
      target.focus();
      // Select existing content on focus so re-entering an already-filled
      // item lets the user type-to-replace without manual select-all.
      if ('select' in target && typeof target.select === 'function') target.select();
    }
    setFocusIndexAfterRender(null);
  }, [focusIndexAfterRender, items.length]);

  const updateItem = (index: number, val: unknown) => {
    const next = [...items];
    next[index] = val;
    onChange(next);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    onChange([...items, getDefaultForType(itemType)]);
  };

  /** Enter in the item's input: commit (already saved via onChange) +
   *  jump to next. If we're on the last item, append a fresh one with
   *  the type's default and focus it. Shift+Enter is left untouched so
   *  multi-line text item types can still produce newlines. Checkboxes
   *  / radios are excluded so Enter keeps its native "toggle" semantics.
   */
  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    const inputType = (target as HTMLInputElement).type ?? '';
    if (inputType === 'checkbox' || inputType === 'radio' || inputType === 'button') return;
    e.preventDefault();
    if (idx === items.length - 1) {
      // Append + focus new (which lands at index = items.length AFTER add).
      onChange([...items, getDefaultForType(itemType)]);
      setFocusIndexAfterRender(items.length);
    } else {
      setFocusIndexAfterRender(idx + 1);
    }
  };

  return (
    <Box ref={containerRef}>
      <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>{label}</Typography>
      {field.description && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>{field.description}</Typography>
      )}
      {items.map((item, i) => (
        <Box
          key={i}
          sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}
          onKeyDown={(e) => handleItemKeyDown(e, i)}
        >
          <Box sx={{ flex: 1 }}>
            <FieldControl
              field={{ ...field, name: `${field.name}[${i}]`, type: itemType, label: `#${i + 1}`, description: undefined, tags: [] }}
              value={item}
              onChange={(v) => updateItem(i, v)}
            />
          </Box>
          <IconButton size="small" onClick={() => removeItem(i)} title="Remove">
            <Typography variant="body2">{'\u2715'}</Typography>
          </IconButton>
        </Box>
      ))}
      <Button size="small" onClick={addItem}>+ Add item</Button>
      {items.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1, display: 'block' }}>
          Enter \u2014 zako\u0144cz edycj\u0119 bie\u017c\u0105cego itemu i przejd\u017a do nast\u0119pnego (lub utw\u00f3rz nowy gdy jeste\u015b na ostatnim).
        </Typography>
      )}
    </Box>
  );
}

function getDefaultForType(type: MjdFieldType): unknown {
  switch (type) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'date': return '';
    case 'enum': return '';
    case 'array': return [];
  }
}

// --- Main Component ---

export function MjdDataEditor({ definition, value, onChange }: MjdDataEditorProps) {
  const [mode, setMode] = useState<'form' | 'visual' | 'blockly'>('form');
  const [selectedView, setSelectedView] = useState<string>(definition.views[0]?.name ?? '');

  const visibleFields = useMemo(() => {
    const view = definition.views.find((v) => v.name === selectedView);
    if (!view) return definition.fields;
    return getFieldsForView(definition, view.tag);
  }, [definition, selectedView]);

  const updateFieldValue = useCallback((fieldName: string, fieldValue: unknown) => {
    onChange({ ...value, [fieldName]: fieldValue });
  }, [value, onChange]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Mode toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1.5, pt: 1, pb: 0.5, flexShrink: 0 }}>
        <ToggleButtonGroup size="small" value={mode} exclusive onChange={(_, v) => v && setMode(v)}>
          <ToggleButton value="form" sx={{ gap: 0.5, px: 1.5 }}>
            <TableRowsIcon sx={{ fontSize: 15 }} />
            <Typography sx={{ fontSize: 11 }}>Form</Typography>
          </ToggleButton>
          <ToggleButton value="visual" sx={{ gap: 0.5, px: 1.5 }}>
            <AccountTreeIcon sx={{ fontSize: 15 }} />
            <Typography sx={{ fontSize: 11 }}>Visual</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* The Blockly mode is gone with Blockly; visual and form remain. */}
      {mode === 'visual' ? (
        <MjdVisualEditor value={value} onChange={onChange} height="100%" />
      ) : (
        <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
          {/* View selector */}
          {definition.views.length > 0 && (
            <FormControl size="small" sx={{ mb: 2, minWidth: 200 }}>
              <InputLabel>View</InputLabel>
              <Select
                value={selectedView}
                label="View"
                onChange={(e) => setSelectedView(e.target.value)}
              >
                {definition.views.map((v) => (
                  <MenuItem key={v.name} value={v.name}>{v.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Fields */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {visibleFields.map((field) => (
              <FieldControl
                key={field.name}
                field={field}
                value={value[field.name]}
                onChange={(v) => updateFieldValue(field.name, v)}
              />
            ))}
            {visibleFields.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No fields in this view
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
