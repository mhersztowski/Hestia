import React, { useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { IconButton, Paper, Divider } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import CodeIcon from '@mui/icons-material/Code';
import LinkIcon from '@mui/icons-material/Link';
import HighlightIcon from '@mui/icons-material/Highlight';

interface MdEditorBubbleMenuProps {
  editor: Editor;
}

const MdEditorBubbleMenu: React.FC<MdEditorBubbleMenuProps> = ({ editor }) => {
  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  return (
    <Paper
      elevation={3}
      sx={{
        display: 'flex',
        alignItems: 'center',
        p: 0.5,
        borderRadius: 1,
      }}
    >
      <IconButton
        size="small"
        onClick={() => editor.chain().focus().toggleBold().run()}
        color={editor.isActive('bold') ? 'primary' : 'default'}
      >
        <FormatBoldIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        color={editor.isActive('italic') ? 'primary' : 'default'}
      >
        <FormatItalicIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        color={editor.isActive('strike') ? 'primary' : 'default'}
      >
        <StrikethroughSIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => editor.chain().focus().toggleCode().run()}
        color={editor.isActive('code') ? 'primary' : 'default'}
      >
        <CodeIcon fontSize="small" />
      </IconButton>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <IconButton
        size="small"
        onClick={setLink}
        color={editor.isActive('link') ? 'primary' : 'default'}
      >
        <LinkIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        color={editor.isActive('highlight') ? 'primary' : 'default'}
      >
        <HighlightIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
};

export default MdEditorBubbleMenu;
