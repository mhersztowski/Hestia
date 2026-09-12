/**
 * Markdown Preview Plugin
 *
 * Renders a live preview of the active .md / .mdx file in the sidebar.
 * Pipeline: remark-parse → remark-gfm + remark-breaks + remark-math →
 *           remark-rehype → rehype-raw → rehype-slug → rehype-highlight →
 *           rehype-katex → rehype-react (native React element tree, no XSS risk)
 *
 * Commands:
 *  - Command Palette: "Markdown: Open Preview"
 *  - Keyboard: the icon in the Activity Bar
 */

import { useState, useEffect, type ReactNode } from 'react';
// rehype-react v8 requires the automatic JSX runtime (jsx/jsxs/Fragment),
// not the classic createElement API. Import from react/jsx-runtime directly.
import * as prod from 'react/jsx-runtime';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { defineEditorPlugin } from '../monaco';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeReact from 'rehype-react';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';

/* ── Rehype processor ─────────────────────────────────────────────────────────
   Order matters:
   1. remark-parse       → mdast (markdown AST)
   2. remark-gfm         → tables, task lists, strikethrough, autolinks
   3. remark-breaks      → soft newlines → <br>
   4. remark-math        → $…$ and $$…$$ math nodes
   5. remark-rehype      → mdast → hast (HTML AST), allowDangerousHtml passes
                           raw HTML blocks through as-is
   6. rehype-raw         → processes the raw HTML nodes into proper hast
   7. rehype-slug        → adds id="…" to headings for anchor links
   8. rehype-highlight   → syntax highlighting via highlight.js
   9. rehype-katex       → renders math nodes to KaTeX HTML
  10. rehype-react       → hast → React element tree
 ────────────────────────────────────────────────────────────────────────────*/
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkBreaks)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSlug)
  .use(rehypeHighlight, { detect: true })
  .use(rehypeKatex)
  // rehype-react v8 requires the automatic JSX runtime options (not createElement/Fragment)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .use(rehypeReact, { Fragment: prod.Fragment, jsx: prod.jsx, jsxs: prod.jsxs } as any);

/* ── Module-level reactive store ─────────────────────────────────────────────
   Shared between the plugin activate() function and the React component.
   Pattern: plain pub-sub over a mutable singleton — no React context needed
   because the component is registered as a static ComponentType.
 ────────────────────────────────────────────────────────────────────────────*/

type PreviewState = {
  node: ReactNode;
  uri: string;
  isMarkdown: boolean;
  error: string | null;
  loading: boolean;
};

let _state: PreviewState = {
  node: null,
  uri: '',
  isMarkdown: false,
  error: null,
  loading: false,
};

const _listeners = new Set<() => void>();

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

function isMarkdownUri(uri: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(uri);
}

async function renderMarkdown(text: string, uri: string): Promise<void> {
  _state = { ..._state, loading: true, error: null, uri, isMarkdown: true };
  notifyListeners();
  try {
    const file = await processor.process(text);
    _state = {
      node: file.result as ReactNode,
      uri,
      isMarkdown: true,
      error: null,
      loading: false,
    };
  } catch (err) {
    _state = { ..._state, loading: false, error: String(err) };
  }
  notifyListeners();
}

function handleUriChange(uri: string, text: string) {
  // Ignore virtual tabs (preview itself, editor panels, etc.) — don't clear state
  if (uri.startsWith('virtual://')) return;

  if (!uri) {
    _state = { node: null, uri: '', isMarkdown: false, error: null, loading: false };
    notifyListeners();
    return;
  }
  if (!isMarkdownUri(uri)) {
    _state = { ..._state, uri, isMarkdown: false, loading: false };
    notifyListeners();
    return;
  }
  renderMarkdown(text, uri);
}

function usePreviewState(): PreviewState {
  const [s, setS] = useState<PreviewState>(_state);
  useEffect(() => {
    const fn = () => setS({ ..._state });
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  return s;
}

/* ── Sidebar component ───────────────────────────────────────────────────────*/

function MarkdownPreviewPanel() {
  const { node, uri, isMarkdown, error, loading } = usePreviewState();

  if (!uri) {
    return (
      <Box sx={{ p: 2.5, color: '#6e6e6e', fontSize: 13, textAlign: 'center', pt: 6 }}>
        <Typography sx={{ fontSize: 32, mb: 1 }}>MD</Typography>
        <Typography sx={{ color: '#858585', fontSize: 13 }}>
          Open a <code>.md</code> file to see a live preview.
        </Typography>
      </Box>
    );
  }

  if (!isMarkdown) {
    return (
      <Box sx={{ p: 2, color: '#858585', fontSize: 13 }}>
        Not a Markdown file.
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2, color: '#f48771', fontSize: 13, fontFamily: 'monospace' }}>
        <Typography sx={{ fontWeight: 600, mb: 0.5, fontSize: 13 }}>Render error</Typography>
        {error}
      </Box>
    );
  }

  if (loading && !node) {
    return <Box sx={{ p: 2, color: '#858585', fontSize: 13 }}>Rendering…</Box>;
  }

  return (
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
        px: 2.5,
        py: 2,
        // ── Typography ──────────────────────────────────────────────────────
        color: '#d4d4d4',
        fontSize: 14,
        lineHeight: 1.7,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        // ── Headings ────────────────────────────────────────────────────────
        '& h1,& h2,& h3,& h4,& h5,& h6': {
          color: '#e8e8e8',
          fontWeight: 600,
          mt: 2.5,
          mb: 1,
          lineHeight: 1.3,
        },
        '& h1': {
          fontSize: '1.75em',
          borderBottom: '1px solid #3c3c3c',
          pb: 0.75,
          mt: 0,
        },
        '& h2': { fontSize: '1.4em', borderBottom: '1px solid #2d2d2d', pb: 0.5 },
        '& h3': { fontSize: '1.2em' },
        '& h4': { fontSize: '1.05em' },
        '& h5,& h6': { fontSize: '1em', color: '#aaa' },
        // ── Paragraphs ──────────────────────────────────────────────────────
        '& p': { mt: 0, mb: 1.25 },
        // ── Inline code ─────────────────────────────────────────────────────
        '& :not(pre) > code': {
          bgcolor: '#2a2a2a',
          color: '#ce9178',
          px: 0.6,
          py: 0.15,
          borderRadius: '4px',
          fontFamily: '"Cascadia Code", "Fira Code", monospace',
          fontSize: '0.875em',
          border: '1px solid #3c3c3c',
        },
        // ── Code blocks ──────────────────────────────────────────────────────
        '& pre': {
          bgcolor: '#1a1a1a',
          border: '1px solid #3c3c3c',
          borderRadius: '6px',
          p: 1.5,
          overflowX: 'auto',
          mb: 1.5,
          '& code': {
            bgcolor: 'transparent',
            color: 'inherit',
            p: 0,
            fontSize: '0.875em',
            border: 'none',
            fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
          },
        },
        // ── Blockquote ───────────────────────────────────────────────────────
        '& blockquote': {
          borderLeft: '4px solid #4fc3f7',
          pl: 1.5,
          ml: 0,
          mr: 0,
          color: '#969696',
          fontStyle: 'italic',
          bgcolor: 'rgba(79,195,247,0.04)',
          borderRadius: '0 4px 4px 0',
          py: 0.25,
          mb: 1.25,
          '& p': { mb: 0 },
        },
        // ── Links ────────────────────────────────────────────────────────────
        '& a': {
          color: '#4fc3f7',
          textDecoration: 'none',
          '&:hover': { textDecoration: 'underline', color: '#82d9ff' },
        },
        // ── Lists ────────────────────────────────────────────────────────────
        '& ul,& ol': { pl: 2.5, mb: 1.25 },
        '& li': { mb: 0.375 },
        '& li > p': { mb: 0.5 },
        // Task list (GFM)
        '& input[type="checkbox"]': { mr: 0.75, accentColor: '#4fc3f7' },
        // ── Tables ───────────────────────────────────────────────────────────
        '& table': {
          borderCollapse: 'collapse',
          width: '100%',
          mb: 1.5,
          fontSize: '0.9em',
        },
        '& th,& td': {
          border: '1px solid #3c3c3c',
          px: 1.5,
          py: 0.75,
          textAlign: 'left',
        },
        '& th': { bgcolor: '#252526', fontWeight: 600, color: '#ccc' },
        '& tr:nth-of-type(even) td': { bgcolor: 'rgba(255,255,255,0.025)' },
        // ── Horizontal rule ──────────────────────────────────────────────────
        '& hr': { border: 'none', borderTop: '1px solid #3c3c3c', my: 2 },
        // ── Images ───────────────────────────────────────────────────────────
        '& img': { maxWidth: '100%', height: 'auto', borderRadius: '6px', display: 'block' },
        // ── Strikethrough ────────────────────────────────────────────────────
        '& del': { color: '#858585' },
        // ── KaTeX math ───────────────────────────────────────────────────────
        '& .katex-display': { overflowX: 'auto', my: 1.5 },
        // ── highlight.js theme adjustments (github-dark) ─────────────────────
        '& .hljs': { background: 'transparent' },
      }}
    >
      {node}
    </Box>
  );
}

/* ── Plugin definition ───────────────────────────────────────────────────────*/

// Singleton URI — only one preview tab exists at a time, content updates with active file
const PREVIEW_URI = 'virtual://markdown-preview';

export const MarkdownPreviewPlugin = defineEditorPlugin(
  {
    id: 'builtin.markdown-preview',
    name: 'Markdown Preview',
    version: '1.0.0',
    description: 'Live preview with syntax highlighting, tables, math (KaTeX) and GFM',
    contributes: ['commandpalette'],
  },

  (api) => {
    // ── Commands ───────────────────────────────────────────────────────────
    api.commands.register('open', () => {
      api.openEditorTab({
        uri: PREVIEW_URI,
        title: 'Markdown Preview',
        component: MarkdownPreviewPanel,
        toSide: true,    // open split to the right, like VSCode Ctrl+K V
      });
    });

    api.ui.commandpalette.register({
      command: `${api.pluginId}:open`,
      title: 'Open Preview',
      category: 'Markdown',
    });

    // ── Debounced content update ───────────────────────────────────────────
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingUri = '';

    function scheduleRender(text: string, uri: string) {
      pendingUri = uri;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        handleUriChange(pendingUri, text);
      }, 250);
    }

    // ── Subscriptions ──────────────────────────────────────────────────────

    // Called when user switches file — renders immediately with full text
    api.editor.onDidOpenDocument((uri, text) => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      pendingUri = uri;
      handleUriChange(uri, text);
    });

    // Called on every keystroke — debounced 250 ms
    api.editor.onDidChangeContent((text) => {
      scheduleRender(text, pendingUri);
    });

    api.logger.info('Markdown Preview activated');
  },

  () => {
    // Disposables cleaned up automatically by PluginRegistry._disposeAll()
  },
);
