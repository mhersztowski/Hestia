/**
 * InfoMark — inline TipTap node that turns an arbitrary span of text into
 * a clickable "tooltip token". The visible label is shown inline with the
 * surrounding paragraph (dotted underline + accent colour); clicking it
 * opens a MUI Popover with an optional title and a body that can hold
 * Markdown (rendered through ReactMarkdown + GFM).
 *
 * Designed to be inserted/edited via the dedicated dialog (see
 * InfoMarkDialog.tsx) from the MdEditor toolbar; double-click on an
 * existing infomark re-opens the dialog populated with the current values.
 *
 * Markdown round-trip uses the MyCastle inline embed convention:
 *   @[info:{encodedText}:{encodedTitle}:{encodedBody}]
 * — three URL-encoded segments so multi-line bodies / colons in titles
 * don't break the parser.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box,
  Popover,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  Link,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DescriptionIcon from '@mui/icons-material/Description';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditorFiles } from '../capabilities';

/** Custom event the toolbar listens for so a double-click on the inline
 *  node bubbles up to "open the same dialog as the toolbar button". Kept
 *  as a window-level CustomEvent because the NodeView lives inside
 *  ProseMirror's render tree and reaching the editor root from there
 *  through React refs alone is fragile. */
export const INFO_MARK_EDIT_EVENT = 'mycastle:info-mark-edit';

export interface InfoMarkEditEventDetail {
  /** ProseMirror document position of the node, so the editor can replace
   *  the right one with the updated attrs. */
  pos: number;
  /** Current attrs — pre-fill the dialog. */
  text: string;
  title: string;
  body: string;
  /** Path to a `.md` file in the user's drive (relative to drive root,
   *  e.g. `Calendar/2026/06/07.md`). Takes priority over `body` — when
   *  set the popover fetches and renders the file at click time. */
  bodyPath: string;
}

// ─── React NodeView ──────────────────────────────────────────────────────────

const InfoMarkNodeView: React.FC<NodeViewProps> = ({ node, editor, getPos }) => {
  const { text, title, body, bodyPath } = node.attrs as {
    text: string;
    title: string;
    body: string;
    bodyPath: string;
  };
  // Popover anchor — ref instead of state to avoid re-renders during open.
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);

  // File-backed body — fetched on first popover open, cached until the
  // node's bodyPath attr changes. mqttClient.readFile resolves against the
  // user's base path so callers pass a drive-relative path like
  // `Calendar/2026/06/07.md`.
  const { readFile } = useEditorFiles() ?? {};
  const [fileBody, setFileBody] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Invalidate cache when path changes (e.g. user edited the infomark
  // and pointed it at a different file).
  useEffect(() => {
    setFileBody(null);
    setFileError(null);
  }, [bodyPath]);

  const loadFile = useCallback(async () => {
    if (!bodyPath) return;
    if (fileBody !== null || fileLoading) return;
    setFileLoading(true);
    setFileError(null);
    try {
      if (!readFile) return;
      const result = await readFile(bodyPath);
      setFileBody(result?.content ?? '');
    } catch (err) {
      setFileError((err as Error).message || 'Nie udało się wczytać pliku');
    } finally {
      setFileLoading(false);
    }
  }, [bodyPath, fileBody, fileLoading, readFile]);

  const handleClick = () => {
    if (!editor.isEditable) {
      setOpen(true);
      void loadFile();
      return;
    }
    // In edit mode a plain click still pops the popover (so the author can
    // preview the rendered tooltip). Edit pencil in the popover header
    // dispatches the EDIT event for the toolbar dialog.
    setOpen(true);
    void loadFile();
  };

  const handleEdit = () => {
    setOpen(false);
    const raw = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof raw !== 'number' || raw < 0) return;
    window.dispatchEvent(
      new CustomEvent<InfoMarkEditEventDetail>(INFO_MARK_EDIT_EVENT, {
        detail: { pos: raw, text, title, body, bodyPath },
      })
    );
  };

  // Resolve which body text actually renders. bodyPath has priority — when
  // it's set we always show the file content (or loading / error state),
  // even if a stale `body` attr lingers from an earlier version.
  const renderedBody:
    | { kind: 'markdown'; text: string }
    | { kind: 'loading' }
    | { kind: 'error'; msg: string }
    | { kind: 'empty' } = (() => {
    if (bodyPath) {
      if (fileLoading) return { kind: 'loading' };
      if (fileError) return { kind: 'error', msg: fileError };
      if (fileBody !== null) return { kind: 'markdown', text: fileBody };
      return { kind: 'loading' }; // first render after open, before fetch resolves
    }
    if (body) return { kind: 'markdown', text: body };
    return { kind: 'empty' };
  })();

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      <Box
        ref={anchorRef}
        component="span"
        onClick={handleClick}
        // Double-click is a power-user shortcut for "skip the popover, go
        // straight to edit" — matches how Tiptap node atoms typically open.
        onDoubleClick={(e: React.MouseEvent) => {
          if (editor.isEditable) {
            e.preventDefault();
            handleEdit();
          }
        }}
        sx={{
          display: 'inline',
          cursor: 'pointer',
          color: 'primary.main',
          textDecoration: 'underline dotted',
          textDecorationThickness: '1px',
          textUnderlineOffset: '3px',
          // Subtle hover lift — gives the reader feedback that this token
          // is clickable, distinguishing it from a regular link.
          '&:hover': {
            backgroundColor: 'action.hover',
            borderRadius: '2px',
            padding: '0 2px',
            margin: '0 -2px',
          },
        }}
      >
        {text || <em style={{ opacity: 0.6 }}>info</em>}
      </Box>
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { maxWidth: 480, minWidth: 240 } }}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, pb: title ? 1 : 1.5 }}
        >
          <InfoOutlinedIcon fontSize="small" sx={{ color: 'primary.main', mt: 0.3 }} />
          <Box sx={{ flex: 1 }}>
            {title ? (
              <Typography variant="subtitle2" fontWeight={600}>
                {title}
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Informacja
              </Typography>
            )}
          </Box>
          {editor.isEditable && (
            <Tooltip title="Edytuj">
              <IconButton size="small" onClick={handleEdit}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {/* Source hint — file path is shown above the rendered content so
            the reader knows where to look if they want to edit the body
            directly. Click on the path opens the file in MdEditor through
            the standard route (relies on global routing). */}
        {bodyPath && (
          <Box
            sx={{
              px: 1.5,
              pb: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              color: 'text.secondary',
              fontSize: '0.7rem',
            }}
          >
            <DescriptionIcon fontSize="inherit" />
            <Link
              href={`/workspace/md/${bodyPath}`}
              underline="hover"
              variant="caption"
              target="_blank"
              rel="noopener"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {bodyPath}
            </Link>
          </Box>
        )}
        <Box
          sx={{
            px: 1.5,
            pb: 1.5,
            fontSize: '0.875rem',
            '& p:first-of-type': { mt: 0 },
            '& p:last-of-type': { mb: 0 },
            '& code': { backgroundColor: 'action.hover', px: 0.5, borderRadius: 0.5 },
          }}
        >
          {renderedBody.kind === 'loading' ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
              <CircularProgress size={14} />
              <Typography variant="body2">Wczytuję plik…</Typography>
            </Box>
          ) : renderedBody.kind === 'error' ? (
            <Typography variant="body2" color="error">
              Błąd wczytania pliku: {renderedBody.msg}
            </Typography>
          ) : renderedBody.kind === 'markdown' ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedBody.text}</ReactMarkdown>
          ) : (
            <Typography variant="body2" color="text.secondary" fontStyle="italic">
              (brak treści)
            </Typography>
          )}
        </Box>
      </Popover>
    </NodeViewWrapper>
  );
};

// ─── TipTap node definition ──────────────────────────────────────────────────

export const InfoMark = Node.create({
  name: 'infoMark',
  // Inline + atom so it behaves as a single character in flow: arrow keys
  // step over it as a unit, backspace deletes whole, Find doesn't tear it.
  // The visible `text` is an attribute, not document content — keeps the
  // round-trip lossless even when attrs change (otherwise editing title
  // alone would require text-node mutations).
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      text: { default: '' },
      title: { default: '' },
      // Inline body (legacy + fallback). Kept so existing infomarks created
      // before bodyPath was added keep working — popup shows `body` when
      // `bodyPath` is empty.
      body: { default: '' },
      // Path (drive-relative) to an .md file holding the popup content.
      // When set, takes priority over `body`. mqttClient.readFile resolves
      // the path against the user's base path.
      bodyPath: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="info-mark"]',
        getAttrs(node) {
          if (typeof node === 'string') return false;
          const el = node as HTMLElement;
          // URL-decode here — escapeInfoMarks emits values percent-encoded so
          // colons / brackets / newlines in body can survive the @[…] syntax.
          const dec = (s: string | null) => {
            if (!s) return '';
            try {
              return decodeURIComponent(s);
            } catch {
              return s;
            }
          };
          return {
            text: dec(el.getAttribute('data-text')) || el.textContent || '',
            title: dec(el.getAttribute('data-title')),
            body: dec(el.getAttribute('data-body')),
            bodyPath: dec(el.getAttribute('data-body-path')),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    // Both data-text AND inner textContent — data-text is canonical (used
    // by parseHTML), the textContent gives a sane fallback when this HTML
    // is rendered outside our TipTap pipeline (raw preview, search index).
    const text = String(node.attrs.text ?? '');
    const title = String(node.attrs.title ?? '');
    const body = String(node.attrs.body ?? '');
    const bodyPath = String(node.attrs.bodyPath ?? '');
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'info-mark',
        'data-text': encodeURIComponent(text),
        'data-title': encodeURIComponent(title),
        'data-body': encodeURIComponent(body),
        'data-body-path': encodeURIComponent(bodyPath),
        // Class is for static (read-only) Markdown rendering — gives the
        // span a hint of style even when the React NodeView isn't mounted.
        class: 'info-mark',
      }),
      text,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InfoMarkNodeView);
  },

  addCommands() {
    return {
      insertInfoMark:
        (attrs: { text: string; title?: string; body?: string; bodyPath?: string }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              text: attrs.text,
              title: attrs.title || '',
              body: attrs.body || '',
              bodyPath: attrs.bodyPath || '',
            },
          }),
      // Update an existing info-mark at a specific ProseMirror position —
      // used by the dialog when editing an already-inserted node.
      updateInfoMark:
        (pos: number, attrs: { text: string; title?: string; body?: string; bodyPath?: string }) =>
        ({ chain }) =>
          chain()
            .setNodeSelection(pos)
            .updateAttributes('infoMark', {
              text: attrs.text,
              title: attrs.title || '',
              body: attrs.body || '',
              bodyPath: attrs.bodyPath || '',
            })
            .run(),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    infoMark: {
      insertInfoMark: (attrs: {
        text: string;
        title?: string;
        body?: string;
        bodyPath?: string;
      }) => ReturnType;
      updateInfoMark: (
        pos: number,
        attrs: { text: string; title?: string; body?: string; bodyPath?: string }
      ) => ReturnType;
    };
  }
}
