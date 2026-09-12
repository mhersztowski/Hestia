/**
 * CalloutExtension — blok wyróżnienia znany z Notion.
 *
 * Kolorowa ramka z ikoną, w środku dowolna treść (akapity, listy, kod).
 * Typ zmienia się kliknięciem w ikonę; pięć wariantów odpowiada alertom
 * GitHuba, bo w takiej postaci blok jest zapisywany w markdownie
 * (`> [!NOTE]` — szczegóły i powód w `utils/callout.ts`).
 *
 * Treść trzymamy w natywnym `contentDOM`, a nie w atrybucie: dzięki temu działa
 * w niej całe zwykłe pisanie — zaznaczanie, listy, wklejanie, undo — bez
 * dublowania logiki edytora.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { Box, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip } from '@mui/material';
import { CALLOUT_VARIANTS, isCalloutVariant, type CalloutVariant } from '../utils/callout';

const DEFAULT_VARIANT: CalloutVariant = 'note';

function CalloutNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const variant: CalloutVariant = isCalloutVariant(String(node.attrs.variant ?? ''))
    ? (String(node.attrs.variant).toLowerCase() as CalloutVariant)
    : DEFAULT_VARIANT;
  const style = CALLOUT_VARIANTS[variant];
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  return (
    <NodeViewWrapper>
      <Box
        sx={{
          display: 'flex',
          gap: 1.25,
          my: 1.5,
          px: 1.5,
          py: 1.25,
          borderRadius: 1,
          borderLeft: '4px solid',
          borderColor: style.color,
          // Tło z koloru wariantu — czytelne w obu motywach, bo półprzezroczyste.
          bgcolor: `${style.color}14`,
        }}
      >
        <Tooltip title={editor.isEditable ? `${style.label} — kliknij, by zmienić typ` : style.label}>
          <Box
            component="span"
            contentEditable={false}
            onClick={(e: React.MouseEvent<HTMLElement>) => {
              if (editor.isEditable) setMenuAnchor(e.currentTarget);
            }}
            sx={{
              flexShrink: 0, fontSize: 20, lineHeight: 1.4, userSelect: 'none',
              cursor: editor.isEditable ? 'pointer' : 'default',
            }}
          >
            {style.emoji}
          </Box>
        </Tooltip>

        {/* Treść bloku — natywny contentDOM, więc zachowuje się jak reszta dokumentu. */}
        <NodeViewContent className="callout-content" style={{ flex: 1, minWidth: 0 }} />
      </Box>

      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
        {(Object.keys(CALLOUT_VARIANTS) as CalloutVariant[]).map((key) => (
          <MenuItem
            key={key}
            selected={key === variant}
            onClick={() => { updateAttributes({ variant: key }); setMenuAnchor(null); }}
          >
            <ListItemIcon sx={{ fontSize: 18, minWidth: 32 }}>{CALLOUT_VARIANTS[key].emoji}</ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{CALLOUT_VARIANTS[key].label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: DEFAULT_VARIANT,
        parseHTML: (el) => el.getAttribute('data-callout') || DEFAULT_VARIANT,
        renderHTML: (attrs) => ({ 'data-callout': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'md-callout' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },

  addCommands() {
    return {
      setCallout: (variant: CalloutVariant = DEFAULT_VARIANT) => ({ commands }) =>
        // `wrapIn` zamiast `insertContent`: zaznaczony akapit wchodzi do środka,
        // więc „zamień w callout" działa na istniejącym tekście, a przy pustym
        // zaznaczeniu powstaje pusty blok gotowy do pisania.
        commands.wrapIn(this.name, { variant }),
      toggleCallout: (variant: CalloutVariant = DEFAULT_VARIANT) => ({ commands }) =>
        commands.toggleWrap(this.name, { variant }),
      unsetCallout: () => ({ commands }) => commands.lift(this.name),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant?: CalloutVariant) => ReturnType;
      toggleCallout: (variant?: CalloutVariant) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}
