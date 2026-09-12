/**
 * EventBlock — TipTap atom node rendering a structured calendar event card
 * inside the markdown editor. The card pulls its data from the slash-command
 * `/event` dialog and persists into markdown as a `event` code fence with
 * JSON attrs (see markdownConverter's escapeEventsForHtml / restoreEventsFromHtml).
 *
 * Why an atom node instead of plain markdown blockquote?
 *   - Always visible as a nice card (icon, title, time, task link), not raw
 *     text that the user has to read.
 *   - Edit-in-place by clicking the pencil — reopens the EventDialog with
 *     the current values, saves back through updateAttributes.
 *   - Survives editor round-trips losslessly: the JSON in the fence is the
 *     source of truth, and the card always re-renders from those attrs.
 */

import { useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps,
} from '@tiptap/react';
import {
  Box, IconButton, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import EventDialog from '../EventDialog';

export interface EventBlockAttrs {
  eventName: string;
  start: string;          // ISO-ish `YYYY-MM-DDTHH:mm`
  end: string;            // optional, same format or ''
  description: string;
  taskId: string;
  taskName: string;
  projectName: string;
}

/** `2026-06-05T14:00` → `2026-06-05 14:00` (more human-friendly). */
function prettyDate(value: string): string {
  if (!value) return '';
  return value.replace('T', ' ');
}

function EventBlockNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const attrs = node.attrs as EventBlockAttrs;
  const [editing, setEditing] = useState(false);

  return (
    // `data-start` / `data-end` are mirrored onto the runtime wrapper so the
    // "now marker" overlay (TodayNowMarker.tsx) can scan the document for
    // event blocks and position itself relative to them — without it the
    // marker would have to peek into TipTap state, which it doesn't see.
    <NodeViewWrapper
      data-event-block
      data-start={attrs.start || undefined}
      data-end={attrs.end || undefined}
    >
      <Paper
        variant="outlined"
        sx={{
          my: 1, p: 1.5,
          borderLeft: '4px solid', borderLeftColor: 'primary.main',
          bgcolor: 'background.paper',
          // Atoms render inline-block by default — force full width so the
          // card stretches like a normal block.
          display: 'block',
        }}
      >
        <Stack direction="row" alignItems="flex-start" gap={1.5}>
          <EventIcon color="primary" sx={{ mt: 0.25 }} />

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {attrs.eventName || '(bez nazwy)'}
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              📅 {prettyDate(attrs.start)}
              {attrs.end && ` — ${prettyDate(attrs.end)}`}
            </Typography>

            {attrs.taskName && (
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
                <LinkIcon fontSize="inherit" sx={{ color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  Zadanie: <strong>{attrs.taskName}</strong>
                  {attrs.projectName && ` (${attrs.projectName})`}
                </Typography>
              </Stack>
            )}

            {attrs.description && (
              <Typography
                variant="body2"
                sx={{ mt: 1, whiteSpace: 'pre-wrap', color: 'text.primary' }}
              >
                {attrs.description}
              </Typography>
            )}
          </Box>

          <Stack direction="row" gap={0.25}>
            <Tooltip title="Edytuj event">
              <IconButton size="small" onClick={() => setEditing(true)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Usuń event">
              <IconButton size="small" onClick={deleteNode}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {editing && (
        <EventDialog
          open
          initial={attrs}
          onClose={() => setEditing(false)}
          onInsert={({ attrs: next }) => {
            updateAttributes(next);
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const EventBlock = Node.create({
  name: 'eventBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      eventName: { default: '' },
      start: { default: '' },
      end: { default: '' },
      description: { default: '' },
      taskId: { default: '' },
      taskName: { default: '' },
      projectName: { default: '' },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="event-block"]',
      getAttrs: (node) => {
        if (typeof node === 'string') return false;
        const el = node as HTMLElement;
        // Encoded so the values survive any HTML interpretation step.
        const dec = (name: string) => {
          const raw = el.getAttribute(name);
          if (!raw) return '';
          try { return decodeURIComponent(raw); } catch { return raw; }
        };
        return {
          eventName: dec('data-event-name'),
          start: dec('data-start'),
          end: dec('data-end'),
          description: dec('data-description'),
          taskId: dec('data-task-id'),
          taskName: dec('data-task-name'),
          projectName: dec('data-project-name'),
        };
      },
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs as EventBlockAttrs;
    const enc: Record<string, string> = {
      'data-type': 'event-block',
    };
    if (a.eventName)   enc['data-event-name']  = encodeURIComponent(a.eventName);
    if (a.start)       enc['data-start']       = encodeURIComponent(a.start);
    if (a.end)         enc['data-end']         = encodeURIComponent(a.end);
    if (a.description) enc['data-description'] = encodeURIComponent(a.description);
    if (a.taskId)      enc['data-task-id']     = encodeURIComponent(a.taskId);
    if (a.taskName)    enc['data-task-name']   = encodeURIComponent(a.taskName);
    if (a.projectName) enc['data-project-name'] = encodeURIComponent(a.projectName);
    return ['div', mergeAttributes(HTMLAttributes, enc)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EventBlockNodeView);
  },
});
