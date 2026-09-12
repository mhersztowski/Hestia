/**
 * Insert a task-linked event into the markdown document.
 *
 * Opened from the `/event` slash command. Lists the user's tasks (pulled
 * from useFilesystem's DataSource) in an autocomplete; once picked, the
 * event name defaults to the task name and the description is pre-filled
 * with the task's own description so the user only has to set the time.
 *
 * Output is a markdown blockquote — renders the same in any viewer:
 *
 *   > 📅 **2026-06-10 14:00 — 15:30** · Code review
 *   > 🔗 Zadanie: **Faza I** (Projekt X)
 *   > Notes about the meeting…
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Paper, Stack, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import { useEditorFiles, useEditorSession } from './capabilities';
import EventTemplateManager from './EventTemplateManager';
import type { EventTemplate, ResolvedEvent } from './eventTemplates';
import {
  applyTemplate, dateToInputValue, inputValueToDate, loadTemplates,
  makeTemplateId, offsetLabel, parseDateFromPath,
} from './eventTemplates';
import { useTaskOptions, type TaskOption } from './useTaskOptions';

export interface EventBlockAttrs {
  eventName: string;
  start: string;
  end: string;
  description: string;
  taskId: string;
  taskName: string;
  projectName: string;
}

export interface EventDialogResult {
  /** Markdown block — used by callers that want the legacy text format. */
  markdown: string;
  /** Structured attrs — used to populate the EventBlock TipTap node. */
  attrs: EventBlockAttrs;
}

export interface EventDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called once per inserted event. In single-event mode this fires exactly
   *  once; in template mode it falls back to firing N times only when no
   *  `onInsertMany` is provided. */
  onInsert: (result: EventDialogResult) => void;
  /** Optional batch insert — when provided, template-mode bulk uses this in
   *  place of looping `onInsert`. Necessary because consecutive `insertContent`
   *  calls into an atom-node-typed editor (TipTap with EventBlock atom) can
   *  leave the cursor *on* the just-inserted node; the next call then replaces
   *  rather than appends, swallowing all but the first event. Inserting all
   *  nodes in a single `chain()` sidesteps the issue. */
  onInsertMany?: (results: EventDialogResult[]) => void;
  /** Pre-fill form fields — used when editing an existing EventBlock. */
  initial?: Partial<EventBlockAttrs>;
  /** Current document path (e.g. `Calendar/2026/06/05.md`). Used to derive
   *  the base date in template mode — falls back to today when not provided
   *  or the path doesn't follow the `yyyy/mm/dd` convention. */
  filePath?: string;
}

/** Local datetime → ISO-ish for display (`2026-06-10 14:00`). */
function fmtDate(value: string): string {
  if (!value) return '';
  // datetime-local gives `YYYY-MM-DDTHH:mm`; just swap the T for a space.
  return value.replace('T', ' ');
}

/** Default datetime-local value: next round hour from now. */
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  // 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EventDialog: React.FC<EventDialogProps> = ({
  open, onClose, onInsert, onInsertMany, initial, filePath,
}) => {
  const { tasks, projectName } = useTaskOptions(open);
  const userName = useEditorSession()?.userName ?? '';
  const files = useEditorFiles();

  // Editing-mode (initial set) skips the template tab — it doesn't make sense
  // to "bulk-insert from template" when the user wanted to tweak a single
  // existing event card. Plain insert mode shows both tabs.
  const isEditMode = Boolean(initial);
  const [mode, setMode] = useState<'single' | 'template'>('single');

  // Template tab state ----------------------------------------------------
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [baseDateInput, setBaseDateInput] = useState(''); // YYYY-MM-DD
  const [managerOpen, setManagerOpen] = useState(false);
  // Seed for "save current single event as new template" — populated only
  // when the user clicks that button, then handed off to the manager.
  const [managerSeed, setManagerSeed] = useState<EventTemplate | undefined>(undefined);

  // Try to derive the base date from the document path; fall back to today
  // when the path doesn't follow the `yyyy/mm/dd` daily-journal convention.
  useEffect(() => {
    if (!open) return;
    const fromPath = parseDateFromPath(filePath);
    setBaseDateInput(dateToInputValue(fromPath ?? new Date()));
  }, [open, filePath]);

  const refreshTemplates = async () => {
    if (!userName) { setTemplates([]); return; }
    setTemplatesLoading(true);
    try {
      const list = await loadTemplates(files);
      setTemplates(list);
      // Auto-select the first template if nothing's chosen yet.
      setSelectedTemplateId(prev => prev || list[0]?.id || '');
    } catch (err) {
      console.warn('[EventDialog] template load failed:', err);
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Lazy-load templates only when the user actually opens the template tab —
  // saves a VFS round-trip for users who only insert single events.
  useEffect(() => {
    if (open && mode === 'template' && templates.length === 0 && !templatesLoading) {
      void refreshTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  // ------------------------------------------------------------------------

  // Form state — `task` may be null (no task chosen, manual event).
  const [task, setTask] = useState<TaskOption | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState('');
  const [description, setDescription] = useState('');

  // Reset / preload whenever the dialog opens — use `initial` props (passed
  // when editing an existing EventBlock node) to bring the form back to the
  // saved state instead of defaults.
  useEffect(() => {
    if (!open) return;
    setName(initial?.eventName ?? '');
    setStart(initial?.start || defaultStart());
    setEnd(initial?.end ?? '');
    setDescription(initial?.description ?? '');
    if (initial?.taskId) {
      // Build a synthetic task option matching the saved id so the picker
      // shows the linked task right away (even if DataSource isn't loaded yet).
      setTask({
        id: initial.taskId,
        name: initial.taskName ?? '',
        projectName: initial.projectName,
      });
    } else {
      setTask(null);
    }
  }, [open, initial]);

  // When the user picks a task, pre-fill event name + description from it.
  // Only overwrite when those fields are still default-empty so we don't
  // clobber typing-in-progress.
  useEffect(() => {
    if (!task) return;
    setName((curr) => curr || task.name);
    setDescription((curr) => curr || task.description || '');
  }, [task]);

  const handleInsert = () => {
    const projName = task ? projectName(task.projectId) ?? task.projectName ?? '' : '';
    // Legacy markdown blockquote — kept for backward compatibility / hosts
    // that prefer the plain-text version of an event.
    const dateLine = end
      ? `📅 **${fmtDate(start)} — ${fmtDate(end)}** · ${name || '(bez nazwy)'}`
      : `📅 **${fmtDate(start)}** · ${name || '(bez nazwy)'}`;
    const lines: string[] = [`> ${dateLine}`];
    if (task) {
      const projSuffix = projName ? ` (${projName})` : '';
      lines.push(`> 🔗 Zadanie: **${task.name}**${projSuffix}`);
    }
    if (description.trim()) {
      for (const ln of description.trim().split('\n')) lines.push(`> ${ln}`);
    }
    const markdown = lines.join('\n') + '\n\n';
    // Structured attrs — fed straight into the EventBlock TipTap node.
    const attrs: EventBlockAttrs = {
      eventName: name,
      start,
      end,
      description,
      taskId: task?.id ?? '',
      taskName: task?.name ?? '',
      projectName: projName,
    };
    onInsert({ markdown, attrs });
    onClose();
  };

  // Computed list of resolved events for the currently-selected template,
  // applied against the picked base date. Memoised because applyTemplate
  // does a small loop per render and EventDialog rerenders on every keystroke
  // in the single-event tab too.
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;
  const resolvedEvents: ResolvedEvent[] = useMemo(() => {
    if (!selectedTemplate) return [];
    const baseDate = inputValueToDate(baseDateInput) ?? new Date();
    return applyTemplate(selectedTemplate, baseDate);
  }, [selectedTemplate, baseDateInput]);

  /** Bulk-insert every resolved event by calling `onInsert` once per item.
   *  The host (MdEditor) appends each as a separate EventBlock node, so the
   *  result is a vertical stack of cards in the document. */
  const handleInsertTemplate = () => {
    if (!selectedTemplate || resolvedEvents.length === 0) return;
    // Build all results first, then dispatch in one shot — atomicity matters
    // when the host uses onInsertMany (single TipTap chain) so all blocks
    // share one transaction and end up as siblings in the doc.
    const results: EventDialogResult[] = resolvedEvents.map((ev) => {
      const attrs: EventBlockAttrs = {
        eventName: ev.name,
        start: ev.start,
        end: ev.end,
        description: ev.description,
        taskId: ev.taskId,
        taskName: ev.taskName,
        projectName: ev.projectName,
      };
      const dateLine = ev.end
        ? `📅 **${fmtDate(ev.start)} — ${fmtDate(ev.end)}** · ${ev.name || '(bez nazwy)'}`
        : `📅 **${fmtDate(ev.start)}** · ${ev.name || '(bez nazwy)'}`;
      const lines: string[] = [`> ${dateLine}`];
      if (ev.taskName) {
        const projSuffix = ev.projectName ? ` (${ev.projectName})` : '';
        lines.push(`> 🔗 Zadanie: **${ev.taskName}**${projSuffix}`);
      }
      if (ev.description.trim()) {
        for (const ln of ev.description.trim().split('\n')) lines.push(`> ${ln}`);
      }
      const markdown = lines.join('\n') + '\n\n';
      return { markdown, attrs };
    });
    if (onInsertMany) {
      onInsertMany(results);
    } else {
      // Legacy fallback — hosts that don't pass onInsertMany take the loop.
      // Documented to have the "only first block inserted" failure mode for
      // atom-node hosts, but kept for backward compat with non-atom hosts.
      for (const r of results) onInsert(r);
    }
    onClose();
  };

  /** Hand the currently-edited single event off to the template manager as
   *  a seed for a new template — saves the user from re-typing when they
   *  want to "save this for next time". */
  const handleSaveAsTemplate = () => {
    if (!name && !description) {
      // eslint-disable-next-line no-alert
      alert('Wypełnij najpierw nazwę lub opis eventu.');
      return;
    }
    const baseDate = inputValueToDate(baseDateInput) ?? new Date();
    // Convert the absolute datetime back to a relative offset by diffing the
    // calendar days between start and baseDate. Time-of-day is taken straight
    // from the start string.
    const startDate = start ? new Date(start) : new Date(baseDate);
    const dayMs = 24 * 60 * 60 * 1000;
    const startMidnight = new Date(startDate); startMidnight.setHours(0, 0, 0, 0);
    const baseMidnight = new Date(baseDate);   baseMidnight.setHours(0, 0, 0, 0);
    const dayOffset = Math.round((startMidnight.getTime() - baseMidnight.getTime()) / dayMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    const time = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
    let durationMinutes = 60;
    if (end) {
      const endDate = new Date(end);
      durationMinutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
    }
    const seedProjName = task ? projectName(task.projectId) ?? task.projectName ?? '' : '';
    const seed: EventTemplate = {
      id: makeTemplateId(),
      name: name || 'Nowy szablon',
      description: '',
      items: [{
        name: name || '(bez nazwy)',
        dayOffset,
        time,
        durationMinutes,
        description,
        taskId: task?.id,
        taskName: task?.name,
        projectName: seedProjName,
      }],
    };
    setManagerSeed(seed);
    setManagerOpen(true);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <EventIcon /> {isEditMode ? 'Edytuj event' : 'Wstaw event'}
      </DialogTitle>

      {/* Tabs let the user switch between "single event" (existing flow) and
          "bulk from template" (new). Hidden in edit mode — bulk doesn't make
          sense when there's a specific event to modify. */}
      {!isEditMode && (
        <Tabs
          value={mode}
          onChange={(_, v) => setMode(v)}
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="single" label="Pojedynczy event" />
          <Tab value="template" label="Z szablonu" />
        </Tabs>
      )}

      <DialogContent>
        {mode === 'template' ? (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Base date — auto-derived from filePath when it matches
                `…/yyyy/mm/dd.md`, otherwise today. Manual override always
                possible because users sometimes work on tomorrow's schedule
                from today's note. */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <TextField
                label="Bazowa data"
                type="date"
                value={baseDateInput}
                onChange={(e) => setBaseDateInput(e.target.value)}
                size="small"
                sx={{ width: { xs: '100%', sm: 200 } }}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText={parseDateFromPath(filePath)
                  ? 'Auto z nazwy pliku'
                  : 'Plik nie ma daty w nazwie — domyślnie dziś'}
              />
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Odśwież listę szablonów">
                <IconButton size="small" onClick={() => void refreshTemplates()}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Button
                size="small"
                startIcon={<SettingsIcon />}
                onClick={() => { setManagerSeed(undefined); setManagerOpen(true); }}
              >
                Zarządzaj
              </Button>
            </Stack>

            {/* Template picker — disabled when there's nothing to pick. */}
            <TextField
              select
              label="Szablon"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              size="small"
              disabled={templates.length === 0}
              helperText={templates.length === 0
                ? (templatesLoading ? 'Ładowanie…' : 'Brak szablonów — utwórz przez Zarządzaj')
                : `${selectedTemplate?.items.length ?? 0} eventów`}
            >
              {templates.map(t => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name} ({t.items.length})
                </MenuItem>
              ))}
            </TextField>

            {selectedTemplate?.description && (
              <Typography variant="caption" color="text.secondary">
                {selectedTemplate.description}
              </Typography>
            )}

            {/* Preview — concrete dates after applying baseDate. Empty state
                guides the user when no template is selected yet. */}
            {selectedTemplate && resolvedEvents.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 280, overflow: 'auto' }}>
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                  Podgląd ({resolvedEvents.length} {resolvedEvents.length === 1 ? 'event' : 'eventów'})
                </Typography>
                <Stack spacing={0.75}>
                  {resolvedEvents.map((ev, i) => {
                    const item = selectedTemplate.items[i];
                    return (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Chip
                          label={offsetLabel(item.dayOffset)}
                          size="small"
                          variant="outlined"
                          sx={{ minWidth: 78, fontSize: 11 }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {ev.name || '(bez nazwy)'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            📅 {fmtDate(ev.start)}{ev.end && ` — ${fmtDate(ev.end)}`}
                          </Typography>
                          {ev.taskName && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                              🔗 {ev.taskName}{ev.projectName && ` (${ev.projectName})`}
                            </Typography>
                          )}
                          {ev.description && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
                              {ev.description}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            )}
          </Stack>
        ) : (
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Task picker — freeSolo so the user can still build an event
              without referencing a task, or when DataSource is empty
              (no tasks yet / MQTT load failed). */}
          <Autocomplete
            options={tasks}
            value={task}
            onChange={(_, v) => setTask(v)}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => (
              <TextField {...params} label="Zadanie z PIM/Projects"
                helperText={tasks.length === 0
                  ? 'Brak zadań w DataSource — możesz pominąć i wpisać event ręcznie'
                  : `${tasks.length} dostępnych zadań`}
              />
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

          <TextField
            label="Nazwa eventu"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            placeholder={task?.name || 'np. Spotkanie z zespołem'}
          />

          <Stack direction="row" spacing={1}>
            <TextField
              label="Start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Koniec (opcjonalnie)"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          <TextField
            label="Opis (opcjonalnie)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth multiline rows={3}
          />

          {/* Preview */}
          <Alert severity="info" icon={<EventIcon />} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
            <Typography variant="caption" component="div" sx={{ mb: 0.5, fontWeight: 600 }}>
              Podgląd
            </Typography>
            <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
{`> 📅 **${end ? `${fmtDate(start)} — ${fmtDate(end)}` : fmtDate(start)}** · ${name || '(bez nazwy)'}${task ? `\n> 🔗 Zadanie: **${task.name}**${projectName(task.projectId) ? ` (${projectName(task.projectId)})` : ''}` : ''}${description.trim() ? `\n> ${description.trim().split('\n').join('\n> ')}` : ''}`}
            </Box>
          </Alert>
        </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {/* "Save as template" is a single-mode helper — it doesn't insert
            anything, just hands the current form state to the manager as a
            seed for a new template. Hidden in edit mode (the event already
            exists in the document — saving it as a template separately would
            be unusual flow). */}
        {mode === 'single' && !isEditMode && (
          <Tooltip title="Zapisz aktualny event jako nowy szablon">
            <span>
              <Button
                size="small"
                startIcon={<BookmarkAddIcon />}
                onClick={handleSaveAsTemplate}
                disabled={!start || !name}
              >
                Zapisz jako szablon
              </Button>
            </span>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Anuluj</Button>
        {mode === 'single' ? (
          <Button variant="contained" onClick={handleInsert} disabled={!start}>
            Wstaw event
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleInsertTemplate}
            startIcon={<LibraryAddIcon />}
            disabled={!selectedTemplate || resolvedEvents.length === 0}
          >
            Wstaw {resolvedEvents.length || ''} eventów
          </Button>
        )}
      </DialogActions>

      {/* Sub-dialog: full CRUD for templates. Reusing the manager component
          keeps the schema in one place — both the "Zarządzaj" button and
          the "Save as template" path mount this. */}
      <EventTemplateManager
        open={managerOpen}
        onClose={() => { setManagerOpen(false); setManagerSeed(undefined); }}
        userName={userName}
        seedTemplate={managerSeed}
        onSaved={(list) => {
          setTemplates(list);
          // After saving a fresh seed, select it so the preview pops up.
          if (managerSeed) setSelectedTemplateId(managerSeed.id);
          setMode('template');
        }}
      />
    </Dialog>
  );
};

export default EventDialog;
