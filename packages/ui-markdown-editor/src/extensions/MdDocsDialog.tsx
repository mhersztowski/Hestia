/**
 * Generic Markdown documentation dialog used by the help buttons in the
 * various script blocks (Plugin Script, Automate Script, …).
 *
 * Each block owns a tiny wrapper that imports its docs file via Vite's `?raw`
 * pragma and hands the resulting string to this component — that way every
 * help file lands in its own dynamically-imported chunk, so e.g. someone who
 * only opens the Automate Script docs never downloads MDScript.md.
 *
 * Centralising the styling here keeps the docs visually consistent regardless
 * of which block triggered them.
 */

import React from 'react';
import {
  Box, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

export interface MdDocsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Title shown in the dialog header (e.g. "Plugin Script — dokumentacja"). */
  title: string;
  /** Pre-loaded markdown source — caller does the `?raw` import. */
  markdown: string;
  /** Hex accent for header icon / h2 / blockquotes — defaults to the brand purple. */
  accent?: string;
}

const MdDocsDialog: React.FC<MdDocsDialogProps> = ({
  open, onClose, title, markdown, accent = '#7c4dff',
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: '85vh' } }}
    >
      <DialogTitle sx={{ py: 1.25, pr: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <HelpOutlineIcon sx={{ color: accent }} />
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
            {title}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* All Markdown styling is scoped to this Box so it doesn't bleed
            into the host editor — h1/h2/code/table/blockquote tuned for an
            in-dialog reading experience, not full-page docs. */}
        <Box
          sx={{
            px: 3, py: 2,
            overflow: 'auto',
            '& h1': { fontSize: '1.5rem', mt: 0, mb: 1.5, fontWeight: 700 },
            '& h2': { fontSize: '1.2rem', mt: 3, mb: 1, fontWeight: 700, color: accent },
            '& h3': { fontSize: '1rem', mt: 2, mb: 0.75, fontWeight: 600 },
            '& h4': { fontSize: '0.9rem', mt: 1.5, mb: 0.5, fontWeight: 600 },
            '& p': { my: 1, lineHeight: 1.6 },
            '& ul, & ol': { my: 1, pl: 3 },
            '& li': { my: 0.25 },
            '& code': {
              bgcolor: 'rgba(124,77,255,0.1)',
              color: '#5d3acc',
              px: 0.5,
              py: 0.1,
              borderRadius: 0.5,
              fontSize: '0.85em',
              fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
            },
            '& pre': {
              bgcolor: '#1a1040',
              color: '#e0d7ff',
              p: 1.5,
              borderRadius: 1,
              overflow: 'auto',
              fontSize: '0.85em',
              lineHeight: 1.5,
              my: 1.5,
              '& code': {
                bgcolor: 'transparent',
                color: 'inherit',
                p: 0,
                fontSize: 'inherit',
              },
            },
            '& table': {
              borderCollapse: 'collapse',
              my: 1.5,
              fontSize: '0.85em',
              width: '100%',
            },
            '& th, & td': {
              border: '1px solid',
              borderColor: 'divider',
              px: 1,
              py: 0.5,
              textAlign: 'left',
            },
            '& th': { bgcolor: 'action.hover', fontWeight: 600 },
            '& blockquote': {
              borderLeft: '3px solid',
              borderLeftColor: accent,
              pl: 1.5,
              my: 1.5,
              color: 'text.secondary',
              fontStyle: 'italic',
            },
            '& a': { color: accent, textDecoration: 'underline' },
            '& hr': { my: 2, border: 'none', borderTop: '1px solid', borderColor: 'divider' },
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {markdown}
          </ReactMarkdown>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default MdDocsDialog;
