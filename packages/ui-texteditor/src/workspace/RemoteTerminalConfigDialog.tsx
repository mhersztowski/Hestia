import { useState, useEffect, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

export interface RemoteTerminalConfigDialogProps {
  open: boolean;
  /** Currently saved API key (empty string when none). */
  currentToken: string;
  /** Human-readable name of the terminal server, shown in the dialog body. */
  serverName: string;
  /** URL where the user can generate an API key. When empty, the link is hidden. */
  apiKeysUrl?: string;
  onSave: (token: string) => void;
  onClose: () => void;
}

/**
 * API-key dialog for the editor's remote terminal. The terminal connects to a
 * server that may require its own credential (separate from the host app's
 * session). Server identity is supplied by the host via props so the dialog
 * stays reusable.
 */
export function RemoteTerminalConfigDialog({
  open,
  currentToken,
  serverName,
  apiKeysUrl,
  onSave,
  onClose,
}: RemoteTerminalConfigDialogProps) {
  const [draft, setDraft] = useState(currentToken);

  useEffect(() => {
    if (open) setDraft(currentToken);
  }, [open, currentToken]);

  const handleSave = useCallback(() => {
    onSave(draft.trim());
  }, [draft, onSave]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Remote Terminal — API Key</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The terminal connects to <strong>{serverName}</strong>. This server requires
          its own API key — your local session token is not accepted there.
        </Typography>
        {apiKeysUrl && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Generate an API key at{' '}
            <Link href={apiKeysUrl} target="_blank" rel="noopener">
              {serverName} → Tools → API Keys
            </Link>
            , then paste it below.
          </Typography>
        )}
        <TextField
          label="API Key"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          fullWidth
          size="small"
          placeholder="minis_..."
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
        />
      </DialogContent>
      <DialogActions>
        {currentToken && (
          <Button color="error" onClick={() => onSave('')} sx={{ mr: 'auto' }}>
            Clear
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!draft.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
