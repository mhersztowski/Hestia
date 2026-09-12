/**
 * MdEmbed — Obsidian-style content transclusion. Syntax `![[target]]` embeds:
 *   • `![[notatka]]`            — the whole file `drive/notatka.md`
 *   • `![[notatka#Nagłówek]]`   — the section under that heading
 *   • `![[notatka#^blockId]]`   — the single block with that id
 *   • `![[#Nagłówek]]` / `![[#^blockId]]` — an anchor in the CURRENT document
 *
 * The embedded content is fetched (external files via MQTT, the current doc via
 * its live markdown) and rendered read-only inside a distinct boxed card. The
 * node round-trips through markdown as `![[target]]` (see markdownConverter).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { Box, Typography, IconButton, Tooltip, CircularProgress } from '@mui/material';
import LaunchIcon from '@mui/icons-material/Launch';
import EditIcon from '@mui/icons-material/Edit';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditorFiles } from '../capabilities';
import { htmlToMarkdown } from '../utils/markdownConverter';

export const MD_EMBED_EDIT_EVENT = 'md-embed-edit';
export interface MdEmbedEditEventDetail { pos: number; target: string; }

// ─── target parsing + content extraction ─────────────────────────────────────

interface ParsedTarget {
  filePart: string;      // '' → current document
  anchorRaw: string;     // '' | 'Heading' | '^blockId' (everything after the first #)
  isBlock: boolean;
  href: string;          // navigable href (wikilink form) for the "open" action
  label: string;         // human label for the header
}

function parseTarget(target: string): ParsedTarget {
  const t = (target || '').trim();
  const hashIdx = t.indexOf('#');
  const filePart = (hashIdx >= 0 ? t.slice(0, hashIdx) : t).replace(/^\/+/, '');
  const anchorRaw = hashIdx >= 0 ? t.slice(hashIdx + 1) : '';
  const isBlock = anchorRaw.startsWith('^');
  const anchorSuffix = anchorRaw ? `#${anchorRaw}` : '';
  const href = filePart ? `drive/${filePart}.md${anchorSuffix}` : anchorSuffix;
  const anchorLabel = anchorRaw ? ` › ${isBlock ? '^' + anchorRaw.slice(1) : anchorRaw}` : '';
  const label = `${filePart || 'bieżący dokument'}${anchorLabel}`;
  return { filePart, anchorRaw, isBlock, href, label };
}

/** Section under a heading: the heading line + everything until the next heading
 *  of the same or higher level (matches Obsidian's `#heading` embed). */
function extractSection(md: string, headingText: string): string {
  const lines = md.split('\n');
  const want = headingText.trim().toLowerCase();
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(lines[i]);
    if (m && m[2].trim().toLowerCase() === want) { start = i; level = m[1].length; break; }
  }
  if (start < 0) return `> ⚠️ Nie znaleziono nagłówka „${headingText}".`;
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** Single block: the content following its `<!-- bid:id -->` marker, up to the
 *  next block marker. */
function extractBlock(md: string, id: string): string {
  const lines = md.split('\n');
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<!--\\s*bid:${esc}\\s*-->`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) { if (re.test(lines[i])) { start = i + 1; break; } }
  if (start < 0) return `> ⚠️ Nie znaleziono bloku „^${id}".`;
  let i = start;
  while (i < lines.length && lines[i].trim() === '') i++;   // skip blanks after marker
  const out: string[] = [];
  for (; i < lines.length; i++) {
    if (/<!--\s*bid:/.test(lines[i])) break;                 // next block marker
    if (lines[i].trim() === '' && out.length) break;         // blank line ends the block
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

// ─── React NodeView ──────────────────────────────────────────────────────────

const EmbedNodeView: React.FC<NodeViewProps> = ({ node, editor, getPos }) => {
  const target = (node.attrs.target as string) || '';
  const parsed = parseTarget(target);
  const { readFile } = useEditorFiles() ?? {};
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // View-only fold state (like heading sections) — not persisted to markdown.
  const [collapsed, setCollapsed] = useState(false);

  const resolve = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      let md: string;
      if (!parsed.filePart) {
        md = htmlToMarkdown(editor.getHTML());   // current document, live
      } else {
        // readFile resolves against the user home, and picker targets live under
        // the drive subtree → prefix `drive/` (matches the navigable href).
        if (!readFile) return;
        const res = await readFile(`drive/${parsed.filePart}.md`);
        md = res?.content ?? '';
      }
      let extracted: string;
      if (!parsed.anchorRaw) extracted = md;
      else if (parsed.isBlock) extracted = extractBlock(md, parsed.anchorRaw.slice(1));
      else extracted = extractSection(md, parsed.anchorRaw);
      // Strip block-id comments so they don't render as noise.
      setBody(extracted.replace(/<!--\s*bid:[^>]*-->/g, '').trim());
    } catch (e) {
      setError((e as Error).message || 'Nie udało się wczytać osadzonej treści.');
    } finally {
      setLoading(false);
    }
  }, [parsed.filePart, parsed.anchorRaw, parsed.isBlock, readFile, editor]);

  useEffect(() => { void resolve(); }, [resolve]);

  const handleEdit = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number' || pos < 0) return;
    window.dispatchEvent(new CustomEvent<MdEmbedEditEventDetail>(MD_EMBED_EDIT_EVENT, { detail: { pos, target } }));
  }, [getPos, target]);

  return (
    <NodeViewWrapper
      className="md-embed"
      data-drag-handle
      // Double-click re-opens the picker to change the target (edit mode only).
      onDoubleClick={(e: React.MouseEvent) => { if (editor.isEditable) { e.preventDefault(); handleEdit(); } }}
    >
      <Box className="md-embed-card">
        <Box className="md-embed-header" contentEditable={false}>
          <Tooltip title={collapsed ? 'Rozwiń osadzenie' : 'Zwiń osadzenie'}>
            <IconButton size="small" className="md-embed-fold" onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? <ChevronRightIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          <ArticleOutlinedIcon fontSize="small" className="md-embed-icon" />
          {/* Rendered as a wikilink so MdEditor's document click handler opens /
              scrolls to the source (file navigation or same-doc anchor). */}
          {parsed.href ? (
            <a href={parsed.href} data-wikilink="true" className="md-embed-source">{parsed.label}</a>
          ) : (
            <span className="md-embed-source">{parsed.label}</span>
          )}
          <Box sx={{ flex: 1 }} />
          {editor.isEditable && (
            <>
              <Tooltip title="Zmień źródło osadzenia">
                <IconButton size="small" onClick={handleEdit}><EditIcon sx={{ fontSize: 15 }} /></IconButton>
              </Tooltip>
              {parsed.href && (
                <Tooltip title="Otwórz źródło">
                  <IconButton size="small" component="a" href={parsed.href} {...{ 'data-wikilink': 'true' }}>
                    <LaunchIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
        </Box>
        {!collapsed && (
        <Box className="md-embed-body" contentEditable={false}>
          {loading && body === null ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={18} /></Box>
          ) : error ? (
            <Typography variant="body2" color="error">{error}</Typography>
          ) : body ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          ) : (
            <Typography variant="body2" color="text.secondary"><em>Pusta zawartość.</em></Typography>
          )}
        </Box>
        )}
      </Box>
    </NodeViewWrapper>
  );
};

// ─── Node definition ─────────────────────────────────────────────────────────

export const MdEmbed = Node.create({
  name: 'mdEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-target') || '',
        renderHTML: (attrs) => ({ 'data-target': attrs.target }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="md-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'md-embed' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },
});

export default MdEmbed;
