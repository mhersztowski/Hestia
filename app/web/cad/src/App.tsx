/**
 * The CAD application's shell: signing in, the subpage bar and room for a subpage.
 *
 * Three subpages, one package each: **Notes** (`@hestia/ui-cad`), the **2D
 * drawing** (`@hestia/ui-cad/cad2d`) and the **3D model** (`@hestia/ui-cad/cad3d`). Accounts
 * and files come from the platform (`app/backend`), through this application's
 * own server (`app/cad`).
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { Project } from '@hestia/ui-cad/cad2d';
import { Drive, Toolbar, item, separator, toggle, custom, type ToolbarNode } from '@hestia/ui-core';
import { platformDrive } from './driveStore';
import { platformStore } from './notesStore';
import { Cad2dPage } from './Cad2dPage';
import { NotesPage } from './NotesPage';
import { platform, platformAvailable, token, saveToken, type User } from './platform';
import {
    PAGE_NAMES, PAGES, hashForPage, pageFromHash, type Page,
} from './pages';

/**
 * The 3D modeller is loaded only when its tab is opened. OpenCascade is a WASM
 * kernel of several megabytes, and nobody opening the notes should wait for it.
 */
const Cad3dPage = lazy(() => import('./Cad3dPage').then((m) => ({ default: m.Cad3dPage })));

export function App() {
    const [user, setUser] = useState<User | null>(null);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        void (async () => {
            if (!token()) { setChecking(false); return; }
            try {
                setUser(await platform.me());
            } catch {
                // The token has expired or the server does not know it — we clear
                // it so the next visit does not try to use it again.
                saveToken(null);
            } finally {
                setChecking(false);
            }
        })();
    }, []);

    if (checking) {
        return (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
                <CircularProgress />
            </Stack>
        );
    }

    if (!user) return <SignIn onSignedIn={setUser} />;

    return (
        <Dashboard
            user={user}
            onSignedOut={() => { saveToken(null); setUser(null); }}
        />
    );
}

function SignIn({ onSignedIn }: { onSignedIn: (u: User) => void }) {
    const [userName, setUserName] = useState('admin');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [waiting, setWaiting] = useState(false);
    const [platformDown, setPlatformDown] = useState(false);

    // Accounts live in the platform. When it is not answering, signing in cannot
    // work, and saying so here is better than letting a correct password come
    // back as an error that reads like a wrong one.
    useEffect(() => {
        void platformAvailable().then((ok) => setPlatformDown(!ok));
    }, []);

    const signIn = async () => {
        setWaiting(true);
        setError(null);
        try {
            const { token: t, user } = await platform.signIn(userName, password);
            saveToken(t);
            onSignedIn(user);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setWaiting(false);
        }
    };

    return (
        <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', p: 2 }}>
            <Paper sx={{ p: 3, width: '100%', maxWidth: 360 }}>
                <Typography variant="h6" gutterBottom>Hestia — CAD</Typography>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField label="User" value={userName} size="small"
                        onChange={(e) => setUserName(e.target.value)} />
                    <TextField label="Password" type="password" value={password} size="small"
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }} />
                    {platformDown && (
                        <Alert severity="warning">
                            The platform is not responding — start `app/backend`.
                        </Alert>
                    )}
                    {error && <Alert severity="error">{error}</Alert>}
                    <Button variant="contained" disabled={waiting || !password}
                        onClick={() => { void signIn(); }}>
                        Sign in
                    </Button>
                </Stack>
            </Paper>
        </Stack>
    );
}

function Dashboard({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
    const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));

    // The address is the source of truth about the subpage, including when the
    // browser's back button or a pasted link changes it.
    useEffect(() => {
        const read = () => setPage(pageFromHash(window.location.hash));
        window.addEventListener('hashchange', read);
        return () => window.removeEventListener('hashchange', read);
    }, []);

    const goTo = useCallback((target: Page) => {
        window.location.hash = hashForPage(target);
        setPage(target);
    }, []);

    // The drive panel: shut when the application opens, because the page is what
    // one comes here for. Its state lives in the shell, so it survives switching
    // subpages — and so does the folder it is showing, which is the point of
    // having one drive rather than three.
    const [driveOpen, setDriveOpen] = useState(false);
    const [driveHeight, setDriveHeight] = useState(260);
    const drive = useMemo(() => platformDrive(), []);

    /**
     * The subpages as toggles in one group: exactly one is on, which is what a
     * set of pages is. They are the same kind of node as everything else in the
     * bar, so the whole strip scrolls together when the window is narrow.
     */
    const nav: ToolbarNode[] = useMemo(() => [
        ...PAGES.map((p) => toggle(p, PAGE_NAMES[p], p === page, {
            group: 'page',
            // Turning the current one off would leave no page showing; clicking
            // the one that is already open simply stays there.
            onChange: () => goTo(p),
        })),
        separator('s1'),
        // The drive rides under every subpage, so its switch belongs in the bar
        // that is also on every subpage.
        toggle('drive', 'Drive', driveOpen, { onChange: setDriveOpen }),
        separator('s2'),
        custom('user', (
            <Box component="span" sx={{ px: 1, fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {user.userName}
            </Box>
        )),
        item('signOut', 'Sign out', { onSelect: onSignedOut }),
    ], [driveOpen, goTo, onSignedOut, page, user.userName]);

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Toolbar nodes={nav} aria-label="pages" sx={{ borderBottom: 'none' }} />
            </Box>

            {/* `minHeight: 0` — without it the element is pushed open by its
                content and the notes canvas gets a height larger than the window,
                with a scrollbar instead of a fit. */}
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <Content page={page} />
            </Box>

            {driveOpen && (
                <>
                    <DriveResizer height={driveHeight} setHeight={setDriveHeight} />
                    <Box sx={{
                        height: driveHeight, flexShrink: 0, overflow: 'hidden',
                        borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
                    }}>
                        {/* Kept mounted while the panel is open and unmounted when
                            it is shut: an unseen drive that keeps listing folders
                            costs requests nobody asked for. */}
                        <Drive store={drive} />
                    </Box>
                </>
            )}
        </Box>
    );
}

/**
 * The edge between the page and the drive, dragged to divide them.
 *
 * A fixed height would be wrong twice over: too tall on a phone, too short when
 * one is actually reading a file.
 */
function DriveResizer({ height, setHeight }: { height: number; setHeight: (h: number) => void }) {
    const start = useRef<{ y: number; h: number } | null>(null);
    return (
        <Box
            onPointerDown={(e) => { start.current = { y: e.clientY, h: height }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => {
                if (!start.current) return;
                // Up is a smaller Y and a taller panel.
                const next = start.current.h - (e.clientY - start.current.y);
                setHeight(Math.max(120, Math.min(window.innerHeight - 160, next)));
            }}
            onPointerUp={(e) => { start.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ } }}
            sx={{
                height: 8, flexShrink: 0, cursor: 'row-resize', touchAction: 'none',
                bgcolor: 'divider', opacity: 0.4, '&:hover': { opacity: 1 },
            }}
        />
    );
}

function Content({ page }: { page: Page }) {
    // The store is built once: `SpenNotesView` keeps it among the dependencies of
    // the effect that refreshes the file list, so a new object on every render
    // would query the server endlessly.
    const store = useMemo(() => platformStore(), []);

    // One drawing for both CAD subpages, built once and kept for as long as the
    // application runs. The 3D modeller sketches on this very project, and the
    // subpages are switched by unmounting one and mounting the other — a project
    // owned by either of them would be thrown away on every switch.
    const project = useMemo(() => new Project(), []);

    switch (page) {
        case 'notes':
            return <NotesPage store={store} />;
        case 'cad2d':
            return <Cad2dPage project={project} />;
        case 'cad3d':
            return (
                <Suspense fallback={<Loading text="Loading the modeller (OpenCascade)…" />}>
                    <Cad3dPage project={project} />
                </Suspense>
            );
    }
}

function Loading({ text }: { text: string }) {
    return (
        <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: '100%' }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">{text}</Typography>
        </Stack>
    );
}
