import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';

/**
 * HeadingFold — collapse/expand the section that follows a heading (everything
 * up to the next heading of the same or higher level, i.e. same "class"). A small
 * chevron widget is rendered in the left margin of every foldable heading; the
 * ⋮ block menu offers the same toggle so the two gutters stay in sync.
 *
 * State is tracked by the heading's stable `blockId` (assigned by BlockIdExtension
 * and round-tripped through markdown as <!-- bid:… -->), so folds survive edits.
 * Collapsing is purely visual (a `display:none` node decoration) — the document
 * content is untouched, so saving a collapsed doc loses nothing.
 */

export const headingFoldKey = new PluginKey<FoldPluginState>('headingFold');

interface FoldPluginState {
  collapsed: Set<string>;
  decos: DecorationSet;
}

/** Dispatch a toggle for the heading identified by `id` (its blockId). */
export function toggleHeadingFold(view: EditorView, id: string): void {
  view.dispatch(view.state.tr.setMeta(headingFoldKey, { type: 'toggle', id }));
}

/** Whether the heading `id` is currently collapsed. */
export function isHeadingCollapsed(state: EditorState, id: string): boolean {
  const st = headingFoldKey.getState(state);
  return !!st && st.collapsed.has(id);
}

/** True when this heading is immediately followed by non-heading content — i.e.
 *  there are blocks that belong directly to it and can be folded away. A heading
 *  followed straight by another heading (of any level) has nothing of its own. */
function headingHasSection(tops: { node: PmNode }[], i: number): boolean {
  const next = tops[i + 1];
  return !!next && next.node.type.name !== 'heading';
}

function buildFoldDecorations(doc: PmNode, collapsed: Set<string>): DecorationSet {
  const tops: { node: PmNode; offset: number }[] = [];
  doc.forEach((node, offset) => tops.push({ node, offset }));

  const decos: Decoration[] = [];
  for (let i = 0; i < tops.length; i++) {
    const { node, offset } = tops[i];
    if (node.type.name !== 'heading') continue;
    const id = node.attrs.blockId as string | null;
    const foldable = headingHasSection(tops, i);
    if (!foldable) continue;

    const isCollapsed = !!id && collapsed.has(id);

    // Chevron widget in the heading's left margin. `side: -1` keeps it before the
    // heading text; `key` includes the collapsed flag so ProseMirror re-renders
    // the glyph/direction when the fold state flips.
    if (id) {
      decos.push(
        Decoration.widget(
          offset + 1,
          (view) => {
            const dom = document.createElement('span');
            dom.className = 'md-fold-toggle' + (isCollapsed ? ' is-collapsed' : '');
            dom.textContent = isCollapsed ? '▸' : '▾'; // ▸ / ▾
            dom.contentEditable = 'false';
            dom.title = isCollapsed ? 'Rozwiń sekcję' : 'Zwiń sekcję';
            dom.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleHeadingFold(view, id);
            });
            return dom;
          },
          { side: -1, key: `fold-${id}-${isCollapsed ? 'c' : 'e'}`, ignoreSelection: true },
        ),
      );
    }

    // When collapsed, hide the blocks that belong directly to this heading —
    // stop at the next heading of ANY level, so subsections stay under their own.
    if (isCollapsed) {
      for (let j = i + 1; j < tops.length; j++) {
        const t = tops[j];
        if (t.node.type.name === 'heading') break;
        decos.push(Decoration.node(t.offset, t.offset + t.node.nodeSize, { class: 'md-folded-hidden' }));
      }
      decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'md-folded-heading' }));
    }
  }
  return DecorationSet.create(doc, decos);
}

export const HeadingFold = Extension.create({
  name: 'headingFold',

  addProseMirrorPlugins() {
    return [
      new Plugin<FoldPluginState>({
        key: headingFoldKey,
        state: {
          init: (_config, state) => ({ collapsed: new Set(), decos: buildFoldDecorations(state.doc, new Set()) }),
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(headingFoldKey) as { type: 'toggle'; id: string } | undefined;
            let collapsed = value.collapsed;
            if (meta?.type === 'toggle') {
              collapsed = new Set(collapsed);
              if (collapsed.has(meta.id)) collapsed.delete(meta.id);
              else collapsed.add(meta.id);
            }
            // Positions only shift on doc changes; otherwise the existing set is
            // still valid, so skip the (whole-doc) rebuild for selection ticks.
            if (meta || tr.docChanged) {
              return { collapsed, decos: buildFoldDecorations(newState.doc, collapsed) };
            }
            return { collapsed, decos: value.decos };
          },
        },
        props: {
          decorations(state) {
            return headingFoldKey.getState(state)?.decos ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export default HeadingFold;
