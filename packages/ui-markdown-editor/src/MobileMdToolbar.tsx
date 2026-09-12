/**
 * MobileMdToolbar — always-visible bottom toolbar for touch/mobile editing.
 *
 * Replaces the selection-triggered bubble menu on narrow screens with a
 * persistent strip that floats above the on-screen keyboard.  Secondary
 * actions live in slide-up sub-panels to keep the primary strip compact.
 *
 * Sub-panels:
 *  • format   — B / I / S / inline-code / highlight / clear / link / code-block / equation
 *  • color    — highlight colour palette (8 colours + clear)
 *  • turninto — change the current block type (¶ H1–H3 • 1. ☑ " </>)
 *  • insert   — image / audio / video
 */
import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';
import { Box, IconButton, Paper, Divider, Tooltip } from '@mui/material';

import FormatBoldIcon          from '@mui/icons-material/FormatBold';
import FormatItalicIcon        from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon      from '@mui/icons-material/StrikethroughS';
import CodeIcon                from '@mui/icons-material/Code';
import HighlightIcon           from '@mui/icons-material/Highlight';
import FormatClearIcon         from '@mui/icons-material/FormatClear';
import LinkIcon                from '@mui/icons-material/Link';
import DataObjectIcon          from '@mui/icons-material/DataObject';
import FunctionsIcon           from '@mui/icons-material/Functions';
import PaletteIcon             from '@mui/icons-material/Palette';
import SwapHorizIcon           from '@mui/icons-material/SwapHoriz';
import AddIcon                 from '@mui/icons-material/Add';
import UndoIcon                from '@mui/icons-material/Undo';
import RedoIcon                from '@mui/icons-material/Redo';
import ArrowUpwardIcon         from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon       from '@mui/icons-material/ArrowDownward';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import DeleteOutlineIcon       from '@mui/icons-material/DeleteOutline';
import TerminalIcon            from '@mui/icons-material/Terminal';
import FormatSizeIcon          from '@mui/icons-material/FormatSize';
import ImageIcon               from '@mui/icons-material/Image';
import AudiotrackIcon          from '@mui/icons-material/Audiotrack';
import VideocamIcon            from '@mui/icons-material/Videocam';
import SubjectIcon             from '@mui/icons-material/Subject';
import TitleIcon               from '@mui/icons-material/Title';
import FormatListBulletedIcon  from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon  from '@mui/icons-material/FormatListNumbered';
import ChecklistIcon           from '@mui/icons-material/Checklist';
import FormatQuoteIcon         from '@mui/icons-material/FormatQuote';

// ── Constants ────────────────────────────────────────────────────────────────

export const MOBILE_TOOLBAR_HEIGHT = 48;

const BTN = { minWidth: 44, minHeight: 44, flexShrink: 0 } as const;
const BTN_SM = { minWidth: 40, minHeight: 44, flexShrink: 0 } as const;

const HIGHLIGHT_COLORS = [
  { label: 'Red',    value: '#fca5a5' },
  { label: 'Orange', value: '#fdba74' },
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green',  value: '#86efac' },
  { label: 'Blue',   value: '#93c5fd' },
  { label: 'Purple', value: '#c4b5fd' },
  { label: 'Pink',   value: '#f9a8d4' },
  { label: 'Cyan',   value: '#67e8f9' },
];

// ── Block-level helpers ───────────────────────────────────────────────────────

export function getListItemType(editor: Editor): 'listItem' | 'taskItem' {
  return editor.isActive('taskList') ? 'taskItem' : 'listItem';
}

/** Swap the top-level block containing the cursor with its neighbour. */
export function moveBlock(editor: Editor, dir: 'up' | 'down'): void {
  const { state } = editor.view;
  const { $from } = state.selection;
  if ($from.depth < 1) return;

  const nodeStart = $from.before(1);
  const nodeEnd   = $from.after(1);
  const node      = state.doc.nodeAt(nodeStart);
  if (!node) return;

  const cursorOff = state.selection.$from.pos - nodeStart;

  if (dir === 'up') {
    if (nodeStart === 0) return;
    const prevStart = state.doc.resolve(nodeStart - 1).before(1);
    const prevNode  = state.doc.nodeAt(prevStart);
    if (!prevNode) return;
    const tr = state.tr.replaceWith(prevStart, nodeEnd, Fragment.from([node, prevNode]));
    const np = prevStart + Math.min(cursorOff, node.nodeSize - 2);
    try { tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(1, np)))); } catch { /* ok */ }
    editor.view.dispatch(tr);
  } else {
    if (nodeEnd >= state.doc.content.size) return;
    const nextNode = state.doc.nodeAt(nodeEnd);
    if (!nextNode) return;
    const nextEnd = nodeEnd + nextNode.nodeSize;
    const tr = state.tr.replaceWith(nodeStart, nextEnd, Fragment.from([nextNode, node]));
    const ns = nodeStart + nextNode.nodeSize;
    const np = ns + Math.min(cursorOff, node.nodeSize - 2);
    try { tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(1, np)))); } catch { /* ok */ }
    editor.view.dispatch(tr);
  }
}

/** Delete the innermost list item under the cursor, or the top-level block. */
export function deleteBlock(editor: Editor): void {
  const { state } = editor.view;
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 1; d--) {
    const name = $from.node(d).type.name;
    if (name === 'listItem' || name === 'taskItem') {
      editor.chain().focus().deleteRange({ from: $from.before(d), to: $from.after(d) }).run();
      return;
    }
  }
  if ($from.depth >= 1) {
    editor.chain().focus().deleteRange({ from: $from.before(1), to: $from.after(1) }).run();
  }
}

// ── Sub-panel: text formatting ────────────────────────────────────────────────

// Panels + helpers are exported so the bottom bubble menu in MdEditor can
// reuse the exact same hierarchy (Format / Color / Turn into / Insert)
// inside its own Popovers — single source of truth for the toolbar UX.
export const FormatPanel: React.FC<{ editor: Editor; onClose: () => void }> = ({ editor, onClose }) => {
  const run = (fn: () => void) => { fn(); };
  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL', prev);
    if (url === null) return;
    if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    onClose();
  };
  return (
    <Box sx={{ p: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      <Tooltip title="Bold">
        <IconButton size="medium" sx={BTN} onClick={() => run(() => editor.chain().focus().toggleBold().run())} color={editor.isActive('bold') ? 'primary' : 'default'}>
          <FormatBoldIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Italic">
        <IconButton size="medium" sx={BTN} onClick={() => run(() => editor.chain().focus().toggleItalic().run())} color={editor.isActive('italic') ? 'primary' : 'default'}>
          <FormatItalicIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Strikethrough">
        <IconButton size="medium" sx={BTN} onClick={() => run(() => editor.chain().focus().toggleStrike().run())} color={editor.isActive('strike') ? 'primary' : 'default'}>
          <StrikethroughSIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Inline code">
        <IconButton size="medium" sx={BTN} onClick={() => run(() => editor.chain().focus().toggleCode().run())} color={editor.isActive('code') ? 'primary' : 'default'}>
          <CodeIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Highlight">
        <IconButton size="medium" sx={BTN} onClick={() => run(() => editor.chain().focus().toggleHighlight().run())} color={editor.isActive('highlight') ? 'primary' : 'default'}>
          <HighlightIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Clear formatting">
        <IconButton size="medium" sx={BTN} onClick={() => run(() => editor.chain().focus().unsetAllMarks().run())}>
          <FormatClearIcon />
        </IconButton>
      </Tooltip>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
      <Tooltip title="Link">
        <IconButton size="medium" sx={BTN} onClick={setLink} color={editor.isActive('link') ? 'primary' : 'default'}>
          <LinkIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Code block">
        <IconButton size="medium" sx={BTN} onClick={() => run(() => editor.chain().focus().toggleCodeBlock().run())} color={editor.isActive('codeBlock') ? 'primary' : 'default'}>
          <DataObjectIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Math / equation">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <IconButton size="medium" sx={BTN} onClick={() => run(() => (editor.chain().focus() as any).insertMathBlock('').run())}>
          <FunctionsIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

// ── Sub-panel: highlight colours ──────────────────────────────────────────────

export const ColorPanel: React.FC<{ editor: Editor; onClose: () => void }> = ({ editor, onClose }) => (
  <Box sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
    {HIGHLIGHT_COLORS.map(({ label, value }) => (
      <Box
        key={value}
        component="button"
        title={label}
        onClick={() => { editor.chain().focus().setHighlight({ color: value }).run(); onClose(); }}
        sx={{
          width: 36, height: 36, borderRadius: '50%', background: value,
          border: '3px solid',
          borderColor: editor.isActive('highlight', { color: value }) ? 'primary.main' : 'transparent',
          boxShadow: 1, cursor: 'pointer', outline: 'none', flexShrink: 0, p: 0,
          transition: 'border-color 0.15s',
          '&:hover': { borderColor: 'text.secondary' },
        }}
      />
    ))}
    <Box
      component="button"
      title="Clear highlight"
      onClick={() => { editor.chain().focus().unsetHighlight().run(); onClose(); }}
      sx={{
        width: 36, height: 36, borderRadius: '50%',
        border: '2px solid', borderColor: 'divider',
        background: 'transparent', cursor: 'pointer', outline: 'none', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        '&:hover': { borderColor: 'text.secondary' },
      }}
    >
      <FormatClearIcon fontSize="small" />
    </Box>
  </Box>
);

// ── Sub-panel: turn into ──────────────────────────────────────────────────────

interface TurnIntoOption {
  title: string;
  icon: React.ElementType;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (e: any) => void;
  isActive: (e: Editor) => boolean;
}

const TURN_INTO: TurnIntoOption[] = [
  { title: 'Paragraph',     label: '¶',   icon: SubjectIcon,           action: e => e.chain().focus().setParagraph().run(),                     isActive: e => e.isActive('paragraph') && !e.isActive('blockquote') },
  { title: 'Heading 1',     label: 'H1',  icon: TitleIcon,             action: e => e.chain().focus().toggleHeading({ level: 1 }).run(),         isActive: e => e.isActive('heading', { level: 1 }) },
  { title: 'Heading 2',     label: 'H2',  icon: TitleIcon,             action: e => e.chain().focus().toggleHeading({ level: 2 }).run(),         isActive: e => e.isActive('heading', { level: 2 }) },
  { title: 'Heading 3',     label: 'H3',  icon: TitleIcon,             action: e => e.chain().focus().toggleHeading({ level: 3 }).run(),         isActive: e => e.isActive('heading', { level: 3 }) },
  { title: 'Bullet list',   label: '•',   icon: FormatListBulletedIcon, action: e => e.chain().focus().toggleBulletList().run(),                 isActive: e => e.isActive('bulletList') },
  { title: 'Numbered list', label: '1.',  icon: FormatListNumberedIcon, action: e => e.chain().focus().toggleOrderedList().run(),                isActive: e => e.isActive('orderedList') },
  { title: 'Task list',     label: '☑',   icon: ChecklistIcon,          action: e => e.chain().focus().toggleTaskList().run(),                   isActive: e => e.isActive('taskList') },
  { title: 'Blockquote',    label: '"',   icon: FormatQuoteIcon,        action: e => e.chain().focus().toggleBlockquote().run(),                 isActive: e => e.isActive('blockquote') },
  { title: 'Code block',    label: '</>',  icon: DataObjectIcon,         action: e => e.chain().focus().toggleCodeBlock().run(),                  isActive: e => e.isActive('codeBlock') },
];

export const TurnIntoPanel: React.FC<{ editor: Editor; onClose: () => void }> = ({ editor, onClose }) => (
  <Box sx={{ p: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
    {TURN_INTO.map(({ title, icon: Icon, action, isActive }) => (
      <Tooltip key={title} title={title}>
        <IconButton
          size="medium"
          sx={BTN}
          color={isActive(editor) ? 'primary' : 'default'}
          onClick={() => { action(editor); onClose(); }}
        >
          <Icon fontSize="small" />
        </IconButton>
      </Tooltip>
    ))}
  </Box>
);

// ── Sub-panel: insert ─────────────────────────────────────────────────────────

export const InsertPanel: React.FC<{ editor: Editor; onClose: () => void }> = ({ editor, onClose }) => (
  <Box sx={{ p: 1, display: 'flex', gap: 0.5 }}>
    <Tooltip title="Image">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <IconButton size="medium" sx={BTN} onClick={() => { (editor.chain().focus() as any).setImage({ src: '', alt: '' }).run(); onClose(); }}>
        <ImageIcon />
      </IconButton>
    </Tooltip>
    <Tooltip title="Audio">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <IconButton size="medium" sx={BTN} onClick={() => { (editor.chain().focus() as any).setAudio({ src: '' }).run(); onClose(); }}>
        <AudiotrackIcon />
      </IconButton>
    </Tooltip>
    <Tooltip title="Video">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <IconButton size="medium" sx={BTN} onClick={() => { (editor.chain().focus() as any).setVideo({ src: '' }).run(); onClose(); }}>
        <VideocamIcon />
      </IconButton>
    </Tooltip>
  </Box>
);

// ── Main component ────────────────────────────────────────────────────────────

type SubPanel = 'format' | 'color' | 'turninto' | 'insert' | null;

interface Props {
  editor: Editor;
  keyboardOffset: number;
}

export const MobileMdToolbar: React.FC<Props> = ({ editor, keyboardOffset }) => {
  const [subPanel, setSubPanel] = useState<SubPanel>(null);

  const togglePanel = useCallback((p: SubPanel) => setSubPanel(prev => prev === p ? null : p), []);
  const closePanel  = useCallback(() => setSubPanel(null), []);

  const inList        = editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList');
  const listItemType  = getListItemType(editor);
  const canIndent     = inList && editor.can().sinkListItem(listItemType);
  const canOutdent    = inList && editor.can().liftListItem(listItemType);

  // Bottom offset: above keyboard when open, at viewport bottom otherwise.
  // When at the bottom (no keyboard), add safe-area-inset-bottom so the strip
  // isn't hidden under the iPhone home-indicator / Android gesture handle.
  const toolbarBottomCss = keyboardOffset > 0
    ? `${keyboardOffset}px`
    : 'env(safe-area-inset-bottom, 0px)';
  const subPanelBottomCss = keyboardOffset > 0
    ? `${keyboardOffset + MOBILE_TOOLBAR_HEIGHT}px`
    : `calc(env(safe-area-inset-bottom, 0px) + ${MOBILE_TOOLBAR_HEIGHT}px)`;

  const setLink = () => {
    closePanel();
    const url = window.prompt('URL', editor.getAttributes('link').href || '');
    if (url === null) return;
    if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return ReactDOM.createPortal(
    <>
      {/* Backdrop — tapping outside a sub-panel closes it */}
      {subPanel !== null && (
        <Box
          onClick={closePanel}
          sx={{ position: 'fixed', inset: 0, zIndex: 1298, background: 'transparent' }}
        />
      )}

      {/* Sub-panel (slides up above toolbar) */}
      {subPanel !== null && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: subPanelBottomCss,
            left: 0, right: 0,
            zIndex: 1299,
            borderRadius: '12px 12px 0 0',
            borderBottom: 0,
          }}
          onClick={e => e.stopPropagation()}
        >
          {subPanel === 'format'   && <FormatPanel   editor={editor} onClose={closePanel} />}
          {subPanel === 'color'    && <ColorPanel    editor={editor} onClose={closePanel} />}
          {subPanel === 'turninto' && <TurnIntoPanel editor={editor} onClose={closePanel} />}
          {subPanel === 'insert'   && <InsertPanel   editor={editor} onClose={closePanel} />}
        </Paper>
      )}

      {/* Primary toolbar strip */}
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: toolbarBottomCss,
          left: 0, right: 0,
          height: MOBILE_TOOLBAR_HEIGHT,
          zIndex: 1300,
          display: 'flex',
          alignItems: 'center',
          borderTop: 1,
          borderColor: 'divider',
          borderRadius: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {/* Command palette — inserts '/' to trigger slash-command menu */}
        <Tooltip title="Command palette (/)">
          <IconButton size="small" sx={BTN}
            onClick={() => { closePanel(); editor.chain().focus().insertContent('/').run(); }}
          >
            <TerminalIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

        {/* Formatting submenu toggle + quick B/I buttons */}
        <Tooltip title="Formatting…">
          <IconButton size="small" sx={BTN}
            color={subPanel === 'format' ? 'primary' : 'default'}
            onClick={() => togglePanel('format')}
          >
            <FormatSizeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Bold">
          <IconButton size="small" sx={BTN_SM}
            color={editor.isActive('bold') ? 'primary' : 'default'}
            onClick={() => { closePanel(); editor.chain().focus().toggleBold().run(); }}
          >
            <FormatBoldIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Italic">
          <IconButton size="small" sx={BTN_SM}
            color={editor.isActive('italic') ? 'primary' : 'default'}
            onClick={() => { closePanel(); editor.chain().focus().toggleItalic().run(); }}
          >
            <FormatItalicIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

        {/* Highlight colour */}
        <Tooltip title="Highlight colour…">
          <IconButton size="small" sx={BTN}
            color={subPanel === 'color' ? 'primary' : editor.isActive('highlight') ? 'primary' : 'default'}
            onClick={() => togglePanel('color')}
          >
            <PaletteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* Link */}
        <Tooltip title="Link">
          <IconButton size="small" sx={BTN}
            color={editor.isActive('link') ? 'primary' : 'default'}
            onClick={setLink}
          >
            <LinkIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

        {/* Turn into */}
        <Tooltip title="Turn into…">
          <IconButton size="small" sx={BTN}
            color={subPanel === 'turninto' ? 'primary' : 'default'}
            onClick={() => togglePanel('turninto')}
          >
            <SwapHorizIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* Insert */}
        <Tooltip title="Insert media…">
          <IconButton size="small" sx={BTN}
            color={subPanel === 'insert' ? 'primary' : 'default'}
            onClick={() => togglePanel('insert')}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

        {/* Undo / Redo */}
        <Tooltip title="Undo">
          <IconButton size="small" sx={BTN}
            onClick={() => { closePanel(); editor.chain().focus().undo().run(); }}
          >
            <UndoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Redo">
          <IconButton size="small" sx={BTN}
            onClick={() => { closePanel(); editor.chain().focus().redo().run(); }}
          >
            <RedoIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

        {/* Move block up / down */}
        <Tooltip title="Move block up">
          <IconButton size="small" sx={BTN}
            onClick={() => { closePanel(); moveBlock(editor, 'up'); }}
          >
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Move block down">
          <IconButton size="small" sx={BTN}
            onClick={() => { closePanel(); moveBlock(editor, 'down'); }}
          >
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

        {/* Outdent / Indent */}
        <Tooltip title="Outdent">
          <span>
            <IconButton size="small" sx={BTN}
              disabled={!canOutdent}
              onClick={() => { closePanel(); editor.chain().focus().liftListItem(listItemType).run(); }}
            >
              <FormatIndentDecreaseIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Indent">
          <span>
            <IconButton size="small" sx={BTN}
              disabled={!canIndent}
              onClick={() => { closePanel(); editor.chain().focus().sinkListItem(listItemType).run(); }}
            >
              <FormatIndentIncreaseIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

        {/* Delete block */}
        <Tooltip title="Delete block">
          <IconButton size="small" sx={BTN} color="error"
            onClick={() => { closePanel(); deleteBlock(editor); }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Paper>
    </>,
    document.body,
  );
};

export default MobileMdToolbar;
