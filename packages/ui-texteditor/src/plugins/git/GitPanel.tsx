/**
 * GitPanel.tsx — panel kontroli źródeł w bocznym pasku edytora.
 *
 * Układ i zachowanie jak w edytorach, które ludzie już znają: sekcje zmian,
 * plus i minus przy pliku, pole opisu nad listą, operacje na zdalnym w nagłówku.
 * Nowa konwencja niczego by tu nie poprawiła, a kosztowałaby naukę.
 *
 * ## Skąd panel wie, o które repozytorium chodzi
 *
 * Repozytorium wskazuje **plik `.repo.json`** — tak działa git w tym systemie
 * i tak samo rozumie go serwer. Panel dostaje jego ścieżkę z zewnątrz, bo to
 * host wie, który projekt jest otwarty; sam by musiał zgadywać.
 *
 * ## Odświeżanie
 *
 * Po każdej operacji i po zapisie pliku panel pyta serwer o stan od nowa.
 * Trzymanie własnej kopii stanu gita znaczyłoby, że zmiana zrobiona z terminala
 * (a jest terminal w tej samej aplikacji) nie jest widoczna, dopóki ktoś nie
 * kliknie odświeżenia — i nie ma jak zgadnąć, że lista kłamie.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, Menu, MenuItem,
    Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { MOTYW_PASKA } from './theme';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import UndoIcon from '@mui/icons-material/Undo';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { GitApi, GitChange, GitInfo } from './gitApi';
import {
    commitBlocker, groupChanges, liczbaPlikow, splitPath, statusColor, statusLetter, syncLabel,
    type GroupedChanges,
} from './model';

export interface GitPanelProps {
    api: GitApi;
    /** Otwiera widok różnic dla pliku (ścieżka względem repozytorium). */
    onOpenDiff(path: string): void;
    /** Otwiera widok rozstrzygania konfliktu. */
    onOpenConflict?(path: string): void;
    /** Otwiera historię commitów. */
    onOpenHistory?(): void;
    /** Sygnał z zewnątrz: coś się zmieniło, odśwież. */
    refreshToken?: number;
}

const NAZWY_SEKCJI: Record<keyof GroupedChanges, string> = {
    conflicts: 'Konflikty',
    staged: 'Przygotowane do commita',
    changes: 'Zmiany',
    untracked: 'Nieśledzone',
};

function GitPanelWnetrze({ api, onOpenDiff, onOpenConflict, onOpenHistory, refreshToken = 0 }: GitPanelProps) {
    const [info, setInfo] = useState<GitInfo | null>(null);
    const [zmiany, setZmiany] = useState<GitChange[]>([]);
    const [opis, setOpis] = useState('');
    const [blad, setBlad] = useState<string | null>(null);
    const [zajety, setZajety] = useState<string | null>(null);
    const [menuGalezi, setMenuGalezi] = useState<HTMLElement | null>(null);
    const [menuWiecej, setMenuWiecej] = useState<HTMLElement | null>(null);
    const [schowek, setSchowek] = useState<Array<{ ref: string; subject: string; date: string }>>([]);

    const odswiez = useCallback(async () => {
        try {
            // `info` najpierw i **osobno**, bo tylko ono odpowiada także wtedy,
            // gdy repozytorium nie ma. `changes` i `stashList` w tym stanie
            // rzucają („Katalog nie jest repozytorium git…") i pytane razem
            // z `info` w `Promise.all` przewracały całe odświeżenie: panel
            // pokazywał surowy komunikat błędu zamiast ekranu, na którym da się
            // repozytorium założyć albo sklonować. Brak repozytorium to stan
            // katalogu, nie awaria.
            const i = await api.info();
            setInfo(i);
            setBlad(null);

            if (!i.isRepo) {
                setZmiany([]);
                setSchowek([]);
                return;
            }

            const [z, s] = await Promise.all([api.changes(), api.stashList()]);
            setZmiany(z);
            setSchowek(s);
        } catch (e) {
            setBlad((e as Error).message);
        }
    }, [api]);

    useEffect(() => { void odswiez(); }, [odswiez, refreshToken]);

    /** Operacja z blokadą przycisków i odświeżeniem po zakończeniu. */
    const wykonaj = useCallback(async (etykieta: string, akcja: () => Promise<unknown>) => {
        setZajety(etykieta);
        setBlad(null);
        try {
            const wynik = await akcja() as { ok?: boolean; output?: string; stderr?: string } | undefined;
            // Serwer zwraca `ok: false` z powodem — bez tego operacja wygląda na
            // udaną, a lista po prostu się nie zmienia.
            if (wynik && wynik.ok === false) {
                setBlad(wynik.stderr || wynik.output || `${etykieta}: nie powiodło się`);
            }
            await odswiez();
        } catch (e) {
            setBlad((e as Error).message);
        } finally {
            setZajety(null);
        }
    }, [odswiez]);

    const grupy = useMemo(() => groupChanges(zmiany), [zmiany]);

    /**
     * Ścieżki, które „przygotuj wszystko" ma wysłać.
     *
     * Zmienione i nieśledzone razem, bez powtórzeń: plik zmieniony po obu
     * stronach jest w dwóch sekcjach i wysłany dwa razy dawałby `git add`
     * z tą samą nazwą w argumentach — nieszkodliwe, ale ukrywałoby prawdziwą
     * liczbę plików w podpisie przycisku.
     */
    const doPrzygotowania = useMemo(
        () => Array.from(new Set([...grupy.changes, ...grupy.untracked].map((z) => z.path))),
        [grupy],
    );
    const przeszkoda = commitBlocker(grupy, opis);
    const status = info?.status;

    /**
     * Operacje na całej sekcji naraz.
     *
     * Tabela zamiast gałęzi `sekcja === '…' && …` w nagłówku: przy czterech
     * sekcjach i dwóch operacjach na niektórych z nich warunki w JSX-ie
     * przestają dać się przeczytać, a właśnie tu łatwo podpiąć operację pod
     * niewłaściwą listę plików.
     *
     * Potwierdzenie jest **osobne dla każdej operacji** i nazywa to, co
     * naprawdę się stanie. „Porzuć zmiany" na pliku nieśledzonym nie porzuca
     * zmian, tylko kasuje plik z dysku (`git clean`), a git go nie zna i nie
     * ma go skąd odtworzyć — jeden wspólny komunikat kłamałby w tym jednym
     * przypadku, w którym kłamać nie wolno.
     */
    const akcjeGrupowe = (sekcja: keyof GroupedChanges, pozycje: GitChange[]): Array<{
        klucz: string;
        tytul: string;
        ikona: ReactNode;
        kolor?: 'warning';
        potwierdzenie?: string;
        akcja(): Promise<unknown>;
    }> => {
        const sciezki = pozycje.map((z) => z.path);
        const ile = liczbaPlikow(pozycje.length);

        switch (sekcja) {
            case 'staged':
                return [{
                    klucz: 'unstage',
                    tytul: `Wycofaj wszystkie z przygotowanych (${ile})`,
                    ikona: <RemoveIcon sx={{ fontSize: 14 }} />,
                    akcja: () => api.unstage(sciezki),
                }];

            case 'changes':
                return [
                    {
                        klucz: 'stage',
                        tytul: `Przygotuj wszystkie do commita (${ile})`,
                        ikona: <AddIcon sx={{ fontSize: 14 }} />,
                        akcja: () => api.stage(sciezki),
                    },
                    {
                        klucz: 'discard',
                        tytul: `Porzuć wszystkie zmiany (${ile})`,
                        ikona: <UndoIcon sx={{ fontSize: 14 }} />,
                        kolor: 'warning',
                        potwierdzenie: `Porzucić zmiany w ${ile}? Git nie ma ich gdzie zapamiętać — tej operacji nie da się cofnąć.`,
                        akcja: () => api.discard(sciezki),
                    },
                ];

            case 'untracked':
                return [
                    {
                        klucz: 'stage',
                        tytul: `Dodaj wszystkie do commita (${ile})`,
                        ikona: <AddIcon sx={{ fontSize: 14 }} />,
                        akcja: () => api.stage(sciezki),
                    },
                    {
                        klucz: 'clean',
                        tytul: `Usuń wszystkie z dysku (${ile})`,
                        ikona: <DeleteOutlineIcon sx={{ fontSize: 14 }} />,
                        kolor: 'warning',
                        potwierdzenie: `Usunąć ${ile} z dysku? To pliki, których git nie zna — nie ma ich skąd odtworzyć.`,
                        akcja: () => api.discard(sciezki),
                    },
                ];

            // Konflikty zostają bez operacji zbiorczych: „rozwiąż wszystkie"
            // oznaczałoby pliki ze znacznikami jako gotowe i wpuściło je do
            // commita. Każdy trzeba obejrzeć osobno i to nie jest niedoróbka.
            default:
                return [];
        }
    };

    const commit = useCallback(async () => {
        await wykonaj('commit', () => api.commit(opis));
        setOpis('');
    }, [api, opis, wykonaj]);

    if (!info) {
        return (
            <Box sx={{ p: 2 }}>
                {blad ? <Alert severity="error">{blad}</Alert> : <CircularProgress size={18} />}
            </Box>
        );
    }

    if (!info.isRepo) {
        // Rozróżnienie ma znaczenie dla następnego kroku: przy znaczniku brakuje
        // tylko clone'a, a przy zwykłym katalogu nie ma czego klonować — trzeba
        // najpierw powiedzieć, skąd. Jeden wspólny komunikat kierowałby połowę
        // przypadków do przycisku, który nie ma czego zrobić.
        const znacznik = api.repoPath.endsWith('.repo.json');
        return (
            <Box sx={{ p: 2 }}>
                <Alert severity="info">
                    {znacznik ? (
                        <>Ten katalog nie jest jeszcze sklonowany. Ustaw adres w pliku
                            <code> {api.repoPath}</code> i użyj „Klonuj",
                            albo zacznij historię tutaj przyciskiem „Utwórz repozytorium".</>
                    ) : (
                        <><code>{api.repoPath === '.' ? '/' : api.repoPath}</code> nie leży w repozytorium git.
                            Utwórz je tutaj, otwórz katalog wewnątrz istniejącego,
                            albo dodaj plik <code>.repo.json</code> z adresem i sklonuj.</>
                    )}
                </Alert>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    {/*
                      * „Utwórz repozytorium" jest zawsze, także przy znaczniku:
                      * plik `.repo.json` mówi, dokąd kiedyś wysłać zmiany, a nie
                      * że historia musi przyjść z zewnątrz. Tak samo jest w VS
                      * Code, gdzie „Initialize Repository" nie zależy od tego,
                      * czy skądś klonujemy.
                      */}
                    <Button size="small" variant="outlined" disabled={!!zajety}
                        onClick={() => {
                            // Pytamy o nazwę gałęzi, bo zmiana jej później na
                            // repozytorium bez commitów jest mniej oczywista niż
                            // wpisanie jej teraz. Pusta odpowiedź to `main`.
                            const galaz = window.prompt('Nazwa pierwszej gałęzi:', 'main');
                            if (galaz === null) return;
                            void wykonaj('init', () => api.init(galaz.trim() || 'main'));
                        }}>
                        Utwórz repozytorium
                    </Button>
                    {znacznik && (
                        <Button size="small" disabled={!!zajety}
                            onClick={() => { void wykonaj('clone', () => api.pull()); }}>
                            Klonuj
                        </Button>
                    )}
                </Stack>
            </Box>
        );
    }

    return (
        <Stack sx={{ height: '100%', minHeight: 0 }}>
            {/* Nagłówek: gałąź, synchronizacja, odświeżenie */}
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ px: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Tooltip title="Gałąź — kliknij, żeby przełączyć">
                    <Button size="small" startIcon={<CallSplitIcon sx={{ fontSize: 14 }} />}
                        onClick={(e) => setMenuGalezi(e.currentTarget)}
                        sx={{ textTransform: 'none', fontSize: 12, minWidth: 0 }}>
                        {status?.branch ?? status?.tag ?? '(bez gałęzi)'}
                    </Button>
                </Tooltip>
                <Tooltip title={`Pobierz i wyślij zmiany · ${syncLabel(status?.ahead ?? 0, status?.behind ?? 0)}`}>
                    <span>
                        <IconButton size="small" disabled={!!zajety}
                            onClick={() => { void wykonaj('sync', async () => { await api.pull(); return api.push(); }); }}>
                            <SyncIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </span>
                </Tooltip>
                {(status?.ahead || status?.behind) ? (
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {syncLabel(status?.ahead ?? 0, status?.behind ?? 0)}
                    </Typography>
                ) : null}
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" onClick={() => { void odswiez(); }}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton>
                <IconButton size="small" onClick={(e) => setMenuWiecej(e.currentTarget)}><MoreVertIcon sx={{ fontSize: 16 }} /></IconButton>
            </Stack>

            {blad && <Alert severity="error" onClose={() => setBlad(null)} sx={{ borderRadius: 0, fontSize: 12 }}>{blad}</Alert>}

            {/* Opis commita */}
            <Box sx={{ p: 1 }}>
                <TextField
                    multiline minRows={2} maxRows={6} fullWidth size="small"
                    placeholder="Opis zmiany (Ctrl+Enter — commit)"
                    value={opis}
                    onChange={(e) => setOpis(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !przeszkoda) { void commit(); }
                    }}
                    InputProps={{ sx: { fontSize: 12 } }}
                />
                <Tooltip title={przeszkoda ?? 'Zatwierdź przygotowane zmiany'}>
                    <span>
                        <Button fullWidth size="small" variant="contained" sx={{ mt: 0.75, textTransform: 'none' }}
                            disabled={!!przeszkoda || !!zajety}
                            onClick={() => { void commit(); }}>
                            {zajety === 'commit' ? 'Zatwierdzam…' : `Commit (${grupy.staged.length})`}
                        </Button>
                    </span>
                </Tooltip>
                {przeszkoda && (
                    // Powód zamiast samego wyszarzenia: przyczyny są trzy
                    // i każda wymaga czego innego.
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
                        {przeszkoda}
                    </Typography>
                )}
            </Box>

            {/* Sekcje zmian */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 1 }}>
                {(['conflicts', 'staged', 'changes', 'untracked'] as const).map((sekcja) => {
                    const pozycje = grupy[sekcja];
                    if (pozycje.length === 0) return null;
                    return (
                        <Box key={sekcja}>
                            <Stack direction="row" alignItems="center" spacing={0.5}
                                sx={{ px: 1, py: 0.4, position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                                {/*
                                  * `noWrap`, bo nagłówek niesie teraz do dwóch
                                  * przycisków: bez tego „Przygotowane do commita"
                                  * łamie się na dwa wiersze w wąskim panelu
                                  * i cała lista skacze przy każdej zmianie sekcji.
                                  */}
                                <Typography variant="caption" noWrap sx={{ fontWeight: 600, flex: 1 }}>
                                    {NAZWY_SEKCJI[sekcja]}
                                </Typography>
                                <Chip size="small" label={pozycje.length} sx={{ height: 16, fontSize: 10 }} />
                                {akcjeGrupowe(sekcja, pozycje).map((a) => (
                                    <Tooltip key={a.klucz} title={a.tytul}>
                                        <span>
                                            <IconButton size="small" color={a.kolor} disabled={!!zajety}
                                                onClick={() => {
                                                    if (a.potwierdzenie && !window.confirm(a.potwierdzenie)) return;
                                                    void wykonaj(a.klucz, a.akcja);
                                                }}>
                                                {a.ikona}
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                ))}
                            </Stack>
                            {pozycje.map((z) => (
                                <WierszZmiany
                                    key={`${sekcja}:${z.path}`}
                                    zmiana={z} sekcja={sekcja} zajety={!!zajety}
                                    onOtworz={() => {
                                        // Konflikt otwiera rozstrzyganie, nie różnicę:
                                        // różnica pokazałaby plik ze znacznikami, czyli
                                        // dokładnie to, czego trzeba się pozbyć.
                                        if (z.conflicted && onOpenConflict) onOpenConflict(z.path);
                                        else onOpenDiff(z.path);
                                    }}
                                    onStage={() => { void wykonaj('stage', () => api.stage([z.path])); }}
                                    onUnstage={() => { void wykonaj('unstage', () => api.unstage([z.path])); }}
                                    onDiscard={() => {
                                        // Operacja jest nieodwracalna, więc pytamy przed, a nie
                                        // przepraszamy po — i pytamy o to, co naprawdę się stanie.
                                        // Dla pliku nieśledzonego to nie jest porzucenie zmian,
                                        // tylko skasowanie pliku, którego git nie zna.
                                        const pytanie = sekcja === 'untracked'
                                            ? `Usunąć „${z.path}" z dysku? Git tego pliku nie zna — nie ma go skąd odtworzyć.`
                                            : `Porzucić zmiany w „${z.path}"? Tej operacji nie da się cofnąć.`;
                                        if (window.confirm(pytanie)) {
                                            void wykonaj('discard', () => api.discard([z.path]));
                                        }
                                    }}
                                />
                            ))}
                        </Box>
                    );
                })}
                {zmiany.length === 0 && (
                    <Typography variant="caption" sx={{ display: 'block', p: 2, color: 'text.secondary' }}>
                        Brak zmian — katalog roboczy zgadza się z ostatnim commitem.
                    </Typography>
                )}
            </Box>

            <Menu open={!!menuGalezi} anchorEl={menuGalezi} onClose={() => setMenuGalezi(null)}>
                {info.branches.map((b) => (
                    <MenuItem key={b} selected={b === status?.branch} sx={{ fontSize: 12 }}
                        onClick={() => { setMenuGalezi(null); void wykonaj('checkout', () => api.checkout(b)); }}>
                        {b}
                    </MenuItem>
                ))}
                <MenuItem sx={{ fontSize: 12, fontStyle: 'italic' }}
                    onClick={() => {
                        setMenuGalezi(null);
                        const nazwa = window.prompt('Nazwa nowej gałęzi');
                        if (nazwa) void wykonaj('branch', () => api.createBranch(nazwa));
                    }}>
                    Nowa gałąź…
                </MenuItem>
            </Menu>

            <Menu open={!!menuWiecej} anchorEl={menuWiecej} onClose={() => setMenuWiecej(null)}>
                {/*
                  * Jedno kliknięcie zamiast dwóch: zmienione i nieśledzone są
                  * w panelu osobnymi sekcjami, ale „przygotuj wszystko" jest
                  * jedną myślą i najczęstszym krokiem przed commitem.
                  */}
                <MenuItem sx={{ fontSize: 12 }} disabled={doPrzygotowania.length === 0}
                    onClick={() => { setMenuWiecej(null); void wykonaj('stage', () => api.stage(doPrzygotowania)); }}>
                    Przygotuj wszystko ({liczbaPlikow(doPrzygotowania.length)})
                </MenuItem>
                <MenuItem sx={{ fontSize: 12 }} disabled={grupy.staged.length === 0}
                    onClick={() => { setMenuWiecej(null); void wykonaj('unstage', () => api.unstage(grupy.staged.map((z) => z.path))); }}>
                    Wycofaj wszystko z przygotowanych
                </MenuItem>
                <Divider />
                <MenuItem sx={{ fontSize: 12 }} onClick={() => { setMenuWiecej(null); void wykonaj('pull', () => api.pull()); }}>
                    Pobierz (pull)
                </MenuItem>
                <MenuItem sx={{ fontSize: 12 }} onClick={() => { setMenuWiecej(null); void wykonaj('push', () => api.push()); }}>
                    Wyślij (push)
                </MenuItem>
                {onOpenHistory && (
                    <MenuItem sx={{ fontSize: 12 }} onClick={() => { setMenuWiecej(null); onOpenHistory(); }}>
                        Historia commitów
                    </MenuItem>
                )}
                <Divider />
                <MenuItem sx={{ fontSize: 12 }} disabled={zmiany.length === 0}
                    onClick={() => {
                        setMenuWiecej(null);
                        const opisSchowka = window.prompt('Opis (opcjonalny)') ?? undefined;
                        void wykonaj('stash', () => api.stashPush(opisSchowka));
                    }}>
                    Schowaj zmiany
                </MenuItem>
                {schowek.map((w) => (
                    <MenuItem key={w.ref} sx={{ fontSize: 12 }}
                        onClick={() => { setMenuWiecej(null); void wykonaj('stash-pop', () => api.stashPop(w.ref)); }}>
                        Przywróć: {w.subject.slice(0, 40)}
                    </MenuItem>
                ))}
                {grupy.conflicts.length > 0 && (
                    <MenuItem sx={{ fontSize: 12, color: 'warning.main' }}
                        onClick={() => {
                            setMenuWiecej(null);
                            // Przerwanie scalania cofa też zmiany zrobione w jego trakcie.
                            if (window.confirm('Przerwać scalanie i wrócić do stanu sprzed?')) {
                                void wykonaj('abort', () => api.abortMerge());
                            }
                        }}>
                        Przerwij scalanie
                    </MenuItem>
                )}
            </Menu>
        </Stack>
    );
}

function WierszZmiany({ zmiana, sekcja, zajety, onOtworz, onStage, onUnstage, onDiscard }: {
    zmiana: GitChange;
    sekcja: keyof GroupedChanges;
    zajety: boolean;
    onOtworz(): void;
    onStage(): void;
    onUnstage(): void;
    onDiscard(): void;
}) {
    const { name, dir } = splitPath(zmiana.path);
    const litera = statusLetter(zmiana, sekcja);
    return (
        <Stack direction="row" alignItems="center" spacing={0.25}
            sx={{
                px: 1, py: 0.25, cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
                '&:hover .akcje': { visibility: 'visible' },
            }}
            onClick={onOtworz}
        >
            <Typography variant="caption" noWrap sx={{ fontSize: 12 }}>{name}</Typography>
            {dir && (
                <Typography variant="caption" noWrap sx={{ fontSize: 10, color: 'text.secondary', flex: 1, ml: 0.5 }}>
                    {zmiana.oldPath ? `${zmiana.oldPath} → ${dir}` : dir}
                </Typography>
            )}
            <Box sx={{ flex: dir ? 0 : 1 }} />
            <Stack direction="row" className="akcje" sx={{ visibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
                {sekcja !== 'staged' && (
                    <Tooltip title="Przygotuj do commita">
                        <span><IconButton size="small" disabled={zajety} onClick={onStage}><AddIcon sx={{ fontSize: 13 }} /></IconButton></span>
                    </Tooltip>
                )}
                {sekcja === 'staged' && (
                    <Tooltip title="Wycofaj z przygotowanych">
                        <span><IconButton size="small" disabled={zajety} onClick={onUnstage}><RemoveIcon sx={{ fontSize: 13 }} /></IconButton></span>
                    </Tooltip>
                )}
                {sekcja !== 'staged' && (
                    // Ten sam przycisk robi dwie różne rzeczy i musi to mówić:
                    // przy pliku śledzonym przywraca treść z indeksu, przy
                    // nieśledzonym kasuje plik z dysku (`git clean`).
                    <Tooltip title={sekcja === 'untracked' ? 'Usuń plik z dysku' : 'Porzuć zmiany'}>
                        <span>
                            <IconButton size="small" disabled={zajety} onClick={onDiscard}>
                                {sekcja === 'untracked'
                                    ? <DeleteOutlineIcon sx={{ fontSize: 13 }} />
                                    : <UndoIcon sx={{ fontSize: 13 }} />}
                            </IconButton>
                        </span>
                    </Tooltip>
                )}
            </Stack>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: statusColor(litera), width: 14, textAlign: 'center' }}>
                {litera}
            </Typography>
        </Stack>
    );
}

/**
 * Panel w motywie edytora.
 *
 * Opakowanie jest osobnym komponentem, a nie `ThemeProvider` wewnątrz treści:
 * panel ma kilka wczesnych wyjść (ładowanie, błąd, brak repozytorium) i każde
 * musiałoby pamiętać o motywie — a to dokładnie te stany, w których nieczytelny
 * napis jest jedyną rzeczą na ekranie.
 */
export function GitPanel(props: GitPanelProps) {
    return (
        <ThemeProvider theme={MOTYW_PASKA}>
            <Box sx={{ height: '100%', bgcolor: 'background.default', color: 'text.primary' }}>
                <GitPanelWnetrze {...props} />
            </Box>
        </ThemeProvider>
    );
}
