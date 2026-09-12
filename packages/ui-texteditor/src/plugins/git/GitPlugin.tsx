/**
 * GitPlugin.tsx — kontrola źródeł w edytorze.
 *
 * ## Dlaczego to jest napisane, a nie wzięte z półki
 *
 * W VS Code git nie jest zewnętrzną wtyczką, tylko **wbudowanym rozszerzeniem**
 * (`vscode.git`) napisanym pod API `vscode.*`: widok kontroli źródeł, dostawca
 * szybkiej różnicy, dekoracje zasobów. To warstwa powłoki VS Code, nie edytora.
 * Monaco jest samym edytorem i tej warstwy nie ma — więc nie ma czego podłączyć.
 *
 * Dwie najcięższe rzeczy Monaco daje jednak z siebie: **widok różnic**
 * (`createDiffEditor`, razem ze zwijaniem niezmienionych fragmentów) i
 * **dekoracje marginesu**. Reszta to lista zmian i wywołania serwera.
 *
 * ## Co robi ten plik
 *
 * Tylko spina: rejestruje panel boczny, pozycję na pasku stanu, komendy i
 * znaczniki zmian przy numerach wierszy. Rozmowa z serwerem siedzi w `gitApi`,
 * decyzje w `model`, widok w `GitPanel` — każde z osobna daje się sprawdzić.
 */

import { useCallback, useEffect, useState } from 'react';
import * as monaco from 'monaco-editor';
import type { IPlugin, IPluginAPI, IStatusBarItemHandle } from '../../monaco/plugins/types';
import { GitApi } from './gitApi';
import { GitPanel } from './GitPanel';
import { DiffTab } from './DiffTab';
import { HistoryTab } from './HistoryTab';
import { ConflictTab } from './ConflictTab';
import { syncLabel, toRepoRelative, workingContent } from './model';
import { diffLines, endsWithNewline, formatPatch, reverseHunk, splitLines, toHunks, type Hunk } from './hunks';

export interface GitPluginOptions {
    userName: string;
    /** Token JWT — bez niego trasy gita zwracają 401. */
    token?: string;
    /**
     * Ścieżka pliku `.repo.json` względem drive użytkownika.
     *
     * Podaje ją host, bo to on wie, który projekt jest otwarty. Funkcja, a nie
     * wartość, żeby przełączenie projektu nie wymagało przeładowania wtyczki.
     */
    repoPath: () => string | null;
}

/** Znaczniki zmian przy numerach wierszy — jak paski w innych edytorach. */
const STYLE_MARGINESU = `
.tb-git-added   { border-left: 3px solid #4ade80; margin-left: 3px; }
.tb-git-modified{ border-left: 3px solid #facc15; margin-left: 3px; }
.tb-git-deleted { border-left: 3px solid #f87171; margin-left: 3px; }
`;

export function createGitPlugin(opcje: GitPluginOptions): IPlugin {
    let statusBar: IStatusBarItemHandle | null = null;
    let dekoracje: monaco.editor.IEditorDecorationsCollection | null = null;
    let styl: HTMLStyleElement | null = null;
    let odswiezaczPanelu = 0;
    const sluchacze = new Set<() => void>();

    /** Prosi panel o ponowne pobranie stanu. */
    const odswiezPanel = (): void => {
        odswiezaczPanelu++;
        for (const s of sluchacze) s();
    };

    const zbudujApi = (): GitApi | null => {
        const repoPath = opcje.repoPath();
        return repoPath ? new GitApi({ userName: opcje.userName, token: opcje.token, repoPath }) : null;
    };

    /** Panel boczny — czyta ścieżkę repozytorium przy każdym renderze. */
    function PanelKontroliZrodel() {
        const [wersja, setWersja] = useState(odswiezaczPanelu);
        useEffect(() => {
            const sluchacz = () => setWersja(odswiezaczPanelu);
            sluchacze.add(sluchacz);
            return () => { sluchacze.delete(sluchacz); };
        }, []);

        const api = zbudujApi();
        const otworzRoznice = useCallback(async (path: string) => {
            if (!api) return;
            try {
                const original = await api.show(path, 'HEAD');
                const modified = await pobierzBiezaca(api, path);
                otwarcieRoznicy?.({ path, original, modified, api });
            } catch {
                // Widok różnic jest pomocą, nie warunkiem pracy — nieudane
                // pobranie nie ma prawa zablokować panelu.
            }
        }, [api]);

        const otworzKonflikt = useCallback(async (path: string) => {
            if (!api) return;
            // Treść ze znacznikami bierzemy z otwartego modelu albo z katalogu
            // roboczego — indeks trzyma trzy wersje osobno, a tu potrzebny jest
            // plik taki, jaki git zostawił po nieudanym scaleniu.
            const tresc = await pobierzBiezaca(api, path);
            otwarcieKonfliktu?.({ path, content: tresc, api });
        }, [api]);

        if (!api) {
            return (
                <div style={{ padding: 12, fontSize: 12, opacity: 0.75 }}>
                    Otwórz projekt z plikiem <code>.repo.json</code>, żeby zobaczyć zmiany.
                </div>
            );
        }
        return (
            <GitPanel
                api={api}
                onOpenDiff={(p) => { void otworzRoznice(p); }}
                onOpenConflict={(p) => { void otworzKonflikt(p); }}
                onOpenHistory={() => otwarcieHistorii?.(api)}
                refreshToken={wersja}
            />
        );
    }

    // Ustawiane w `activate` — panel nie ma dostępu do API wtyczki, więc
    // otwieranie zakładek przechodzi przez te uchwyty.
    let otwarcieRoznicy: ((o: { path: string; original: string; modified: string; api: GitApi }) => void) | null = null;
    let otwarcieKonfliktu: ((o: { path: string; content: string; api: GitApi }) => void) | null = null;
    let otwarcieHistorii: ((api: GitApi) => void) | null = null;

    return {
        manifest: {
            id: 'mycastle.git',
            name: 'Kontrola źródeł (git)',
            version: '1.0.0',
            description: 'Zmiany, commit, gałęzie i widok różnic dla repozytoriów w Drive.',
            contributes: ['sidebar', 'statusbar', 'commandpalette'],
        },

        async activate(api: IPluginAPI) {
            styl = document.createElement('style');
            styl.textContent = STYLE_MARGINESU;
            document.head.appendChild(styl);

            otwarcieRoznicy = ({ path, original, modified, api: gitApi }) => {
                // Uchwyty tworzone raz na otwarcie, a nie w ciele `component`:
                // inaczej każdy render zakładki dawałby nowe funkcje, a efekt
                // subskrypcji odpinałby się i podpinał w kółko.
                const przeladuj = async () => ({
                    original: await gitApi.show(path, 'HEAD'),
                    modified: await pobierzBiezaca(gitApi, path),
                });
                const nasluchuj = (cb: () => void) => {
                    sluchacze.add(cb);
                    return () => { sluchacze.delete(cb); };
                };

                api.openEditorTab({
                    // Adres z nazwą pliku: druga różnica tego samego pliku ma
                    // trafić do tej samej zakładki, a nie mnożyć karty.
                    uri: `git-diff://${path}`,
                    title: `Różnice: ${path.slice(path.lastIndexOf('/') + 1)}`,
                    component: () => (
                        <DiffTab
                            path={path} original={original} modified={modified}
                            reload={przeladuj} subscribe={nasluchuj}
                            onApplyPatch={async (patch, opts) => {
                                const wynik = await gitApi.applyPatch(patch, opts);
                                if (wynik.ok === false) throw new Error(wynik.stderr || 'git odrzucił łatkę');
                                // Odświeża i panel, i otwarte różnice — fragment,
                                // który przed chwilą trafił do indeksu, nie ma
                                // prawa dalej wisieć na liście do przygotowania.
                                odswiezPanel();
                            }}
                        />
                    ),
                    toSide: true,
                });

                // Zakładka mogła już istnieć — wtedy `openEditorTab` tylko na nią
                // przełącza i zostaje treść z chwili pierwszego otwarcia. Sygnał
                // odświeżenia jest jedyną drogą, żeby pokazała stan bieżący.
                odswiezPanel();
            };

            otwarcieKonfliktu = ({ path, content, api: gitApi }) => {
                api.openEditorTab({
                    uri: `git-conflict://${path}`,
                    title: `Konflikt: ${path.slice(path.lastIndexOf('/') + 1)}`,
                    component: () => (
                        <ConflictTab
                            path={path} content={content}
                            onResolve={async (tresc) => {
                                // Zapis idzie przez model edytora, bo to on jest
                                // źródłem treści pliku w tej aplikacji; potem
                                // oznaczamy plik jako rozwiązany w indeksie.
                                await zapiszTresc(gitApi, path, tresc);
                                const wynik = await gitApi.markResolved([path]);
                                if (wynik.ok === false) throw new Error(wynik.stderr || 'nie udało się oznaczyć jako rozwiązany');
                                odswiezPanel();
                            }}
                        />
                    ),
                    toSide: true,
                });
            };

            otwarcieHistorii = (gitApi) => {
                api.openEditorTab({
                    uri: 'git-history://',
                    title: 'Historia',
                    component: () => (
                        <HistoryTab
                            api={gitApi}
                            onOpenDiff={(path, ref) => {
                                void (async () => {
                                    const [przed, po] = await Promise.all([
                                        gitApi.show(path, `${ref}~1`),
                                        gitApi.show(path, ref),
                                    ]);
                                    api.openEditorTab({
                                        uri: `git-diff://${ref}/${path}`,
                                        title: `${ref.slice(0, 7)}: ${path.slice(path.lastIndexOf('/') + 1)}`,
                                        // Bez `onApplyPatch`: przy oglądaniu starego
                                        // commita nie ma czego przygotowywać ani cofać.
                                        component: () => <DiffTab path={path} original={przed} modified={po} ref={`${ref.slice(0, 7)}~1`} />,
                                        toSide: true,
                                    });
                                })();
                            }}
                        />
                    ),
                    toSide: true,
                });
            };

            api.ui.sidebar.register({
                id: 'scm',
                title: 'Kontrola źródeł',
                icon: '⑂',
                component: PanelKontroliZrodel,
                order: 20,
            });

            statusBar = api.ui.statusbar.register({
                id: 'git-branch',
                text: '⑂ —',
                tooltip: 'Gałąź repozytorium',
                alignment: 'left',
                priority: 100,
                command: 'mycastle.git.openPanel',
            });

            api.commands.register('openPanel', () => api.ui.openSidebarPanel('scm'));
            api.commands.register('history', () => {
                const gitApi = zbudujApi();
                if (gitApi) otwarcieHistorii?.(gitApi);
            });

            /**
             * Cofa fragment, w którym stoi kursor.
             *
             * Odpowiednik „cofnij tę zmianę" spod znacznika marginesu. Idzie przez
             * komendę, a nie przez kliknięcie w margines, bo API wtyczki nie daje
             * uchwytu do edytora — a sięganie po niego z globalnej listy tylko po
             * to, żeby podpiąć zdarzenie myszy, wiązałoby wtyczkę z wewnętrznym
             * układem edytora mocniej, niż to warte.
             */
            api.commands.register('revertHunk', async () => {
                const gitApi = zbudujApi();
                const edytor = monaco.editor.getEditors().find((e) => e.hasTextFocus()) ?? monaco.editor.getEditors()[0];
                const model = edytor?.getModel();
                if (!gitApi || !edytor || !model) return;

                const repoDir = await gitApi.repoDir();
                const wzgledna = toRepoRelative(model.uri.path, repoDir);
                if (!wzgledna) return;

                const linia = edytor.getPosition()?.lineNumber ?? 1;
                const oryginal = await gitApi.show(wzgledna, 'HEAD');
                const biezacy = model.getValue();
                const hunki = toHunks(diffLines(oryginal, biezacy), 3);
                const trafiony = hunki.find((h) => linia >= h.newRange.from && linia <= h.newRange.to);
                if (!trafiony) return;

                if (!window.confirm(`Cofnąć zmianę w wierszach ${trafiony.newRange.from}–${trafiony.newRange.to}?`)) return;
                const patch = formatPatch(wzgledna, [trafiony], {
                    oldEndsWithNewline: endsWithNewline(oryginal),
                    newEndsWithNewline: endsWithNewline(biezacy),
                    totalOldLines: splitLines(oryginal).length,
                    totalNewLines: splitLines(biezacy).length,
                });
                const wynik = await gitApi.applyPatch(patch, { reverse: true });
                if (wynik.ok === false) return;
                // Model dostaje nową treść z dysku: edytor pokazywałby inaczej
                // niż plik, a pierwsze naciśnięcie klawisza zapisałoby starą wersję.
                model.setValue(await pobierzZDysku(gitApi, wzgledna, biezacy, trafiony));
                odswiezPanel();
            });
            api.commands.register('refresh', () => { void odswiezStatus(); odswiezPanel(); });
            api.ui.commandpalette.register({
                command: 'mycastle.git.openPanel', title: 'Git: pokaż zmiany', category: 'Git',
            });
            api.ui.commandpalette.register({
                command: 'mycastle.git.refresh', title: 'Git: odśwież stan', category: 'Git',
            });
            api.ui.commandpalette.register({
                command: 'mycastle.git.history', title: 'Git: historia commitów', category: 'Git',
            });
            api.ui.commandpalette.register({
                command: 'mycastle.git.revertHunk', title: 'Git: cofnij zmianę pod kursorem', category: 'Git',
            });

            /** Gałąź i licznik commitów na pasku stanu. */
            async function odswiezStatus(): Promise<void> {
                const gitApi = zbudujApi();
                if (!gitApi || !statusBar) return;
                try {
                    const info = await gitApi.info();
                    const s = info.status;
                    statusBar.update({
                        text: `⑂ ${s?.branch ?? s?.tag ?? '—'}${s && (s.ahead || s.behind) ? `  ${syncLabel(s.ahead, s.behind)}` : ''}`,
                        tooltip: info.url ?? 'Repozytorium lokalne',
                    });
                } catch {
                    // Brak repozytorium to zwykły stan (nie każdy katalog nim jest),
                    // a nie awaria warta krzyczenia na pasku.
                    statusBar.update({ text: '⑂ —', tooltip: 'Poza repozytorium' });
                }
            }

            /**
             * Znaczniki zmian przy numerach wierszy otwartego pliku.
             *
             * Różnicę liczy Monaco: dostaje treść z HEAD i treść bieżącą, a my
             * malujemy tylko wynik. Własne porównanie byłoby drugą implementacją
             * tego samego, tyle że gorszą.
             */
            async function odswiezMargines(uri: string, tekst: string): Promise<void> {
                const gitApi = zbudujApi();
                const model = monaco.editor.getModel(monaco.Uri.parse(uri));
                // Dekoracje marginesu należą do edytora, nie do modelu — a API
                // wtyczki nie podaje uchwytu do edytora, więc szukamy tego,
                // który pokazuje właśnie ten plik.
                const edytor = monaco.editor.getEditors().find((e) => e.getModel() === model);
                if (!gitApi || !model || !edytor) return;

                const repoDir = await gitApi.repoDir();
                const wzgledna = toRepoRelative(uri.replace(/^file:\/\//, ''), repoDir);
                dekoracje?.clear();
                if (!wzgledna) return;                 // plik spoza repozytorium

                let oryginal = '';
                try { oryginal = await gitApi.show(wzgledna, 'HEAD'); } catch { return; }

                const zmiany = policzZmiany(oryginal, tekst);
                dekoracje = edytor.createDecorationsCollection(zmiany.map((z) => ({
                    range: new monaco.Range(z.od, 1, z.do, 1),
                    options: { linesDecorationsClassName: `tb-git-${z.rodzaj}` },
                })));
            }

            api.editor.onDidOpenDocument((uri, tekst) => { void odswiezMargines(uri, tekst); });
            api.editor.onDidSaveDocument(() => { void odswiezStatus(); odswiezPanel(); });
            api.editor.onDidChangeModel(() => { void odswiezStatus(); });

            void odswiezStatus();
        },

        deactivate() {
            statusBar?.dispose();
            dekoracje?.clear();
            styl?.remove();
            sluchacze.clear();
        },
    };
}

/**
 * Treść pliku po cofnięciu fragmentu.
 *
 * Liczymy ją z odwróconego fragmentu zamiast czytać plik z dysku: git właśnie
 * go zmienił, ale edytor zna tylko swoją kopię, a odczyt przez VFS wymagałby
 * uprawnienia, którego wtyczka nie ma. Wynik jest ten sam, bo łatka opisuje
 * dokładnie tę zmianę.
 */
async function pobierzZDysku(_api: GitApi, _path: string, biezacy: string, cofniety: Hunk): Promise<string> {
    const wiersze = splitLines(biezacy);
    const odwrocony = reverseHunk(cofniety);
    const przed = wiersze.slice(0, odwrocony.oldStart - 1);
    const po = wiersze.slice(odwrocony.oldStart - 1 + odwrocony.oldLines);
    const srodek = odwrocony.lines.filter((l) => l.op !== '-').map((l) => l.text);
    const wynik = [...przed, ...srodek, ...po].join('\n');
    return endsWithNewline(biezacy) ? `${wynik}\n` : wynik;
}

/**
 * Zapisuje treść do modelu otwartego pliku.
 *
 * Model, a nie zapis wprost na dysk: plik bywa otwarty w zakładce, a zapis
 * z boku zostawiłby w niej starą treść, którą pierwsze naciśnięcie klawisza
 * przywróciłoby na dysk — kasując rozstrzygnięcie konfliktu.
 */
async function zapiszTresc(api: GitApi, path: string, tresc: string): Promise<void> {
    const repoDir = await api.repoDir();
    const pelna = repoDir ? `/${repoDir}/${path}` : `/${path}`;
    const model = monaco.editor.getModel(monaco.Uri.parse(`file://${pelna}`));
    if (!model) throw new Error(`Otwórz plik "${path}" w edytorze, żeby zapisać rozstrzygnięcie.`);
    model.setValue(tresc);
}

/** Bieżąca treść pliku z otwartego modelu albo z dysku przez VFS edytora. */
async function pobierzBiezaca(api: GitApi, path: string): Promise<string> {
    const repoDir = await api.repoDir();
    const pelna = repoDir ? `/${repoDir}/${path}` : `/${path}`;

    // Decyzja siedzi w `model.ts`, tutaj zostaje samo podłączenie dwóch źródeł:
    // adres modelu Monaco po jednej stronie, wywołanie serwera po drugiej.
    return workingContent({
        fromEditor: () => {
            // Model otwartej zakładki niesie też niezapisane zmiany — a to
            // zwykle właśnie ich dotyczy pytanie „co ja tu zmieniłem".
            //
            // `getModel` zwraca `null` nie tylko wtedy, gdy plik jest zamknięty:
            // adres modelu składa host z własnej ścieżki VFS i przy edytorze
            // zakotwiczonym w podkatalogu projektu może się z tym nie zgadzać.
            // Obie sytuacje znaczą to samo — „zapytaj dysku" — i dlatego żadna
            // nie ma prawa dawać pustej treści.
            const model = monaco.editor.getModel(monaco.Uri.parse(`file://${pelna}`));
            return model ? model.getValue() : null;
        },
        fromDisk: () => api.worktree(path),
    });
}

/**
 * Zakresy zmienionych wierszy — na tyle, ile potrzeba do znaczników marginesu.
 *
 * Świadomie prosto: porównanie wiersz po wierszu z wyszukaniem najbliższego
 * dopasowania. Pełny algorytm najdłuższego wspólnego podciągu dałby ładniejsze
 * bloki przy przestawieniach, ale margines pokazuje **gdzie patrzeć**, a nie
 * co dokładnie zaszło — od tego jest widok różnic, który liczy Monaco.
 */
export function policzZmiany(
    oryginal: string, biezacy: string,
): Array<{ od: number; do: number; rodzaj: 'added' | 'modified' | 'deleted' }> {
    // Pusty tekst to brak wierszy, a nie jeden pusty wiersz. `''.split('\n')`
    // daje `['']`, przez co nowy plik (w HEAD pusty) wychodził jako zmieniony
    // zamiast dodanego — a to najczęstszy przypadek zaraz po utworzeniu pliku.
    const a = oryginal === '' ? [] : oryginal.split('\n');
    const b = biezacy === '' ? [] : biezacy.split('\n');
    const wynik: Array<{ od: number; do: number; rodzaj: 'added' | 'modified' | 'deleted' }> = [];

    let i = 0;
    let j = 0;
    while (j < b.length) {
        if (i < a.length && a[i] === b[j]) { i++; j++; continue; }

        // Szukamy, gdzie linie znów się schodzą — w oknie, żeby przy zupełnie
        // różnych plikach nie przeszukiwać wszystkiego razy wszystko.
        const OKNO = 50;
        let dopasowanieA = -1;
        let dopasowanieB = -1;
        szukaj: for (let d = 1; d <= OKNO; d++) {
            for (let k = 0; k <= d; k++) {
                const ia = i + k;
                const jb = j + (d - k);
                if (ia < a.length && jb < b.length && a[ia] === b[jb]) {
                    dopasowanieA = ia; dopasowanieB = jb; break szukaj;
                }
            }
        }
        if (dopasowanieA < 0) {
            wynik.push({ od: j + 1, do: b.length, rodzaj: i < a.length ? 'modified' : 'added' });
            break;
        }
        const usunieto = dopasowanieA - i;
        const dodano = dopasowanieB - j;
        if (dodano > 0) {
            wynik.push({ od: j + 1, do: dopasowanieB, rodzaj: usunieto > 0 ? 'modified' : 'added' });
        } else if (usunieto > 0) {
            // Usunięcie nie ma własnego wiersza — znacznik idzie przy tym, który
            // po nim został, inaczej nie byłoby go gdzie postawić.
            wynik.push({ od: Math.max(1, j), do: Math.max(1, j), rodzaj: 'deleted' });
        }
        i = dopasowanieA;
        j = dopasowanieB;
    }
    if (i < a.length && j >= b.length) {
        wynik.push({ od: Math.max(1, b.length), do: Math.max(1, b.length), rodzaj: 'deleted' });
    }
    return wynik;
}
