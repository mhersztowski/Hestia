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

import { useMemo, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { DrivePage } from '@hestia/ui-core';
import { platformVfs } from './driveVfs';
import { platformProvider } from './fsProvider';
import { useDriveCapabilities } from './capabilities';
import { platform, saveToken, token, type User } from './platform';

export function App() {
    const [user, setUser] = useState<User | null>(null);
    const [checking, setChecking] = useState(true);

    // The page works on a `DriveVfs`; the smaller `DriveStore` an editor or an
    // assistant is handed, it derives itself from this one object.
    const vfs = useMemo(() => platformVfs(), []);
    const provider = useMemo(() => platformProvider(), []);

    // Both are the page's business now: it renders the assistant's panel, so it
    // passes its own handlers in the render context and these stay unused.
    const capabilities = useDriveCapabilities({
        provider,
        user,
        token: token(),
        onOpenFile: () => {},
        onFilesChanged: () => {},
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

    // The page is the whole application: the listing, the favourites, the
    // actions, the search and every panel are its own. What it cannot know —
    // where the files are, and who edits, assists or displays them — arrives
    // here as props.
    return (
        <Box sx={{ height: '100vh', overflow: 'hidden' }}>
            <DrivePage
                vfs={vfs}
                editor={capabilities.editor}
                assistant={capabilities.assistant}
                viewers={capabilities.viewers}
            />
        </Box>
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
