import React, { useCallback, useState } from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, IconButton, Divider } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TagIcon from '@mui/icons-material/Tag';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import CodeIcon from '@mui/icons-material/Code';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import type { Editor } from '@tiptap/react';
import { toggleHeadingFold, isHeadingCollapsed } from './extensions/HeadingFoldExtension';
import { copyBlocks, readBlocksForPaste } from './utils/blockClipboard';
import { blockToRaw, rawToRendered, isRawMarkdownBlock } from './extensions/RawMarkdownBlockExtension';
import { CADVIEW_EDIT_EVENT, getCadExternalUrl } from './extensions/CadViewExtension';

export function getBlockId(el: HTMLElement): string | null {
  return (
    el.getAttribute('data-block-id') ||
    el.querySelector('[data-block-id]')?.getAttribute('data-block-id') ||
    null
  );
}

interface BlockActionMenuProps {
  viewportTop: number;
  viewportLeft: number;
  blockEl: HTMLElement;
  /** Document position of the top-level block (from MdEditor's block map). */
  blockPos?: number;
  editor?: Editor | null;
  onMenuOpenChange: (open: boolean) => void;
}

export const BlockActionMenu: React.FC<BlockActionMenuProps> = ({
  viewportTop,
  viewportLeft,
  blockEl,
  blockPos,
  editor,
  onMenuOpenChange,
}) => {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const openMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    onMenuOpenChange(true);
  }, [onMenuOpenChange]);

  const closeMenu = useCallback(() => {
    setMenuAnchor(null);
    onMenuOpenChange(false);
  }, [onMenuOpenChange]);

  // Resolve the block's live range [from, to). Recomputed on demand so it stays
  // valid even though `blockPos` was captured when the menu opened.
  const nodeRange = useCallback(() => {
    if (!editor || typeof blockPos !== 'number') return null;
    const node = editor.state.doc.nodeAt(blockPos);
    if (!node) return null;
    return { from: blockPos, to: blockPos + node.nodeSize };
  }, [editor, blockPos]);

  const handleCopy = useCallback(() => {
    const r = nodeRange();
    closeMenu();
    if (!editor || !r) return;
    const node = editor.state.doc.nodeAt(r.from);
    if (node) void copyBlocks(editor, [node]);
  }, [editor, nodeRange, closeMenu]);

  const handleCut = useCallback(() => {
    const r = nodeRange();
    closeMenu();
    if (!editor || !r) return;
    const node = editor.state.doc.nodeAt(r.from);
    if (node) void copyBlocks(editor, [node]);
    editor.chain().focus().deleteRange(r).run();
  }, [editor, nodeRange, closeMenu]);

  const handleDelete = useCallback(() => {
    if (!editor) return closeMenu();
    const r = nodeRange();
    if (r) editor.chain().focus().deleteRange(r).run();
    closeMenu();
  }, [editor, nodeRange, closeMenu]);

  const handlePaste = useCallback(() => {
    const r = nodeRange();
    closeMenu();                       // close first — a system clipboard read may prompt for permission
    if (!editor || !r) return;
    void (async () => {
      const content = await readBlocksForPaste();   // in-app clipboard first (mobile-safe)
      if (!content) return;
      // Re-resolve the range — the doc may have changed while the async read ran.
      const node = editor.state.doc.nodeAt(r.from);
      const to = node ? r.from + node.nodeSize : r.to;
      editor.chain().focus().insertContentAt(to, content).run();
    })();
  }, [editor, nodeRange, closeMenu]);

  const handleToggleRaw = useCallback(() => {
    closeMenu();
    if (!editor || typeof blockPos !== 'number') return;
    if (isRawMarkdownBlock(editor, blockPos)) rawToRendered(editor, blockPos);
    else blockToRaw(editor, blockPos);
  }, [editor, blockPos, closeMenu]);

  const handleCopyId = useCallback(() => {
    const id = getBlockId(blockEl);
    if (id) navigator.clipboard?.writeText(`#${id}`).catch(() => { /* ignore */ });
    closeMenu();
  }, [blockEl, closeMenu]);

  const blockId = menuAnchor ? getBlockId(blockEl) : null;
  const canEditBlock = !!(editor && typeof blockPos === 'number');

  // Węzeł tego bloczka — do akcji specyficznych dla typu (CAD, skrypt automatyzacji itd.).
  const blockNode = (menuAnchor && editor && typeof blockPos === 'number') ? editor.state.doc.nodeAt(blockPos) : null;
  const blockType = blockNode?.type.name;
  const dispatchBlock = useCallback((name: string, detail: unknown) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
    closeMenu();
  }, [closeMenu]);
  const cadUrl = blockType === 'cadViewEmbed' && blockNode ? getCadExternalUrl(blockNode.attrs) : '';
  const isRaw = !!(menuAnchor && editor && typeof blockPos === 'number' && isRawMarkdownBlock(editor, blockPos));
  // Fold action only makes sense on headings — the section fold hangs off them.
  const isHeading = /^H[1-6]$/.test(blockEl.tagName);
  const collapsed = !!(isHeading && blockId && editor && isHeadingCollapsed(editor.state, blockId));

  const handleToggleFold = useCallback(() => {
    if (editor && blockId) toggleHeadingFold(editor.view, blockId);
    closeMenu();
  }, [editor, blockId, closeMenu]);

  return (
    <>
      <IconButton
        size="small"
        onClick={openMenu}
        sx={{
          position: 'fixed',
          top: viewportTop,
          left: viewportLeft,
          width: 20,
          height: 20,
          opacity: 0.3,
          '&:hover': { opacity: 1, bgcolor: 'action.hover' },
          zIndex: 1200,
          pointerEvents: 'auto',
        }}
      >
        <MoreVertIcon sx={{ fontSize: 14 }} />
      </IconButton>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {/* Akcje specyficzne dla typu bloczka (przeniesione z nagłówków osadzeń). */}
        {blockType === 'cadViewEmbed' && [
          <MenuItem key="cad-edit" dense onClick={() => dispatchBlock(CADVIEW_EDIT_EVENT, { pos: blockPos })}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Change project" />
          </MenuItem>,
          cadUrl ? (
            <MenuItem key="cad-open" dense onClick={() => { window.open(cadUrl, '_blank', 'noopener,noreferrer'); closeMenu(); }}>
              <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Open in CAD app" />
            </MenuItem>
          ) : null,
          <Divider key="cad-div" />,
        ]}
        {canEditBlock && (
          <MenuItem onClick={handleCopy} dense>
            <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Kopiuj" />
          </MenuItem>
        )}
        {canEditBlock && (
          <MenuItem onClick={handleCut} dense>
            <ListItemIcon><ContentCutIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Wytnij" />
          </MenuItem>
        )}
        {canEditBlock && (
          <MenuItem onClick={handlePaste} dense>
            <ListItemIcon><ContentPasteIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Wklej" secondary="pod blokiem" />
          </MenuItem>
        )}
        {canEditBlock && (
          <MenuItem onClick={handleDelete} dense sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText primary="Usuń" />
          </MenuItem>
        )}
        {canEditBlock && (
          <MenuItem onClick={handleToggleRaw} dense>
            <ListItemIcon>{isRaw ? <VisibilityIcon fontSize="small" /> : <CodeIcon fontSize="small" />}</ListItemIcon>
            <ListItemText primary={isRaw ? 'Pokaż jako podgląd' : 'Pokaż jako markdown'} />
          </MenuItem>
        )}
        {canEditBlock && <Divider />}

        {isHeading && editor && blockId && (
          <MenuItem onClick={handleToggleFold} dense>
            <ListItemIcon>{collapsed ? <UnfoldMoreIcon fontSize="small" /> : <UnfoldLessIcon fontSize="small" />}</ListItemIcon>
            <ListItemText primary={collapsed ? 'Rozwiń sekcję' : 'Zwiń sekcję'} />
          </MenuItem>
        )}
        <MenuItem onClick={handleCopyId} dense disabled={!blockId} title={blockId ?? undefined}>
          <ListItemIcon><TagIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Kopiuj Id"
            secondary={blockId ? blockId.slice(0, 8) + '…' : 'brak id'}
          />
        </MenuItem>
      </Menu>
    </>
  );
};
