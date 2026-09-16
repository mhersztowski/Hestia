/**
 * The CAD application's shell: signing in, the subpage bar and room for a subpage.
 *
 * Three subpages, one package each: **Notes** (`@hestia/ui-cad`), the **2D
 * drawing** (`@hestia/ui-cad/cad2d`) and the **3D model** (`@hestia/ui-cad/cad3d`). Accounts
 * and files come from the platform (`app/backend`), through this application's
 * own server (`app/cad`).
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Project } from '@hestia/ui-cad/cad2d';
import {
  ActionGroup,
  Drive,
  Toolbar,
  ToolbarCustomItem,
  ToolbarObject,
  Workspace,
  WorkspaceObject,
} from '@hestia/ui-core';
import { platformDrive } from './driveStore';
import { platformStore } from './notesStore';
import { Cad2dPage } from './Cad2dPage';
import { NotesPage } from './NotesPage';
import { platform, platformAvailable, token, saveToken, type User } from './platform';
import { PAGE_NAMES, PAGES, hashForPage, pageFromHash, type Page } from './pages';

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
      if (!token()) {
        setChecking(false);
        return;
      }
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
      onSignedOut={() => {
        saveToken(null);
        setUser(null);
      }}
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
        <Typography variant="h6" gutterBottom>
          Hestia — CAD
        </Typography>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="User"
            value={userName}
            size="small"
            onChange={(e) => setUserName(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            size="small"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void signIn();
            }}
          />
          {platformDown && (
            <Alert severity="warning">The platform is not responding — start `app/backend`.</Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <Button
            variant="contained"
            disabled={waiting || !password}
            onClick={() => {
              void signIn();
            }}
          >
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

  const drive = useMemo(() => platformDrive(), []);

  /**
   * The bar and the workspace, built once and then kept.
   *
   * The bar used to be a tree of literals rebuilt by `useMemo` on every change
   * of page, of the drive switch, of anything: the whole menu was thrown away
   * so that one checkmark could move. Now the `Action`s outlive the renders
   * and only what actually changed is written to them — the effects below say
   * exactly what that is, which is also the list of things this bar reacts to.
   *
   * The workspace belongs to the shell rather than to a page, because the
   * panels do: the drive rides under every subpage, keeps the folder it is
   * showing across a switch, and goes wherever the user drags it. Every
   * subpage draws inside it, so every subpage has panels.
   *
   * The subpages are one exclusive group with `allowNone` off: exactly one is
   * on, which is what a set of pages is. Clicking the page that is already
   * open leaves it open instead of leaving the application showing nothing.
   */
  const { nav, workspace } = useMemo(() => {
    const bar = new ToolbarObject({ objectName: 'pages' });
    const pages = new ActionGroup('page', bar);
    pages.allowNone.value = false;
    for (const p of PAGES) pages.add(bar.addAction({ id: p, text: PAGE_NAMES[p] }));
    bar.addSeparator('s1');

    const area = new WorkspaceObject({ objectName: 'cad', defaultSize: 260 });
    area.addPanel({
      id: 'drive',
      title: 'Drive',
      area: 'bottom',
      size: 260,
      // Shut when the application opens, because the page is what one
      // comes here for. A shut panel is not drawn at all, so a drive
      // nobody is looking at is not listing folders either.
      visible: false,
      content: <Drive store={drive} />,
    });

    // "View" lists the panels and ticks the ones that are open. It is the
    // workspace's menu, moved into the bar — where it is drawn is the bar's
    // business, what it does is the workspace's.
    bar.addItem(area.viewMenu('view', 'View'));

    bar.addSeparator('s2');
    bar.addCustom('user', null);
    bar.addAction({ id: 'signOut', text: 'Sign out' });
    return { nav: bar, workspace: area };
  }, [drive]);
  useEffect(
    () => () => {
      nav.destroy();
      workspace.destroy();
    },
    [nav, workspace]
  );

  // One subscription for every command in the bar, rather than a closure per
  // entry rebuilt whenever anything moves. The View entries need nothing here:
  // the workspace wired them to its own panels when it built the menu.
  useEffect(() => {
    const conn = nav.actionTriggered.connect((action) => {
      if ((PAGES as readonly string[]).includes(action.id)) goTo(action.id as Page);
      else if (action.id === 'signOut') onSignedOut();
    });
    return () => conn.disconnect();
  }, [nav, goTo, onSignedOut]);

  // The address is still the source of truth about the subpage: the group is
  // told what is open, whether that came from a click or from the back button.
  useEffect(() => {
    nav.actionById(page)?.setChecked(true);
  }, [nav, page]);
  useEffect(() => {
    const name = nav.itemById('user');
    if (name instanceof ToolbarCustomItem) {
      name.render.value = (
        <Box
          component="span"
          sx={{ px: 1, fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}
        >
          {user.userName}
        </Box>
      );
    }
  }, [nav, user.userName]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar toolbar={nav} aria-label="pages" sx={{ borderBottom: 'none' }} />
      </Box>

      {/* `minHeight: 0` — without it the element is pushed open by its
                content and the notes canvas gets a height larger than the window,
                with a scrollbar instead of a fit. */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Workspace workspace={workspace}>
          <Content page={page} workspace={workspace} />
        </Workspace>
      </Box>
    </Box>
  );
}

function Content({ page, workspace }: { page: Page; workspace: WorkspaceObject }) {
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
      return <Cad2dPage project={project} workspace={workspace} />;
    case 'cad3d':
      return (
        <Suspense fallback={<Loading text="Loading the modeller (OpenCascade)…" />}>
          <Cad3dPage project={project} workspace={workspace} />
        </Suspense>
      );
  }
}

function Loading({ text }: { text: string }) {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: '100%' }}>
      <CircularProgress />
      <Typography variant="body2" color="text.secondary">
        {text}
      </Typography>
    </Stack>
  );
}
