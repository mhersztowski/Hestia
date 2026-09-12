import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import type { ChatSession } from '../types';
import { ChatMessages } from './ChatMessages';

interface ChatSessionViewerProps {
  session: ChatSession;
  onFileClick?: (path: string) => void;
}

export function ChatSessionViewer({ session, onFileClick }: ChatSessionViewerProps) {
  const visibleCount = session.messages.filter(m => m.role !== 'tool').length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#252526' }}>
      <Box sx={{
        px: 1.5, py: 0.75,
        borderBottom: '1px solid #3c3c3c',
        flexShrink: 0,
      }}>
        <Typography sx={{ fontSize: 11, color: '#858585' }}>
          {new Date(session.savedAt).toLocaleString()} &middot; {visibleCount} messages
        </Typography>
      </Box>
      <ChatMessages messages={session.messages} processing={false} onFileClick={onFileClick} />
    </Box>
  );
}
