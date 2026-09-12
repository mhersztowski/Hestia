/**
 * RawMarkdownBlock — a per-block "source view" toggle.
 *
 * A block can be flipped between its rendered/visual form and its raw Markdown
 * source (an editable monospace box). The toggle lives on the left ⋮ block menu
 * (and a small "Podgląd" button in the raw box itself).
 *
 * The raw state is a *transient view* — on save the block serializes back to
 * plain Markdown (so it renders normally on reload), while any edits made in the
 * raw box are preserved verbatim. The block's id is kept on the node (`blockId`)
 * so block references survive the round-trip.
 */
import React, { useEffect, useRef } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { Box, IconButton, Tooltip } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CodeIcon from '@mui/icons-material/Code';
import type { Editor } from '@tiptap/react';
import { serializeBlocks } from '../utils/blockClipboard';
import { markdownToHtml } from '../utils/markdownConverter';

const stripLeadingBid = (md: string) => md.replace(/^<!--\s*bid:[^>]*-->\s*\n?/, '');

/** Convert the ordinary block at `pos` into its raw-markdown source view. */
export function blockToRaw(editor: Editor, pos: number): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name === 'rawMarkdownBlock') return false;
  const { markdown } = serializeBlocks(editor, [node]);
  const source = stripLeadingBid(markdown).replace(/\n+$/, '');
  const rawNode = editor.schema.nodes.rawMarkdownBlock.create({
    source,
    blockId: (node.attrs.blockId as string | null) ?? null,
  });
  return editor
    .chain()
    .command(({ tr }) => {
      tr.replaceRangeWith(pos, pos + node.nodeSize, rawNode);
      return true;
    })
    .run();
}

/** Convert the raw-markdown block at `pos` back into its rendered form. */
export function rawToRendered(editor: Editor, pos: number): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'rawMarkdownBlock') return false;
  const src = (node.attrs.source as string) || '';
  const bid = (node.attrs.blockId as string | null) || null;
  // Re-attach the block id so references (`[[#^id]]`) survive the flip.
  const md = (bid ? `<!-- bid:${bid} -->\n\n` : '') + src;
  const html = markdownToHtml(md) || '<p></p>';
  return editor
    .chain()
    .insertContentAt({ from: pos, to: pos + node.nodeSize }, html)
    .run();
}

/** True when the top-level node at `pos` is a raw-markdown block. */
export function isRawMarkdownBlock(editor: Editor, pos: number): boolean {
  return editor.state.doc.nodeAt(pos)?.type.name === 'rawMarkdownBlock';
}

const RawMarkdownNodeView: React.FC<NodeViewProps> = ({ node, editor, updateAttributes, getPos }) => {
  const source = (node.attrs.source as string) || '';
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Base line count drives the `rows` attribute so the box has the right height
  // even before (or if ever) the JS autosize runs. Guards against a collapsed box.
  const lineCount = Math.min(60, Math.max(2, source.split('\n').length));

  // Auto-grow the textarea to fit its content so nothing is clipped/scrolled.
  // Only apply a measured height when it's non-zero — measuring before layout
  // settles yields 0 and would collapse the box (leaving `rows` in charge).
  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const h = ta.scrollHeight;
    if (h > 0) ta.style.height = `${h}px`;
  };
  // Run after paint so scrollHeight reflects the laid-out content.
  useEffect(() => {
    const id = requestAnimationFrame(autosize);
    return () => cancelAnimationFrame(id);
  }, [source]);

  const renderBack = () => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    if (typeof pos === 'number') rawToRendered(editor as Editor, pos);
  };

  return (
    <NodeViewWrapper className="md-rawblock" data-block-id={(node.attrs.blockId as string) || undefined}>
      <Box className="md-rawblock-head" contentEditable={false}>
        <CodeIcon sx={{ fontSize: 14 }} />
        <span className="md-rawblock-label">Markdown (surowy)</span>
        {editor.isEditable && (
          <Tooltip title="Pokaż jako podgląd">
            <IconButton size="small" className="md-rawblock-btn" onClick={renderBack}>
              <VisibilityIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <textarea
        ref={taRef}
        className="md-rawblock-source"
        value={source}
        rows={lineCount}
        spellCheck={false}
        readOnly={!editor.isEditable}
        onInput={autosize}
        onChange={(e) => updateAttributes({ source: e.target.value })}
        // Keep ProseMirror from hijacking keys while editing the raw source.
        onKeyDown={(e) => e.stopPropagation()}
      />
    </NodeViewWrapper>
  );
};

export const RawMarkdownBlock = Node.create({
  name: 'rawMarkdownBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (el) => decodeURIComponent(el.getAttribute('data-source') || ''),
        renderHTML: (a) => ({ 'data-source': encodeURIComponent((a.source as string) || '') }),
      },
      blockId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-block-id') || null,
        renderHTML: (a) => (a.blockId ? { 'data-block-id': a.blockId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="raw-markdown-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'raw-markdown-block' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RawMarkdownNodeView);
  },
});

export default RawMarkdownBlock;
