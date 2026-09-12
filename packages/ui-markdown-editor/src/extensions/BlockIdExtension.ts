import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

// Types that get blockId via addGlobalAttributes (standard Tiptap nodes without own blockId attr)
const STANDARD_BLOCK_TYPES = ['heading', 'paragraph', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'table'];

// Additional custom node types that manage their own blockId attr but still need auto-UUID assignment
const CUSTOM_BLOCK_TYPES = ['rawMarkdownBlock', 'tableView'];

const ALL_BLOCK_TYPES = [...STANDARD_BLOCK_TYPES, ...CUSTOM_BLOCK_TYPES];

/**
 * Assigns a persistent, UNIQUE UUID to every block-level node.
 * IDs are serialized as data-block-id HTML attributes and round-trip through
 * markdown as <!-- bid:uuid --> comments (see markdownConverter.ts).
 *
 * Uniqueness matters: block references (`[[#^id]]`), embeds (`![[#^id]]`),
 * "Copy Id" and block navigation all resolve by id, so a duplicate would make
 * them ambiguous. Operations that clone a block's attrs — splitting a block with
 * Enter, pasting, duplicating, drag-drop — carry the SOURCE id onto the new node,
 * so we can't just fill in missing ids; every pass also reassigns any id already
 * seen earlier in the document. That also heals documents saved before this fix.
 */
export const BlockIdExtension = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: STANDARD_BLOCK_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-block-id') || null,
            renderHTML: (attrs) => attrs.blockId ? { 'data-block-id': attrs.blockId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const tr = newState.tr;
          const seen = new Set<string>();
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (!(ALL_BLOCK_TYPES.includes(node.type.name) && node.isBlock)) return;
            const id = node.attrs.blockId as string | null;
            // Missing OR duplicate (already used by an earlier block) → fresh id.
            // setNodeMarkup only changes attrs (not node size), so positions
            // captured from newState.doc stay valid across multiple edits on `tr`.
            if (!id || seen.has(id)) {
              const newId = crypto.randomUUID();
              tr.setNodeMarkup(pos, null, { ...node.attrs, blockId: newId });
              seen.add(newId);
              modified = true;
            } else {
              seen.add(id);
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});
