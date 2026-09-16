/**
 * ConflictTab.tsx — rozstrzyganie konfliktów scalania.
 *
 * Każdy konflikt osobno, z obiema wersjami obok siebie i czterema decyzjami:
 * moja, ich, obie po kolei, wyjściowa. Dopóki zostaje choć jeden znacznik,
 * zapis jest zablokowany — plik ze znacznikiem zwykle się kompiluje (znacznik
 * ląduje w komentarzu albo w napisie) i trafia do repozytorium, a wychodzi na
 * jaw tygodnie później.
 *
 * Treść trzymamy jako **tekst pliku**, a nie listę decyzji: użytkownik może
 * chcieć poprawić wynik ręcznie, a wtedy lista decyzji przestaje go opisywać.
 */

import { useCallback, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { MOTYW_ZAKLADKI } from './theme';
import {
  hasConflictMarkers,
  parseConflicts,
  resolveAll,
  resolveConflict,
  type Resolution,
} from './conflicts';

export interface ConflictTabProps {
  path: string;
  /** Treść pliku ze znacznikami konfliktu. */
  content: string;
  /** Zapisuje rozstrzygnięcie i oznacza plik jako rozwiązany. */
  onResolve(content: string): Promise<void>;
}

const OPISY: Array<{ wybor: Resolution; etykieta: string }> = [
  { wybor: 'ours', etykieta: 'Moja wersja' },
  { wybor: 'theirs', etykieta: 'Ich wersja' },
  { wybor: 'both', etykieta: 'Obie po kolei' },
];

function ConflictTabWnetrze({ path, content, onResolve }: ConflictTabProps) {
  const [tresc, setTresc] = useState(content);
  const [zapisuje, setZapisuje] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  const konflikty = useMemo(() => parseConflicts(tresc), [tresc]);
  const zostalyZnaczniki = hasConflictMarkers(tresc);

  const rozstrzygnij = useCallback((index: number, wybor: Resolution) => {
    // Liczymy konflikty od nowa po każdej decyzji: podmiana przesuwa numery
    // wierszy, więc lista sprzed zmiany opisywałaby już inny plik.
    setTresc((biezaca) => {
      const lista = parseConflicts(biezaca);
      return lista[index] ? resolveConflict(biezaca, lista[index], wybor) : biezaca;
    });
  }, []);

  const zapisz = useCallback(async () => {
    setZapisuje(true);
    setBlad(null);
    try {
      await onResolve(tresc);
    } catch (e) {
      setBlad((e as Error).message);
    } finally {
      setZapisuje(false);
    }
  }, [onResolve, tresc]);

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
          {path}
        </Typography>
        <Chip
          size="small"
          label={`${konflikty.length} do rozstrzygnięcia`}
          color={konflikty.length ? 'warning' : 'success'}
        />
        <Box sx={{ flex: 1 }} />
        {konflikty.length > 1 &&
          OPISY.map(({ wybor, etykieta }) => (
            <Button
              key={wybor}
              size="small"
              sx={{ fontSize: 11, textTransform: 'none' }}
              onClick={() => setTresc((b) => resolveAll(b, wybor))}
            >
              Wszystkie: {etykieta.toLowerCase()}
            </Button>
          ))}
        <Button
          size="small"
          variant="contained"
          disabled={zostalyZnaczniki || zapisuje}
          onClick={() => {
            void zapisz();
          }}
          sx={{ textTransform: 'none' }}
        >
          {zapisuje ? 'Zapisuję…' : 'Oznacz jako rozwiązany'}
        </Button>
      </Stack>

      {blad && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {blad}
        </Alert>
      )}
      {zostalyZnaczniki && konflikty.length === 0 && (
        // Znacznik bez pełnego konfliktu znaczy, że plik był edytowany
        // ręcznie i coś zostało — zapis mógłby to wpuścić do repozytorium.
        <Alert severity="warning" sx={{ borderRadius: 0, fontSize: 12 }}>
          W pliku zostały znaczniki konfliktu, ale nie tworzą pełnego bloku. Popraw je w edytorze —
          zapis jest zablokowany, żeby nie trafiły do repozytorium.
        </Alert>
      )}
      {!zostalyZnaczniki && (
        <Alert severity="success" sx={{ borderRadius: 0, fontSize: 12 }}>
          Wszystko rozstrzygnięte. Zapisz, żeby oznaczyć plik jako rozwiązany.
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
        {konflikty.map((k, i) => (
          <Paper key={`${k.startLine}-${i}`} variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ px: 1, py: 0.5, bgcolor: 'action.hover' }}
            >
              <Typography variant="caption" sx={{ flex: 1 }}>
                Wiersze {k.startLine}–{k.endLine}
              </Typography>
              {OPISY.map(({ wybor, etykieta }) => (
                <Button
                  key={wybor}
                  size="small"
                  sx={{ fontSize: 11, textTransform: 'none' }}
                  onClick={() => rozstrzygnij(i, wybor)}
                >
                  {etykieta}
                </Button>
              ))}
              {k.base && (
                <Button
                  size="small"
                  sx={{ fontSize: 11, textTransform: 'none' }}
                  onClick={() => rozstrzygnij(i, 'base')}
                >
                  Wyjściowa
                </Button>
              )}
            </Stack>
            <Box sx={{ display: 'flex' }}>
              <StronaKonfliktu etykieta={k.oursLabel} wiersze={k.ours} kolor="#4ade80" />
              <Divider orientation="vertical" flexItem />
              <StronaKonfliktu etykieta={k.theirsLabel} wiersze={k.theirs} kolor="#60a5fa" />
            </Box>
            {k.base && (
              <>
                <Divider />
                <StronaKonfliktu etykieta="wersja wyjściowa" wiersze={k.base} kolor="#9ca3af" />
              </>
            )}
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}

function StronaKonfliktu({
  etykieta,
  wiersze,
  kolor,
}: {
  etykieta: string;
  wiersze: string[];
  kolor: string;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, p: 1 }}>
      <Typography variant="caption" sx={{ color: kolor, fontWeight: 600 }}>
        {etykieta}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          mt: 0.5,
          fontSize: 11,
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {wiersze.length ? wiersze.join('\n') : '(pusto)'}
      </Box>
    </Box>
  );
}

/** Widok w motywie edytora — patrz `theme.ts`. */
export function ConflictTab(props: ConflictTabProps) {
  return (
    <ThemeProvider theme={MOTYW_ZAKLADKI}>
      <Box sx={{ height: '100%', bgcolor: 'background.default', color: 'text.primary' }}>
        <ConflictTabWnetrze {...props} />
      </Box>
    </ThemeProvider>
  );
}
