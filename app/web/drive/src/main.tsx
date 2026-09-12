import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { App } from './App';

/**
 * Monaco's web workers.
 *
 * `@hestia/ui-texteditor` says it plainly: the host configures them before the
 * editor is used. Vite's `?worker` imports are the way to do it here, and
 * without this the editor loads but its language services never start — no
 * completion, no diagnostics, and nothing on screen that says why.
 */
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

(globalThis as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker(_id: string, label: string) {
        if (label === 'typescript' || label === 'javascript') return new TsWorker();
        if (label === 'json') return new JsonWorker();
        if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
        if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
        return new EditorWorker();
    },
};

/**
 * A light theme, as in the platform and the finance application. The CAD
 * application is the deliberate exception there, not the rule.
 */
const theme = createTheme({
    palette: { mode: 'light' },
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
