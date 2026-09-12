/**
 * Modal CRUD for event templates — opens on top of EventDialog when the user
 * clicks "Zarządzaj szablonami". A template is just a list of relative event
 * items (day offset + time + duration + name); concrete dates are computed
 * later by `applyTemplate(template, baseDate)`.
 *
 * Keeps its own draft state so the user can rearrange/edit items freely and
 * commit/discard with explicit buttons — partial in-place edits without a
 * confirm step would be confusing when the template list is also reused on
 * disk (`mdeditor/event-templates.json`).
 */

import React, { useEffect, useState } from 'react';
import {
  Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, List, ListItemButton, ListItemText, Paper,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { EventTemplate, EventTemplateItem } from './eventTemplates';
import { loadTemplates, makeTemplateId, offsetLabel, saveTemplates } from './eventTemplates';
import { useEditorFiles } from './capabilities';
import { useTaskOptions, type TaskOption } from './useTaskOptions';

export interface EventTemplateManagerProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  /** Lets the host (EventDialog) auto-select a freshly created template. */
  onSaved?: (templates: EventTemplate[]) => void;
  /** Optional seed — used when the user clicks "Zapisz jako nowy szablon"
   *  in EventDialog with a single event already filled in. */
  seedTemplate?: EventTemplate;
}

function emptyItem(): EventTemplateItem {
  return { name: '', dayOffset: 0, time: '09:00', durationMinutes: 60, description: '' };
}

function emptyTemplate(): EventTemplate {
  return { id: makeTemplateId(), name: 'Nowy szablon', description: '', items: [emptyItem()] };
}

/** Human-friendly duration label shown under the hours input. Splits exact
 *  hour:minute pairs ("1h 30 min") and falls back to plain minutes for sub-
 *  hour values ("45 min"). Zero/undefined → "bez końca" because in the model
 *  durationMinutes=0 means no explicit end time. */
function formatDuration(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return 'Pusto = bez końca';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

const EventTemplateManager: React.FC<EventTemplateManagerProps> = ({
  open, onClose, userName, onSaved, seedTemplate,
}) => {
  const files = useEditorFiles();
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Tasks/projects come from the same DataSource as the single-event picker —
  // so a template item can be linked to a task and the eventual EventBlock
  // card will show that link just like a manually-built event.
  const { tasks, projectName } = useTaskOptions(open);

  // Initial load when the dialog opens — preload from VFS, then if the host
  // passed a `seedTemplate` (user wants to save the in-progress single event
  // as a new template), append it and auto-select.
  useEffect(() => {
    if (!open || !userName) return;
    let cancelled = false;
    setLoading(true);
    loadTemplates(files)
      .then((list) => {
        if (cancelled) return;
        if (seedTemplate) {
          // Avoid duplicating if the user re-opens the manager — we keyed on
          // id, so seed always uses a new uuid and we treat it as additive.
          const next = [...list, seedTemplate];
          setTemplates(next);
          setActiveId(seedTemplate.id);
          setDirty(true);
        } else {
          setTemplates(list);
          setActiveId(list[0]?.id ?? null);
        }
      })
      .catch((err) => console.warn('[EventTemplateManager] load failed:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, userName, seedTemplate, files]);

  const active = templates.find(t => t.id === activeId) ?? null;

  /** Patch the currently-active template — `setTemplates` re-references the
   *  array so React picks up the change; immutability matters here for the
   *  selected-template render to refresh. */
  const updateActive = (mut: (t: EventTemplate) => EventTemplate) => {
    if (!active) return;
    setTemplates(prev => prev.map(t => t.id === active.id ? mut(t) : t));
    setDirty(true);
  };

  const addTemplate = () => {
    const t = emptyTemplate();
    setTemplates(prev => [...prev, t]);
    setActiveId(t.id);
    setDirty(true);
  };

  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (activeId === id) setActiveId(null);
    setDirty(true);
  };

  const duplicateTemplate = (id: string) => {
    const src = templates.find(t => t.id === id);
    if (!src) return;
    const copy: EventTemplate = {
      ...src,
      id: makeTemplateId(),
      name: `${src.name} (kopia)`,
      items: src.items.map(it => ({ ...it })),
    };
    setTemplates(prev => [...prev, copy]);
    setActiveId(copy.id);
    setDirty(true);
  };

  const addItem = () => updateActive(t => ({ ...t, items: [...t.items, emptyItem()] }));

  const updateItem = (idx: number, patch: Partial<EventTemplateItem>) => {
    updateActive(t => ({
      ...t,
      items: t.items.map((it, i) => i === idx ? { ...it, ...patch } : it),
    }));
  };

  const removeItem = (idx: number) => {
    updateActive(t => ({ ...t, items: t.items.filter((_, i) => i !== idx) }));
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    updateActive(t => {
      const next = [...t.items];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return t;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...t, items: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveTemplates(files, templates);
      setDirty(false);
      onSaved?.(templates);
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Nie zapisano szablonów: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (dirty && !window.confirm('Masz niezapisane zmiany. Zamknąć bez zapisu?')) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Szablony eventów</DialogTitle>
      <DialogContent>
        {loading ? (
          <Typography variant="body2" sx={{ p: 2 }}>Ładowanie…</Typography>
        ) : (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 1, minHeight: 400 }}>

            {/* Left: list of templates */}
            <Paper variant="outlined" sx={{ width: { md: 240 }, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <Stack direction="row" alignItems="center" sx={{ p: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
                  Szablony ({templates.length})
                </Typography>
                <Tooltip title="Dodaj szablon">
                  <IconButton size="small" onClick={addTemplate}><AddIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Stack>
              <Divider />
              <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
                {templates.length === 0 && (
                  <Typography variant="caption" sx={{ p: 2, display: 'block', color: 'text.secondary' }}>
                    Brak szablonów. Kliknij + powyżej.
                  </Typography>
                )}
                {templates.map(t => (
                  <ListItemButton
                    key={t.id}
                    selected={t.id === activeId}
                    onClick={() => setActiveId(t.id)}
                    sx={{ pr: 0.5 }}
                  >
                    <ListItemText
                      primary={t.name || '(bez nazwy)'}
                      secondary={`${t.items.length} ${t.items.length === 1 ? 'event' : 'eventów'}`}
                      slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                    />
                    <Stack direction="row" spacing={0}>
                      <Tooltip title="Duplikuj">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); duplicateTemplate(t.id); }}>
                          <ContentCopyIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Usuń">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }}>
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </ListItemButton>
                ))}
              </List>
            </Paper>

            {/* Right: editor for the selected template */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {!active ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  Wybierz szablon z listy po lewej lub dodaj nowy.
                </Typography>
              ) : (
                <Stack spacing={2}>
                  <TextField
                    label="Nazwa szablonu"
                    value={active.name}
                    onChange={(e) => updateActive(t => ({ ...t, name: e.target.value }))}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Opis (opcjonalnie)"
                    value={active.description ?? ''}
                    onChange={(e) => updateActive(t => ({ ...t, description: e.target.value }))}
                    fullWidth
                    size="small"
                    multiline
                    rows={2}
                  />

                  <Stack direction="row" alignItems="center">
                    <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
                      Eventy ({active.items.length})
                    </Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={addItem}>
                      Dodaj event
                    </Button>
                  </Stack>

                  {active.items.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Pusty szablon — dodaj pierwszy event.
                    </Typography>
                  )}

                  {active.items.map((item, idx) => {
                    // Selected task = either a live option (from DataSource) or a
                    // synthetic one built from saved fields. The synthetic path
                    // matters because templates outlive task deletions and we
                    // don't want the picker to silently go blank.
                    const liveTask = item.taskId ? tasks.find(t => t.id === item.taskId) : undefined;
                    const selectedTask: TaskOption | null = liveTask ?? (item.taskId ? {
                      id: item.taskId,
                      name: item.taskName ?? '(usunięte zadanie)',
                      projectName: item.projectName,
                    } : null);
                    return (
                    <Paper key={idx} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 28 }}>
                            #{idx + 1}
                          </Typography>
                          <TextField
                            label="Nazwa eventu"
                            value={item.name}
                            onChange={(e) => updateItem(idx, { name: e.target.value })}
                            size="small"
                            fullWidth
                          />
                          <Tooltip title="Przesuń wyżej">
                            <span>
                              <IconButton size="small" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                                <ArrowUpwardIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Przesuń niżej">
                            <span>
                              <IconButton size="small" disabled={idx === active.items.length - 1} onClick={() => moveItem(idx, 1)}>
                                <ArrowDownwardIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Usuń event">
                            <IconButton size="small" onClick={() => removeItem(idx)}>
                              <DeleteIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        </Stack>

                        {/* Task picker — mirrors the single-event flow. Snapshot
                            the task's name + project at link time so the template
                            remains usable even if the task is renamed/deleted. */}
                        <Autocomplete
                          options={tasks}
                          value={selectedTask}
                          onChange={(_, v) => {
                            if (!v) {
                              updateItem(idx, { taskId: '', taskName: '', projectName: '' });
                              return;
                            }
                            const projName = projectName(v.projectId) ?? v.projectName ?? '';
                            // If the event name is still empty, pre-fill it with
                            // the task name — same UX shortcut as in EventDialog.
                            const patch: Partial<EventTemplateItem> = {
                              taskId: v.id,
                              taskName: v.name,
                              projectName: projName,
                            };
                            if (!item.name) patch.name = v.name;
                            if (!item.description && v.description) patch.description = v.description;
                            updateItem(idx, patch);
                          }}
                          getOptionLabel={(o) => o.name}
                          isOptionEqualToValue={(o, v) => o.id === v.id}
                          size="small"
                          renderInput={(params) => (
                            <TextField {...params} label="Zadanie z PIM/Projects (opcjonalnie)" />
                          )}
                          renderOption={(props, option) => {
                            const projName = projectName(option.projectId);
                            return (
                              <Box component="li" {...props}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography variant="body2" noWrap>{option.name}</Typography>
                                  {projName && (
                                    <Typography variant="caption" color="text.secondary" noWrap>
                                      {projName}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            );
                          }}
                        />

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                          <TextField
                            label="Dzień (offset)"
                            type="number"
                            value={item.dayOffset}
                            onChange={(e) => updateItem(idx, { dayOffset: parseInt(e.target.value, 10) || 0 })}
                            size="small"
                            sx={{ width: 130 }}
                            helperText={offsetLabel(item.dayOffset)}
                          />
                          <TextField
                            label="Godzina"
                            type="time"
                            value={item.time}
                            onChange={(e) => updateItem(idx, { time: e.target.value })}
                            size="small"
                            sx={{ width: 130 }}
                            slotProps={{ inputLabel: { shrink: true } }}
                            helperText="Puste = cały dzień"
                          />
                          <TextField
                            label="Czas trwania (h)"
                            type="number"
                            value={
                              item.durationMinutes && item.durationMinutes > 0
                                // Strip trailing zeros so 60 min → "1" not "1.00"
                                ? String(+(item.durationMinutes / 60).toFixed(4))
                                : ''
                            }
                            onChange={(e) => {
                              // Accept both `.` and `,` as decimal separators —
                              // polish keyboards default to comma and `<input
                              // type="number">` silently rejects it without us
                              // ever seeing the change.
                              const raw = e.target.value.replace(',', '.');
                              if (raw === '') {
                                updateItem(idx, { durationMinutes: 0 });
                                return;
                              }
                              const hours = parseFloat(raw);
                              if (isNaN(hours) || hours < 0) return;
                              // Store as minutes (int) — keeps the schema clean
                              // and sidesteps float precision drift on subsequent
                              // edits (0.1h + 0.2h would otherwise become 18.0000001).
                              updateItem(idx, { durationMinutes: Math.round(hours * 60) });
                            }}
                            size="small"
                            sx={{ width: 160 }}
                            slotProps={{
                              htmlInput: { step: 0.25, min: 0, inputMode: 'decimal' },
                              inputLabel: { shrink: true },
                            }}
                            placeholder="np. 1.5"
                            helperText={formatDuration(item.durationMinutes)}
                          />
                        </Stack>

                        <TextField
                          label="Opis (opcjonalnie)"
                          value={item.description ?? ''}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          size="small"
                          multiline
                          rows={2}
                          fullWidth
                        />
                      </Stack>
                    </Paper>
                    );
                  })}
                </Stack>
              )}
            </Box>

          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Anuluj</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          startIcon={<SaveIcon />}
          disabled={saving || !dirty}
        >
          {saving ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EventTemplateManager;
