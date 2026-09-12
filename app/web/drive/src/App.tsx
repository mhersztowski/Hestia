/**
 * The Drive application's shell: signing in, the drive, and a panel for
 * whatever is open.
 *
 * Four packages meet here and none of them knows about the others.
 * `@hestia/ui-core` gives the drive, `@hestia/ui-markdown-editor` the Markdown
 * editor, `@hestia/ui-texteditor` the code editor and `@hestia/ui-ai` the
 * assistant. What joins them is `capabilities.tsx`, in the shapes
 * `@hestia/ui-core` defines — so the day `DrivePage` lands, the wiring moves
 * across rather than being written again.
 *
 * Accounts and files come from the platform (`app/backend`), through this
 * application's own server (`app/drive`).
 */

import { useCallback, useMemo, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Divider, IconButton, Paper, Stack,
    TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { Drive, type DriveEntry, type DriveFileRef } from '@hestia/ui-core';
import { platformDrive } from './driveStore';
import { platformProvider } from './fsProvider';
import { useDriveCapabilities } from './capabilities';
import { platform, saveToken, token, type User } from './platform';

export function App() {
    const [user, setUser] = useState<User | null>(null);
    const [checking, setChecking] = useState(true);
    const [open, setOpen] = useState<DriveFileRef | null>(null);
    const [assistantOpen, setAssistantOpen] = useState(false);
    // Bumped whenever something writes; the drive re-lists on a new key rather
    // than polling, so nothing moves under the user while they read.
    const [listingKey, setListingKey] = useState(0);

    const store = useMemo(() => platformDrive(), []);
    const provider = useMemo(() => platformProvider(), []);

    const openPath = useCallback((path: string) => {
        setOpen({ path, name: path.split('/').pop() ?? path, store });
    }, [store]);

    const capabilities = useDriveCapabilities({
        provider,
        user,
        token: token(),
        onOpenFile: openPath,
        onFilesChanged: () => setListingKey((k) => k + 1),
    });

    useMemo(() => {
        void (async () => {
            if (!token()) { setChecking(false); return; }
            try {
                setUser(await platform.me());
            } catch {
                // The token has expired or the server does not know it — clearing
                // it stops the next visit from trying the same one again.
                saveToken(null);
            } finally {
                setChecking(false);
            }
        })();
    }, []);

    if (checking) {
        return (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
                <CircularProgress />
            </Stack>
        );
    }

    if (!user) return <SignIn onSignedIn={setUser} />;

    const onOpenFile = (path: string, entry: DriveEntry) => {
        if (entry.directory) return;
        setOpen({ path, name: entry.name, store });
    };

    return (
        <Stack direction="row" sx={{ height: '100vh', overflow: 'hidden' }}>
            <Box sx={{ flex: open ? '0 0 340px' : 1, minWidth: 0, borderRight: 1, borderColor: 'divider' }}>
                <Drive
                    key={listingKey}
                    store={store}
                    onOpenFile={onOpenFile}
                    toolbarStart={
                        capabilities.assistant ? (
                            <Tooltip title={capabilities.assistant.label ?? 'Assistant'}>
                                <IconButton size="small" onClick={() => setAssistantOpen((v) => !v)}>
                                    <SmartToyIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        ) : null
                    }
                />
            </Box>

            {open && (
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Stack
                        direction="row" alignItems="center" spacing={1}
                        sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }}
                    >
                        <Typography variant="body2" sx={{ flex: 1, fontFamily: 'monospace' }}>
                            {open.path}
                        </Typography>
                        <IconButton size="small" onClick={() => setOpen(null)}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                    <Box sx={{ flex: 1, minHeight: 0 }}>
                        {capabilities.editor.render(open, { onClose: () => setOpen(null) })}
                    </Box>
                </Stack>
            )}

            {assistantOpen && capabilities.assistant && (
                <>
                    <Divider orientation="vertical" flexItem />
                    <Box sx={{ flex: '0 0 400px', minHeight: 0, overflow: 'hidden' }}>
                        {capabilities.assistant.render(
                            { store, dir: '', file: open },
                            { onClose: () => setAssistantOpen(false) },
                        )}
                    </Box>
                </>
            )}
        </Stack>
    );
}

/**
 * Signing in.
 *
 * The same form as the other applications, and for the same reason: the account
 * is the platform's, so there is nothing to register here — only a token to
 * fetch and keep.
 */
function SignIn({ onSignedIn }: { onSignedIn: (user: User) => void }) {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const { token: fresh } = await platform.signIn(name, password);
            saveToken(fresh);
            onSignedIn(await platform.me());
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh', p: 2 }}>
            <Paper sx={{ p: 3, width: 360 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Hestia — Drive</Typography>
                <Stack spacing={2}>
                    <TextField
                        label="User" size="small" value={name} autoFocus
                        onChange={(e) => setName(e.target.value)}
                    />
                    <TextField
                        label="Password" size="small" type="password" value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
                    />
                    {error && <Alert severity="error">{error}</Alert>}
                    <Button variant="contained" disabled={busy || !name} onClick={() => void submit()}>
                        {busy ? 'Signing in…' : 'Sign in'}
                    </Button>
                </Stack>
            </Paper>
        </Stack>
    );
}
