import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { App } from './App';

const motyw = createTheme({
    palette: { mode: 'light', background: { default: '#f6f7f9' } },
    shape: { borderRadius: 10 },
    typography: { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider theme={motyw}>
            <CssBaseline />
            <App />
        </ThemeProvider>
    </StrictMode>,
);
