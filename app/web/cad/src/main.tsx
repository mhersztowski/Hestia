import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { configureFreecadIcons } from '@hestia/ui-cad/cad2d';
import { App } from './App';

/**
 * The CAD toolbars draw FreeCAD's icons for the tools MUI has no icon for. The
 * files ship with `@hestia/ui-cad`, and Vite serves them under this address —
 * see the `freecadIcons` plugin in `vite.config.ts`. Without it the toolbars
 * still work; they simply fall back to MUI icons where FreeCAD's are missing.
 */
configureFreecadIcons({ baseUrl: '/freecad-icons' });

/**
 * A **dark** theme — and this is not a matter of taste.
 *
 * The pages came from `cad-app`, where the whole application is dark, and they
 * have colours written into them directly (`rgba(255,255,255,0.7)` on toolbar
 * icons, white borders on active buttons). On a light background half the
 * toolbar disappears: the buttons **are** there and they respond to clicks, they
 * just cannot be seen — a symptom indistinguishable from broken rendering. The
 * other Hestia applications are light, so this difference is deliberate and
 * local to this one.
 *
 * The 3D modeller is the exception, and it handles itself: it wraps its own
 * panels in a light theme, because its viewport is built for a light
 * background.
 */
const theme = createTheme({
    palette: {
        mode: 'dark',
        background: { default: '#121212', paper: '#1a1a1a' },
    },
    shape: { borderRadius: 10 },
    typography: { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
        </ThemeProvider>
    </StrictMode>,
);
