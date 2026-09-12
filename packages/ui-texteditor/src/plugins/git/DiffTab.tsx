/**
 * DiffTab.tsx — widok różnic pliku, otwierany jako zakładka edytora.
 *
 * Różnicę liczy **Monaco**, a nie git: `createDiffEditor` dostaje dwa modele —
 * treść z rewizji i treść bieżącą — i sam pokazuje, co się zmieniło. Dzięki temu
 * mamy zwijanie niezmienionych fragmentów, podświetlanie w wierszu i nawigację
 * po zmianach za darmo, a z serwera wystarczy pobrać tekst „przed".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { Alert, Box, Button, Stack, Tooltip, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { MOTYW_ZAKLADKI } from './theme';
import { describeHunk, diffLines, endsWithNewline, formatPatch, splitLines, toHunks } from './hunks';

export interface DiffTabProps {
    /** Ścieżka pliku względem korzenia repozytorium — do tytułu i języka. */
    path: string;
    /** Treść z rewizji (zwykle HEAD); pusta dla nowego pliku. */
    original: string;
    /** Treść bieżąca z katalogu roboczego. */
    modified: string;
    /** Etykieta rewizji po lewej stronie. */
    ref?: string;
    /**
     * Nakłada łatkę — obecne tylko przy porównaniu z katalogiem roboczym.
     * Przy oglądaniu starego commita nie ma czego przygotowywać ani cofać.
     */
    onApplyPatch?(patch: string, opts: { cached?: boolean; reverse?: boolean }): Promise<void>;
    /**
     * Ponowne pobranie obu stron.
     *
     * Zakładka ma **stały adres na plik**, żeby nie mnożyć kart — a to znaczy,
     * że żyje dłużej niż stan, który pokazuje. Bez tego drugie kliknięcie
     * w panelu tylko przełączało na kartę z treścią sprzed zmiany, a po
     * przygotowaniu fragmentu odświeżał się panel i nie odświeżała różnica,
     * z której ten fragment przed chwilą zniknął.
     *
     * Brak tej funkcji znaczy „widok statyczny" — tak ogląda się stary commit,
     * którego nie ma jak zmienić.
     */
    reload?(): Promise<{ original: string; modified: string }>;
    /**
     * Zgłoszenia „stan repozytorium się zmienił"; zwraca funkcję odpinającą.
     * Wtyczka podaje tu ten sam sygnał, którym odświeża panel boczny.
     */
    subscribe?(cb: () => void): () => void;
}

/** Język Monaco po rozszerzeniu — bez tego różnica jest szarym tekstem. */
function jezykDla(path: string): string {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    const mapa: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        json: 'json', md: 'markdown', css: 'css', html: 'html', py: 'python',
        c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', yml: 'yaml', yaml: 'yaml',
        sh: 'shell', sql: 'sql', xml: 'xml',
    };
    return mapa[ext] ?? 'plaintext';
}

function DiffTabWnetrze({
    path, original, modified, ref: rewizja = 'HEAD', onApplyPatch, reload, subscribe,
}: DiffTabProps) {
    const kontener = useRef<HTMLDivElement>(null);
    const [zajety, setZajety] = useState(false);
    const [blad, setBlad] = useState<string | null>(null);

    // Treść w stanie, nie wprost z propsów: zakładka odświeża się sama, a jej
    // props pochodzą z chwili otwarcia i już się nie zmienią.
    const [tresc, setTresc] = useState({ original, modified });
    useEffect(() => { setTresc({ original, modified }); }, [original, modified]);

    useEffect(() => {
        if (!reload || !subscribe) return;
        return subscribe(() => {
            // Nieudane odświeżenie zostawia to, co widać. Wyczyszczenie widoku
            // przy zerwanej sieci byłoby gorsze niż nieaktualna różnica:
            // wyglądałoby jak „nie ma już zmian".
            void reload().then(setTresc).catch(() => { /* zostaje poprzedni stan */ });
        });
    }, [reload, subscribe]);

    /** Fragmenty liczone tak samo jak przy przycisku w marginesie edytora. */
    const hunki = useMemo(() => toHunks(diffLines(tresc.original, tresc.modified), 3),
                          [tresc.original, tresc.modified]);

    /**
     * Łatka dla jednego fragmentu.
     *
     * Liczby wierszy i informacja o końcowym znaku nowej linii muszą pochodzić
     * z **całych** treści, nie z fragmentu: git sprawdza je względem pliku
     * i odrzuca łatkę, w której się nie zgadzają.
     */
    const latkaDla = useCallback((index: number): string => formatPatch(path, [hunki[index]], {
        oldEndsWithNewline: endsWithNewline(tresc.original),
        newEndsWithNewline: endsWithNewline(tresc.modified),
        totalOldLines: splitLines(tresc.original).length,
        totalNewLines: splitLines(tresc.modified).length,
    }), [hunki, path, tresc.original, tresc.modified]);

    const nalozLatke = useCallback(async (index: number, opts: { cached?: boolean; reverse?: boolean }) => {
        if (!onApplyPatch) return;
        setZajety(true);
        setBlad(null);
        try {
            await onApplyPatch(latkaDla(index), opts);
        } catch (e) {
            setBlad((e as Error).message);
        } finally {
            setZajety(false);
        }
    }, [latkaDla, onApplyPatch]);

    useEffect(() => {
        if (!kontener.current) return;
        const jezyk = jezykDla(path);
        // Modele bez URI: to widok jednorazowy, a model o tym samym adresie co
        // otwarty plik podmieniłby jego zawartość w zakładce obok.
        const lewy = monaco.editor.createModel(tresc.original, jezyk);
        const prawy = monaco.editor.createModel(tresc.modified, jezyk);
        const edytor = monaco.editor.createDiffEditor(kontener.current, {
            readOnly: true,
            renderSideBySide: true,
            automaticLayout: true,
            // Zwinięte fragmenty bez zmian: przy pliku na tysiąc wierszy i jednej
            // poprawce reszta jest szumem, przez który trzeba przewijać.
            hideUnchangedRegions: { enabled: true },
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
        });
        edytor.setModel({ original: lewy, modified: prawy });

        return () => {
            edytor.dispose();
            lewy.dispose();
            prawy.dispose();
        };
    }, [path, tresc.original, tresc.modified]);

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {path} — {rewizja} ↔ katalog roboczy
                </Typography>
            </Box>

            {blad && <Alert severity="error" onClose={() => setBlad(null)} sx={{ borderRadius: 0, fontSize: 12 }}>{blad}</Alert>}

            {onApplyPatch && hunki.length > 0 && (
                <Stack direction="row" spacing={0.5} sx={{ px: 1, py: 0.5, flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" sx={{ alignSelf: 'center', mr: 0.5, color: 'text.secondary' }}>
                        Fragmenty:
                    </Typography>
                    {hunki.map((h, i) => (
                        <Stack key={`${h.newStart}-${i}`} direction="row" spacing={0.25} alignItems="center"
                            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 0.5 }}>
                            <Tooltip title={`Wiersze ${h.newRange.from}–${h.newRange.to} · ${describeHunk(h)}`}>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                                    {h.newRange.from}–{h.newRange.to}
                                </Typography>
                            </Tooltip>
                            <Tooltip title="Przygotuj ten fragment do commita">
                                <span>
                                    <Button size="small" disabled={zajety} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}
                                        onClick={() => { void nalozLatke(i, { cached: true }); }}>+</Button>
                                </span>
                            </Tooltip>
                            <Tooltip title="Cofnij ten fragment w katalogu roboczym">
                                <span>
                                    <Button size="small" color="warning" disabled={zajety} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}
                                        onClick={() => {
                                            // Cofnięcie jest nieodwracalne — git nie ma gdzie zapamiętać
                                            // porzuconej zmiany, więc pytamy przed, a nie przepraszamy po.
                                            if (window.confirm('Cofnąć ten fragment? Tej operacji nie da się odwrócić.')) {
                                                void nalozLatke(i, { reverse: true });
                                            }
                                        }}>↶</Button>
                                </span>
                            </Tooltip>
                        </Stack>
                    ))}
                </Stack>
            )}

            <Box ref={kontener} sx={{ flex: 1, minHeight: 0 }} />
        </Box>
    );
}

/** Widok różnic w motywie edytora — patrz `theme.ts`. */
export function DiffTab(props: DiffTabProps) {
    return (
        <ThemeProvider theme={MOTYW_ZAKLADKI}>
            <Box sx={{ height: '100%', bgcolor: 'background.default', color: 'text.primary' }}>
                <DiffTabWnetrze {...props} />
            </Box>
        </ThemeProvider>
    );
}
