import { useState, useMemo, useCallback, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { MjdDocument, MjdFieldDef, MjdFieldType, MjdViewDef } from '@hestia/core';
import { createMjdField, createMjdView, generateJsonSchema } from '@hestia/core';

export interface MjdDefEditorProps {
  value: MjdDocument;
  onChange: (doc: MjdDocument) => void;
  /** Optional — when provided, a "Generate data file" button appears in
   *  the Generate section. The host (typically MjdVfsLoader) decides where
   *  the sibling .data.json lands; this component just signals intent. */
  onGenerateData?: () => void | Promise<void>;
  /** When true, the Generate Data button is disabled (data file already
   *  exists). The host typically toggles this based on a VFS check. */
  dataFileExists?: boolean;
}

const FIELD_TYPES: MjdFieldType[] = ['string', 'number', 'boolean', 'date', 'enum', 'array'];

// --- Sub-components ---

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

function TagManager({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const tag = input.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput('');
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      {tags.map((t) => (
        <Chip key={t} label={t} size="small" onDelete={() => onChange(tags.filter((x) => x !== t))} />
      ))}
      <TextField
        size="small"
        placeholder="New tag..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
        sx={{ width: 120 }}
      />
      <Button size="small" onClick={addTag} disabled={!input.trim()}>Add</Button>
    </Box>
  );
}

function FieldRow({
  field,
  index,
  allTags,
  onUpdate,
  onDelete,
}: {
  field: MjdFieldDef;
  index: number;
  allTags: string[];
  onUpdate: (index: number, field: MjdFieldDef) => void;
  onDelete: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [enumInput, setEnumInput] = useState('');

  const update = (partial: Partial<MjdFieldDef>) => {
    onUpdate(index, { ...field, ...partial });
  };

  /** Enter blurs the active TextField — gives the user an explicit
   *  "I'm done editing this field" gesture. Without it the input stays
   *  focused as long as the user is interacting with the row, which
   *  feels confusing now that the row no longer collapses-on-keystroke
   *  (that "collapse" was the focus-loss bug we just fixed). Esc behaves
   *  the same way for symmetry. Shift+Enter is left untouched so multi-
   *  line text fields can still insert newlines. */
  const handleCommitOnEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  };

  const handleTypeChange = (type: MjdFieldType) => {
    const updated: Partial<MjdFieldDef> = { type };
    if (type === 'enum' && !field.options) updated.options = [];
    if (type === 'array' && !field.itemType) updated.itemType = 'string';
    if (type !== 'enum') updated.options = undefined;
    if (type !== 'array') updated.itemType = undefined;
    update(updated);
  };

  const addEnumOption = () => {
    const opt = enumInput.trim();
    if (opt && !(field.options ?? []).includes(opt)) {
      update({ options: [...(field.options ?? []), opt] });
    }
    setEnumInput('');
  };

  const toggleTag = (tag: string) => {
    const tags = field.tags.includes(tag)
      ? field.tags.filter((t) => t !== tag)
      : [...field.tags, tag];
    update({ tags });
  };

  return (
    <>
      <TableRow hover onClick={() => setExpanded(!expanded)} sx={{ cursor: 'pointer' }}>
        <TableCell>{field.name}</TableCell>
        <TableCell>
          <Chip label={field.type} size="small" variant="outlined" />
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {field.tags.map((t) => <Chip key={t} label={t} size="small" />)}
          </Box>
        </TableCell>
        <TableCell align="right">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(index); }} title="Delete">
            <Typography variant="body2">\u2715</Typography>
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={4} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
          <Collapse in={expanded}>
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Name"
                  size="small"
                  value={field.name}
                  onChange={(e) => update({ name: e.target.value })}
                  onKeyDown={handleCommitOnEnter}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Label"
                  size="small"
                  value={field.label ?? ''}
                  onChange={(e) => update({ label: e.target.value || undefined })}
                  onKeyDown={handleCommitOnEnter}
                  sx={{ flex: 1 }}
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={field.type}
                    label="Type"
                    onChange={(e) => handleTypeChange(e.target.value as MjdFieldType)}
                  >
                    {FIELD_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>

              <TextField
                label="Description"
                size="small"
                value={field.description ?? ''}
                onChange={(e) => update({ description: e.target.value || undefined })}
                onKeyDown={handleCommitOnEnter}
                helperText="Enter — zakończ edycję pola · Shift+Enter — nowa linia (gdy włączony multiline)"
                fullWidth
              />

              <FormControlLabel
                control={<Switch checked={field.required ?? false} onChange={(e) => update({ required: e.target.checked })} />}
                label="Required"
              />

              {/* Tags */}
              <Box>
                <Typography variant="caption" color="text.secondary">Tags</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {allTags.map((t) => (
                    <Chip
                      key={t}
                      label={t}
                      size="small"
                      color={field.tags.includes(t) ? 'primary' : 'default'}
                      onClick={() => toggleTag(t)}
                    />
                  ))}
                  {allTags.length === 0 && (
                    <Typography variant="caption" color="text.secondary">No tags defined yet</Typography>
                  )}
                </Box>
              </Box>

              {/* Enum options */}
              {field.type === 'enum' && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Enum options</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5, alignItems: 'center' }}>
                    {(field.options ?? []).map((opt) => (
                      <Chip
                        key={opt}
                        label={opt}
                        size="small"
                        onDelete={() => update({ options: (field.options ?? []).filter((o) => o !== opt) })}
                      />
                    ))}
                    <TextField
                      size="small"
                      placeholder="Add option..."
                      value={enumInput}
                      onChange={(e) => setEnumInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEnumOption(); } }}
                      sx={{ width: 120 }}
                    />
                    <Button size="small" onClick={addEnumOption} disabled={!enumInput.trim()}>Add</Button>
                  </Box>
                </Box>
              )}

              {/* Array item type */}
              {field.type === 'array' && (
                <FormControl size="small" sx={{ maxWidth: 200 }}>
                  <InputLabel>Item type</InputLabel>
                  <Select
                    value={field.itemType ?? 'string'}
                    label="Item type"
                    onChange={(e) => update({ itemType: e.target.value as MjdFieldType })}
                  >
                    {FIELD_TYPES.filter((t) => t !== 'array').map((t) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function ViewRow({
  view,
  index,
  allTags,
  onUpdate,
  onDelete,
}: {
  view: MjdViewDef;
  index: number;
  allTags: string[];
  onUpdate: (index: number, view: MjdViewDef) => void;
  onDelete: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <TableRow hover>
      <TableCell>
        {editing ? (
          <TextField
            size="small"
            value={view.name}
            onChange={(e) => onUpdate(index, { ...view, name: e.target.value })}
            onBlur={() => setEditing(false)}
            // Enter / Escape exit edit mode (collapse back to plain text).
            // ViewRow opens edit-on-click, so the symmetric "Enter to commit"
            // matches the implicit contract.
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                (e.target as HTMLElement).blur();
              }
            }}
            autoFocus
          />
        ) : (
          <Typography variant="body2" onClick={() => setEditing(true)} sx={{ cursor: 'pointer' }}>
            {view.name}
          </Typography>
        )}
      </TableCell>
      <TableCell>{view.type}</TableCell>
      <TableCell>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select
            value={view.tag}
            onChange={(e) => onUpdate(index, { ...view, tag: e.target.value })}
          >
            {allTags.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
        </FormControl>
      </TableCell>
      <TableCell align="right">
        <IconButton size="small" onClick={() => onDelete(index)} title="Delete">
          <Typography variant="body2">{'\u2715'}</Typography>
        </IconButton>
      </TableCell>
    </TableRow>
  );
}

// --- Main Component ---

export function MjdDefEditor({ value, onChange, onGenerateData, dataFileExists }: MjdDefEditorProps) {
  const [output, setOutput] = useState<{ type: 'mjd' | 'schema'; content: string } | null>(null);

  const updateField = useCallback((index: number, field: MjdFieldDef) => {
    const fields = [...value.fields];
    fields[index] = field;
    onChange({ ...value, fields });
  }, [value, onChange]);

  const deleteField = useCallback((index: number) => {
    onChange({ ...value, fields: value.fields.filter((_, i) => i !== index) });
  }, [value, onChange]);

  const addField = useCallback(() => {
    const name = `field${value.fields.length + 1}`;
    onChange({ ...value, fields: [...value.fields, createMjdField(name, 'string')] });
  }, [value, onChange]);

  const updateView = useCallback((index: number, view: MjdViewDef) => {
    const views = [...value.views];
    views[index] = view;
    onChange({ ...value, views });
  }, [value, onChange]);

  const deleteView = useCallback((index: number) => {
    onChange({ ...value, views: value.views.filter((_, i) => i !== index) });
  }, [value, onChange]);

  const addView = useCallback(() => {
    const tag = value.tags[0] ?? '';
    onChange({ ...value, views: [...value.views, createMjdView(`View ${value.views.length + 1}`, tag)] });
  }, [value, onChange]);

  const handleGenerateMjd = useCallback(() => {
    setOutput({ type: 'mjd', content: JSON.stringify(value, null, 2) });
  }, [value]);

  const handleGenerateSchema = useCallback(() => {
    const schema = generateJsonSchema(value);
    setOutput({ type: 'schema', content: JSON.stringify(schema, null, 2) });
  }, [value]);

  const copyOutput = useMemo(() => () => {
    if (output) navigator.clipboard?.writeText(output.content);
  }, [output]);

  return (
    <Box sx={{ p: 2 }}>
      {/* Version */}
      <Section title="Version">
        <TextField
          size="small"
          value={value.version}
          onChange={(e) => onChange({ ...value, version: e.target.value })}
          // Symmetric with FieldRow / ViewRow inputs — Enter / Esc blur the
          // field so user has an explicit "I'm done editing" gesture.
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              (e.target as HTMLElement).blur();
            }
          }}
          sx={{ width: 120 }}
        />
      </Section>

      {/* Tags */}
      <Section title="Tags">
        <TagManager tags={value.tags} onChange={(tags) => onChange({ ...value, tags })} />
      </Section>

      {/* Fields */}
      <Section title="Fields" action={<Button size="small" onClick={addField}>+ Add Field</Button>}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Tags</TableCell>
              <TableCell align="right" width={50} />
            </TableRow>
          </TableHead>
          <TableBody>
            {value.fields.map((field, i) => (
              <FieldRow
                // Index-only key. The previous `${field.name}-${i}` composite
                // changed on every keystroke in the Name TextField (`name`
                // goes from '' → 'n' → 'na' …), which made React unmount the
                // whole row + mount a fresh one — the inner input lost focus
                // after every single character typed. Index is stable for the
                // lifetime of a field; reordering isn't supported in this UI
                // so the "swap drops focus" caveat of index keys doesn't apply.
                key={i}
                field={field}
                index={i}
                allTags={value.tags}
                onUpdate={updateField}
                onDelete={deleteField}
              />
            ))}
            {value.fields.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary">No fields defined</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Section>

      {/* Views */}
      {/* The "+ Add View" button is disabled until the schema has at least
          one tag, because every view is bound to a tag (it's how views
          filter fields). Without the tooltip wrapper the disabled state
          looked broken — clicking did nothing, no feedback. Now hovering
          tells the user exactly what they need to do. */}
      <Section
        title="Views"
        action={
          <Tooltip title={value.tags.length === 0 ? 'Dodaj co najmniej jeden tag w sekcji "Tags" aby utworzyć view (każdy view musi być powiązany z tagiem)' : ''}>
            {/* span wrapper required by MUI Tooltip on disabled children */}
            <span>
              <Button size="small" onClick={addView} disabled={value.tags.length === 0}>+ Add View</Button>
            </span>
          </Tooltip>
        }
      >
        {value.tags.length === 0 && (
          <Alert severity="info" sx={{ mb: 1 }}>
            Aby dodać view, najpierw zdefiniuj co najmniej jeden tag w sekcji <strong>Tags</strong> powyżej.
            Każdy view filtruje pola po tagu — bez tagów nie ma czego pokazać.
          </Alert>
        )}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Tag</TableCell>
              <TableCell align="right" width={50} />
            </TableRow>
          </TableHead>
          <TableBody>
            {value.views.map((view, i) => (
              <ViewRow
                // Same fix as FieldRow above — composite key on `view.name`
                // remounted the row after every typed character in the name
                // field, killing focus. Index is stable per row in this UI.
                key={i}
                view={view}
                index={i}
                allTags={value.tags}
                onUpdate={updateView}
                onDelete={deleteView}
              />
            ))}
            {value.views.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary">
                    {value.tags.length === 0
                      ? 'Brak views — najpierw dodaj tag.'
                      : 'Brak views. Kliknij "+ Add View" powyżej.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Section>

      {/* Actions */}
      <Section title="Generate">
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" size="small" onClick={handleGenerateMjd}>Generate .mjd</Button>
          <Button variant="outlined" size="small" onClick={handleGenerateSchema}>Generate JSON Schema</Button>
          {/* Data-file generator — host wires this up (typically
              MjdVfsLoader) to write a sibling `.data.json` populated with
              `buildDefaults(definition)`. We only show the button when the
              host has connected the callback. */}
          {onGenerateData && (
            // Always enabled. The button used to disable itself when a
            // sibling `.data.json` existed, but that prevented the obvious
            // "I want a SECOND data file for this same schema with a
            // different name" workflow. Now we just hint via tooltip that
            // a sibling already exists and the dialog will propose a
            // numbered fallback name (places-2.data.json, places-3.data.json…).
            <Tooltip title={
              dataFileExists
                ? 'Sibling .data.json już istnieje — okno zaproponuje inną nazwę. Zawsze możesz wpisać własną.'
                : 'Utwórz plik .data.json z domyślnymi wartościami; możesz wybrać dowolną nazwę i lokalizację.'
            }>
              <Button
                variant="contained"
                size="small"
                color="primary"
                onClick={() => void onGenerateData()}
              >
                Utwórz plik danych (.data.json)
              </Button>
            </Tooltip>
          )}
        </Box>
      </Section>

      {/* Output */}
      {output && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2">
              {output.type === 'mjd' ? 'MJD Definition' : 'JSON Schema (draft-07)'}
            </Typography>
            <Button size="small" onClick={copyOutput}>Copy</Button>
            <Button size="small" onClick={() => setOutput(null)}>Close</Button>
          </Box>
          <Box
            sx={{
              bgcolor: '#1e1e1e',
              color: '#d4d4d4',
              p: 2,
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre',
              overflow: 'auto',
              maxHeight: 400,
            }}
          >
            {output.content}
          </Box>
        </Box>
      )}
    </Box>
  );
}
