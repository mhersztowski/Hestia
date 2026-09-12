import { Node, mergeAttributes } from '@tiptap/core';

// Column node - individual column that can contain any block content
export const Column = Node.create({
  name: 'column',
  group: 'column',
  content: 'block+',
  isolating: false,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      width: {
        default: '50%',
        parseHTML: element => element.getAttribute('data-width') || element.style.width || '50%',
        renderHTML: attributes => ({
          'data-width': attributes.width,
          style: `width: ${attributes.width}; flex-shrink: 0; min-width: 0; padding: 12px; box-sizing: border-box;`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-column]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-column': '', class: 'column-node' }), 0];
  },
});

// Column Layout node - uses NodeView for UI controls but native contentDOM for editing
export const ColumnLayout = Node.create({
  name: 'columnLayout',
  group: 'block',
  content: 'column{2,3}',
  isolating: true,
  defining: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-column-layout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-column-layout': '',
      class: 'column-layout-container',
    }), 0];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      // Main wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'column-layout-wrapper';

      // Container with border and controls
      const container = document.createElement('div');
      container.className = 'column-layout-box';
      container.style.position = 'relative';

      // Toolbar (hidden by default, shown on hover)
      const toolbar = document.createElement('div');
      toolbar.className = 'column-layout-toolbar';
      toolbar.contentEditable = 'false';

      // Width presets for 2 columns
      const presets2Col = [
        { widths: [50, 50] },
        { widths: [33.3, 66.7] },
        { widths: [66.7, 33.3] },
        { widths: [25, 75] },
        { widths: [75, 25] },
      ];

      // Width presets for 3 columns
      const presets3Col = [
        { widths: [33.3, 33.3, 33.4] },
        { widths: [25, 50, 25] },
        { widths: [50, 25, 25] },
        { widths: [25, 25, 50] },
      ];

      // Container for preset buttons
      const presetsContainer = document.createElement('div');
      presetsContainer.className = 'column-presets';

      // Helper to create visual preset button
      const createPresetButton = (widths: number[]): HTMLButtonElement => {
        const btn = document.createElement('button');
        btn.className = 'column-preset-btn';
        btn.title = widths.map(w => Math.round(w)).join('/');

        // Create visual representation
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 14');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '14');

        let x = 0;
        widths.forEach((w) => {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          const width = (w / 100) * 24;
          rect.setAttribute('x', String(x));
          rect.setAttribute('y', '0');
          rect.setAttribute('width', String(width - 0.5));
          rect.setAttribute('height', '14');
          rect.setAttribute('rx', '1');
          rect.setAttribute('fill', 'currentColor');
          svg.appendChild(rect);
          x += width;
        });

        btn.appendChild(svg);
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          setColumnWidths(widths);
        };

        return btn;
      };

      const addBtn = document.createElement('button');
      addBtn.className = 'column-btn column-btn-add';
      addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
      addBtn.title = 'Add column';
      addBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        addColumn();
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'column-btn column-btn-remove';
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
      removeBtn.title = 'Remove column';
      removeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeColumn();
      };

      toolbar.appendChild(presetsContainer);
      toolbar.appendChild(addBtn);
      toolbar.appendChild(removeBtn);

      // Content area where ProseMirror renders columns
      const contentDOM = document.createElement('div');
      contentDOM.className = 'column-layout-content';
      contentDOM.setAttribute('data-column-layout', '');

      container.appendChild(toolbar);
      container.appendChild(contentDOM);
      wrapper.appendChild(container);

      // Helper functions
      const getColumnWidthsFromEditor = (): number[] => {
        const pos = getPos();
        if (typeof pos !== 'number') return [50, 50];

        const resolvedPos = editor.state.doc.resolve(pos);
        const currentNode = resolvedPos.nodeAfter;
        if (!currentNode) return [50, 50];

        const widths: number[] = [];
        currentNode.content.forEach((child) => {
          const width = child.attrs.width || '50%';
          const numericWidth = parseFloat(width);
          widths.push(isNaN(numericWidth) ? 50 : numericWidth);
        });
        return widths.length > 0 ? widths : [50, 50];
      };

      const setColumnWidths = (widths: number[]) => {
        const pos = getPos();
        if (typeof pos !== 'number') return;

        const resolvedPos = editor.state.doc.resolve(pos);
        const currentNode = resolvedPos.nodeAfter;
        if (!currentNode) return;

        const columnCount = currentNode.content.childCount;
        if (widths.length !== columnCount) return;

        let tr = editor.state.tr;
        let currentPos = pos + 1;

        // Note: Fragment.forEach signature is (node, offset, index)
        // We need the 3rd parameter (index), not the 2nd (offset)
        currentNode.content.forEach((child, _offset, index) => {
          tr = tr.setNodeMarkup(currentPos, undefined, {
            ...child.attrs,
            width: `${widths[index]}%`,
          });
          currentPos += child.nodeSize;
        });

        editor.view.dispatch(tr);
      };

      const updateToolbar = () => {
        const pos = getPos();
        if (typeof pos !== 'number') return;

        const resolvedPos = editor.state.doc.resolve(pos);
        const currentNode = resolvedPos.nodeAfter;
        if (!currentNode) return;

        const columnCount = currentNode.content.childCount;
        addBtn.style.display = columnCount >= 3 ? 'none' : '';
        removeBtn.title = columnCount > 2 ? 'Remove last column' : 'Remove column layout';

        // Update preset buttons based on column count
        presetsContainer.innerHTML = '';
        const presets = columnCount === 2 ? presets2Col : presets3Col;
        const currentWidths = getColumnWidthsFromEditor();

        presets.forEach(preset => {
          const btn = createPresetButton(preset.widths);

          // Mark active preset
          const isActive = preset.widths.every((w, i) =>
            Math.abs(w - currentWidths[i]) < 1
          );
          if (isActive) {
            btn.classList.add('active');
          }

          presetsContainer.appendChild(btn);
        });
      };

      const addColumn = () => {
        const pos = getPos();
        const columnCount = node.content.childCount;
        if (typeof pos !== 'number' || columnCount >= 3) return;

        const newWidth = Math.round(100 / (columnCount + 1) * 10) / 10;

        // Update existing columns
        let currentPos = pos + 1;
        node.content.forEach((child) => {
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(currentPos, undefined, {
              ...child.attrs,
              width: `${newWidth}%`,
            })
          );
          currentPos += child.nodeSize;
        });

        // Insert new column
        editor.chain()
          .insertContentAt(pos + node.nodeSize - 1, {
            type: 'column',
            attrs: { width: `${newWidth}%` },
            content: [{ type: 'paragraph' }],
          })
          .focus()
          .run();
      };

      const removeColumn = () => {
        const pos = getPos();
        const columnCount = node.content.childCount;
        if (typeof pos !== 'number') return;

        if (columnCount <= 2) {
          // Delete entire layout
          editor.chain()
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .focus()
            .run();
          return;
        }

        const newWidth = Math.round(100 / (columnCount - 1) * 10) / 10;

        // Find last column position
        let lastColumnPos = pos + 1;
        for (let i = 0; i < columnCount - 1; i++) {
          lastColumnPos += node.content.child(i).nodeSize;
        }
        const lastColumnSize = node.content.child(columnCount - 1).nodeSize;

        // Delete last column
        editor.chain()
          .deleteRange({ from: lastColumnPos, to: lastColumnPos + lastColumnSize })
          .run();

        // Update remaining column widths
        setTimeout(() => {
          const newPos = getPos();
          if (typeof newPos !== 'number') return;

          let currentPos = newPos + 1;
          for (let i = 0; i < columnCount - 1; i++) {
            const child = node.content.maybeChild(i);
            if (child) {
              editor.view.dispatch(
                editor.state.tr.setNodeMarkup(currentPos, undefined, {
                  ...child.attrs,
                  width: `${newWidth}%`,
                })
              );
              currentPos += child.nodeSize;
            }
          }
        }, 0);
      };

      // Initialize
      updateToolbar();

      return {
        dom: wrapper,
        contentDOM,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'columnLayout') return false;
          node = updatedNode;
          updateToolbar();
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      setColumns: (columnCount: 2 | 3) => ({ commands }) => {
        const width = Math.round(100 / columnCount * 10) / 10;
        const columns = Array.from({ length: columnCount }, () => ({
          type: 'column',
          attrs: { width: `${width}%` },
          content: [{ type: 'paragraph' }],
        }));

        return commands.insertContent({
          type: 'columnLayout',
          content: columns,
        });
      },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columnLayout: {
      setColumns: (columnCount: 2 | 3) => ReturnType;
    };
  }
}
