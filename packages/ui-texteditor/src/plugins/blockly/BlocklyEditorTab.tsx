/**
 * BlocklyEditorTab — zawartość zakładki z edytorem bloczkowym.
 *
 * Jedna zakładka opisuje jeden plik: język bierze się z jego rozszerzenia
 * (albo ze wskazania w „Opcjach pliku"), a paleta — z diagramów UML wybranych
 * dla tego pliku.
 *
 * ## Dlaczego warsztat jest zapisywany
 *
 * Z bloczków wychodzi kod, ale z kodu nie wychodzą bloczki: układ jest
 * informacją, której nie da się odtworzyć z wyniku. Bez zapisu zamknięcie
 * zakładki kasowałoby pracę bez ostrzeżenia, więc stan warsztatu ląduje
 * w magazynie wtyczki pod kluczem pliku.
 *
 * ## Jak kod wraca do pliku
 *
 * „Zapisz" wstawia wynik do **oznaczonego obszaru** (`@blockly-begin` …
 * `@blockly-end`), a nie nadpisuje całego pliku: plik zwykle zawiera więcej niż
 * to, co ułożono z bloczków, a zapisany warsztat nie odtworzy tego, czego
 * nigdy w nim nie było. Przy pierwszym zapisie obszar powstaje na końcu pliku,
 * więc nic nie ginie.
 *
 * Razem z kodem do obszaru trafia stan warsztatu. Bez tego układ mieszkałby
 * wyłącznie w pamięci przeglądarki i kto otworzyłby plik gdzie indziej,
 * dostałby wygenerowany kod, którego nie da się już edytować bloczkami.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import CodeIcon from '@mui/icons-material/Code';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import type { FileSystemProvider } from '@hestia/core';

import type { IPluginLoggerAPI } from '../../monaco/plugins/types';
import { applyBlocklyRegion, readBlocklyState } from './fileRegion';
import type { LanguageDialect } from './dialects';
import { effectiveDialect, readFileOptions, type OptionsStorage } from './fileOptions';
import { generatorFor } from './generators';
import { loadCallables, type UmlProjectSource } from './umlProjectSource';
import { defineUmlBlocks, toolboxWithUml } from './umlToolbox';

/**
 * Motyw dobrany pod chrom edytora.
 *
 * Komponenty MUI dostają domyślnie motyw **jasny** i rysują niemal czarny tekst
 * na ciemnym tle zakładki — panel wychodzi nieczytelny (docs/plugins.md §5).
 */
const tabTheme = createTheme({
  palette: {
    mode: 'dark',
    background: { paper: '#1e1e1e', default: '#1e1e1e' },
    text: { primary: '#cccccc', secondary: '#9d9d9d' },
    divider: '#3c3c3c',
  },
});

export interface BlocklyTabOptions {
  file: string;
  storage: OptionsStorage;
  umlSource?: UmlProjectSource;
  logger: IPluginLoggerAPI;
  /** System plików dla „Zapisz"; bez niego przycisk tłumaczy, czego brakuje. */
  fileSystem?: FileSystemProvider;
}

/** Klucz zapisanego warsztatu — osobny od klucza opcji pliku. */
const workspaceKey = (file: string): string => `workspace:${file}`;

export function createBlocklyTab(opts: BlocklyTabOptions): React.FC {
  const BlocklyTab: React.FC = () => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
    const [code, setCode] = useState('');
    const [problem, setProblem] = useState<string | null>(null);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [fullscreen, setFullscreen] = useState(false);
    // Panel z wygenerowanym kodem startuje schowany: zakładka jest
    // edytorem bloczków, a kod to podgląd — zabierał 38% szerokości
    // każdemu, kto go nie potrzebował.
    const [showCode, setShowCode] = useState(false);

    const fileOptions = useMemo(() => readFileOptions(opts.storage, opts.file), []);
    const dialect = useMemo(() => effectiveDialect(opts.file, fileOptions), [fileOptions]);

    // Przebudowanie warsztatu od zera przy każdej zmianie palety byłoby
    // utratą układu; wstrzykujemy nowy przybornik do istniejącego.
    useEffect(() => {
      let disposed = false;
      const container = hostRef.current;
      if (!container || !dialect) return;

      (async () => {
        const generator = await generatorFor(dialect);
        const callables = await loadCallables(opts.umlSource, fileOptions.projects);
        if (disposed) return;

        if (fileOptions.projects.length && callables.length === 0) {
          // Wybrane projekty, z których nic nie wyszło, to najczęściej
          // diagram bez metod statycznych — a wygląda jak awaria.
          setProblem(
            'Wybrane projekty UML nie zawierają funkcji nadających się na bloczki ' +
              '(potrzebne są metody statyczne klas albo funkcje modułów).'
          );
        }

        const umlCategories = defineUmlBlocks(callables, dialect, generator);
        const workspace = Blockly.inject(container, {
          toolbox: toolboxWithUml(umlCategories, dialect),
          trashcan: true,
          zoom: { controls: true, wheel: true, startScale: 0.9 },
          grid: { spacing: 24, length: 3, colour: '#333', snap: true },
          theme: Blockly.Themes.Classic,
        });
        workspaceRef.current = workspace;

        // Stan z **pliku** ma pierwszeństwo nad zapisanym w przeglądarce:
        // plik jest tym, co widzą inni i co idzie do repozytorium.
        const fromFile = await readStateFromFile(opts, dialect);
        const saved = fromFile ?? opts.storage.get<object>(workspaceKey(opts.file));
        if (saved) {
          try {
            Blockly.serialization.workspaces.load(saved, workspace);
          } catch (e) {
            // Zapis mógł powstać przy innym zestawie bloczków (inny
            // diagram). Pusty warsztat jest lepszy niż wyjątek, ale
            // milczenie już nie — użytkownik ma wiedzieć, co zniknęło.
            setProblem(
              'Zapisanego układu nie dało się wczytać — prawdopodobnie zmienił się ' +
                `wybór projektów UML. (${(e as Error).message})`
            );
          }
        }

        const regenerate = () => {
          try {
            setCode(generator.workspaceToCode(workspace));
          } catch (e) {
            setProblem(`Nie udało się wygenerować kodu: ${(e as Error).message}`);
          }
          opts.storage.set(
            workspaceKey(opts.file),
            Blockly.serialization.workspaces.save(workspace)
          );
        };
        workspace.addChangeListener(regenerate);
        regenerate();
      })().catch((e: unknown) => {
        opts.logger.error('Blockly: nie udało się przygotować edytora', e);
        setProblem(`Nie udało się przygotować edytora: ${(e as Error).message}`);
      });

      return () => {
        disposed = true;
        workspaceRef.current?.dispose();
        workspaceRef.current = null;
      };
    }, [dialect, fileOptions]);

    /*
     * Blockly nie zauważa zmiany rozmiaru kontenera.
     *
     * Wymiary kanwy SVG są policzone przy `inject` i zostają takie, jakie
     * były: po wejściu w pełny ekran bloczki dają się układać tylko
     * w dawnym prostokącie, a reszta powierzchni nie reaguje na kliknięcia.
     * Wygląda to na zawieszony edytor, a jest nieprzeliczoną geometrią.
     *
     * `requestAnimationFrame`, bo przeliczenie musi zajść **po** tym, jak
     * przeglądarka ułoży element w nowym rozmiarze. To samo dotyczy
     * pokazania i schowania panelu z kodem — kanwa zmienia wtedy szerokość.
     */
    useEffect(() => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const frame = requestAnimationFrame(() => Blockly.svgResize(workspace));
      return () => cancelAnimationFrame(frame);
    }, [fullscreen, showCode]);

    // Escape wychodzi z pełnego ekranu — w trybie pełnoekranowym pasek
    // zakładek jest zasłonięty, więc bez tego jedynym wyjściem jest
    // trafienie w przycisk.
    useEffect(() => {
      if (!fullscreen) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setFullscreen(false);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    const copy = useCallback(() => {
      void navigator.clipboard?.writeText(code);
    }, [code]);

    const save = useCallback(async () => {
      if (!dialect) return;
      if (!opts.fileSystem?.writeFile) {
        // Przycisk, który nic nie robi, jest gorszy niż jego brak (§10).
        setProblem(
          'Zapis nie jest dostępny: ta aplikacja nie podłączyła systemu plików ' +
            'do wtyczki Blockly. Kod można skopiować przyciskiem obok.'
        );
        return;
      }
      setSaveState('saving');
      try {
        const current = await readFileText(opts.fileSystem, opts.file);
        const workspace = workspaceRef.current;
        const state = workspace ? Blockly.serialization.workspaces.save(workspace) : null;
        const next = applyBlocklyRegion(current, code, state, dialect);
        await opts.fileSystem.writeFile(opts.file, new TextEncoder().encode(next), {
          create: true,
          overwrite: true,
        });
        setSaveState('saved');
        // „Zapisano" gaśnie samo — trwały napis po chwili przestaje
        // znaczyć „przed chwilą" i zaczyna znaczyć „kiedyś".
        setTimeout(() => setSaveState('idle'), 2000);
      } catch (e) {
        setSaveState('idle');
        setProblem(`Nie udało się zapisać pliku: ${(e as Error).message}`);
      }
    }, [code, dialect]);

    if (!dialect) {
      return (
        <ThemeProvider theme={tabTheme}>
          <Alert severity="info" sx={{ m: 2 }}>
            Dla pliku {opts.file.split('/').pop()} nie umiem dobrać języka. Wskaż go w „Blockly:
            opcje pliku…".
          </Alert>
        </ThemeProvider>
      );
    }

    return (
      <ThemeProvider theme={tabTheme}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.default',
            ...(fullscreen
              ? // `fixed`, a nie `absolute`: przodkowie zakładki mają
                // `overflow: hidden`, więc pozycjonowanie względem nich
                // dalej mieściłoby panel w dawnym prostokącie.
                { position: 'fixed', inset: 0, zIndex: 1300, height: '100vh' }
              : { height: '100%' }),
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Typography variant="caption" sx={{ flex: 1 }}>
              {dialect.label} ·{' '}
              {fileOptions.projects.length
                ? `projekty UML: ${fileOptions.projects.join(', ')}`
                : 'bez projektów UML — same bloczki standardowe'}
            </Typography>
            <Tooltip title={fullscreen ? 'Wyjdź z pełnego ekranu (Esc)' : 'Pełny ekran'}>
              <IconButton size="small" onClick={() => setFullscreen((v) => !v)}>
                {fullscreen ? (
                  <FullscreenExitIcon fontSize="small" />
                ) : (
                  <FullscreenIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title={showCode ? 'Ukryj wygenerowany kod' : 'Pokaż wygenerowany kod'}>
              <IconButton
                size="small"
                onClick={() => setShowCode((v) => !v)}
                color={showCode ? 'primary' : 'default'}
              >
                <CodeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button size="small" onClick={copy} disabled={!code}>
              Kopiuj kod
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                void save();
              }}
              disabled={saveState === 'saving'}
            >
              {saveState === 'saving'
                ? 'Zapisuję…'
                : saveState === 'saved'
                  ? 'Zapisano ✓'
                  : 'Zapisz do pliku'}
            </Button>
          </Stack>

          {problem && (
            <Alert severity="warning" onClose={() => setProblem(null)}>
              {problem}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <Box ref={hostRef} sx={{ flex: 1, minWidth: 0 }} />
            {showCode && (
              <Box
                sx={{
                  width: '38%',
                  minWidth: 260,
                  overflow: 'auto',
                  borderLeft: '1px solid',
                  borderColor: 'divider',
                  p: 1,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Wygenerowany kod
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    mt: 0.5,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'text.primary',
                  }}
                >
                  {code || `${dialect.comment} ułóż bloczki, a kod pojawi się tutaj`}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </ThemeProvider>
    );
  };

  return BlocklyTab;
}

/** Treść pliku; brak pliku to pusty tekst, a nie błąd — zapis go utworzy. */
async function readFileText(fs: FileSystemProvider, path: string): Promise<string> {
  try {
    return new TextDecoder().decode(await fs.readFile(path));
  } catch {
    return '';
  }
}

/** Stan warsztatu zapisany w pliku — patrz nagłówek. */
async function readStateFromFile(
  opts: BlocklyTabOptions,
  dialect: LanguageDialect
): Promise<object | null> {
  if (!opts.fileSystem) return null;
  const text = await readFileText(opts.fileSystem, opts.file);
  return text ? readBlocklyState(text, dialect) : null;
}
