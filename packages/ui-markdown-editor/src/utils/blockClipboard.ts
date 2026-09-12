/**
 * In-app block clipboard — a mobile-safe fallback for block cut/copy/paste.
 *
 * On Android (and any non-secure HTTP context) `navigator.clipboard` is
 * unavailable and `document.execCommand('copy')` is unreliable, so the system
 * clipboard can't carry block content. We keep a module-level copy of the last
 * copied/cut blocks (HTML + markdown) so in-editor copy→paste works everywhere.
 * The system clipboard is still written/read on a best-effort basis for interop
 * with other apps where it IS available.
 */
import { DOMSerializer, Fragment } from '@tiptap/pm/model';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { htmlToMarkdown } from './markdownConverter';

let store: { html: string; markdown: string } | null = null;

export function serializeBlocks(editor: Editor, nodes: PmNode[]): { html: string; markdown: string } {
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const tmp = document.createElement('div');
  tmp.appendChild(serializer.serializeFragment(Fragment.fromArray(nodes)));
  const html = tmp.innerHTML;
  return { html, markdown: htmlToMarkdown(html) };
}

/** Copy blocks into the in-app clipboard + (best effort) the system clipboard. */
export async function copyBlocks(editor: Editor, nodes: PmNode[]): Promise<void> {
  if (!nodes.length) return;
  const { html, markdown } = serializeBlocks(editor, nodes);
  store = { html, markdown };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CI = (window as any).ClipboardItem;
    if (navigator.clipboard?.write && CI) {
      await navigator.clipboard.write([new CI({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([markdown], { type: 'text/plain' }),
      })]);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
    }
  } catch { /* system clipboard unavailable (e.g. Android/HTTP) — in-app copy still works */ }
}

export function hasBlockClipboard(): boolean {
  return !!store;
}

/**
 * Content to paste: the in-app clipboard first (works on mobile), otherwise the
 * system clipboard (desktop / secure contexts, may prompt for permission).
 * Returns an HTML/markdown string, or null when nothing is available.
 */
export async function readBlocksForPaste(): Promise<string | null> {
  if (store) return store.html || store.markdown;
  let html = '', text = '';
  try {
    const clip = navigator.clipboard;
    if (clip?.read) {
      for (const item of await clip.read()) {
        if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
        if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
      }
    } else if (clip?.readText) {
      text = await clip.readText();
    }
  } catch { /* system clipboard unavailable */ }
  return html || text || null;
}
