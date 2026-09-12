import { TableHeader } from '@tiptap/extension-table-header';

// Extend TableHeader to output width styles properly
export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colwidth: {
        default: null,
        parseHTML: (element) => {
          const colwidth = element.getAttribute('colwidth');
          const style = element.getAttribute('style') || '';

          // Try to get width from colwidth attribute first
          if (colwidth) {
            const widths = colwidth.split(',').map((w: string) => parseInt(w, 10));
            return widths;
          }

          // Try to get width from style
          const widthMatch = style.match(/width:\s*(\d+)px/);
          if (widthMatch) {
            return [parseInt(widthMatch[1], 10)];
          }

          return null;
        },
        renderHTML: (attributes) => {
          if (!attributes.colwidth) {
            return {};
          }

          const width = Array.isArray(attributes.colwidth)
            ? attributes.colwidth[0]
            : attributes.colwidth;

          return {
            colwidth: attributes.colwidth.join(','),
            style: `width: ${width}px`,
          };
        },
      },
    };
  },
});

export default CustomTableHeader;
