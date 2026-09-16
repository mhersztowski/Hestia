/**
 * HistoryTab.tsx — historia commitów.
 *
 * Lista po lewej, zmiany wybranego commita po prawej. Kliknięcie pliku otwiera
 * różnicę **tego commita względem poprzedniego** — bo pytanie przy historii
 * brzmi „co ta zmiana zrobiła", a nie „czym różni się od dziś".
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { MOTYW_ZAKLADKI } from './theme';
import type { GitApi, GitLogEntry } from './gitApi';
import { splitPath } from './model';

export interface HistoryTabProps {
  api: GitApi;
  /** Otwiera różnicę pliku między commitem a jego rodzicem. */
  onOpenDiff(path: string, ref: string): void;
  /** Historia zawężona do jednego pliku; bez tego cała gałąź. */
  file?: string;
}

function HistoryTabWnetrze({ api, onOpenDiff, file }: HistoryTabProps) {
  const [wpisy, setWpisy] = useState<GitLogEntry[] | null>(null);
  const [wybrany, setWybrany] = useState<GitLogEntry | null>(null);
  const [pliki, setPliki] = useState<string[] | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    let anulowane = false;
    api
      .log(100, file)
      .then((l) => {
        if (!anulowane) setWpisy(l);
      })
      .catch((e) => {
        if (!anulowane) setBlad((e as Error).message);
      });
    return () => {
      anulowane = true;
    };
  }, [api, file]);

  /** Pliki zmienione w commicie — z różnicy względem rodzica. */
  const wybierz = useCallback(
    async (wpis: GitLogEntry) => {
      setWybrany(wpis);
      setPliki(null);
      try {
        const diff = await api.diffText(`${wpis.hash}~1`, wpis.hash);
        const nazwy = [...diff.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]);
        setPliki(nazwy);
      } catch {
        // Pierwszy commit nie ma rodzica — pokazujemy pustą listę zamiast
        // błędu, bo to normalny stan, a nie usterka.
        setPliki([]);
      }
    },
    [api]
  );

  if (blad)
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="error">
          {blad}
        </Typography>
      </Box>
    );
  if (!wpisy)
    return (
      <Box sx={{ p: 2 }}>
        <CircularProgress size={18} />
      </Box>
    );

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <Box sx={{ width: 340, overflowY: 'auto', borderRight: '1px solid', borderColor: 'divider' }}>
        <List dense disablePadding>
          {wpisy.map((w) => (
            <ListItemButton
              key={w.hash}
              selected={wybrany?.hash === w.hash}
              onClick={() => {
                void wybierz(w);
              }}
              divider
              sx={{ py: 0.5 }}
            >
              <ListItemText
                primary={
                  <Typography variant="body2" noWrap>
                    {w.subject}
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    <code>{w.short}</code> · {w.authorName} ·{' '}
                    {new Date(w.date).toLocaleString('pl')}
                  </Typography>
                }
              />
            </ListItemButton>
          ))}
          {wpisy.length === 0 && (
            <Typography variant="caption" sx={{ display: 'block', p: 2, color: 'text.secondary' }}>
              {file ? 'Ten plik nie ma jeszcze historii.' : 'Repozytorium nie ma commitów.'}
            </Typography>
          )}
        </List>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {!wybrany ? (
          <Typography variant="caption" sx={{ display: 'block', p: 2, color: 'text.secondary' }}>
            Wybierz commit, żeby zobaczyć, co zmienił.
          </Typography>
        ) : (
          <Stack sx={{ p: 1.5 }} spacing={1}>
            <Typography variant="subtitle2">{wybrany.subject}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {wybrany.authorName} &lt;{wybrany.authorEmail}&gt; ·{' '}
              {new Date(wybrany.date).toLocaleString('pl')}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
              {wybrany.hash}
            </Typography>
            <Divider />
            {!pliki ? (
              <CircularProgress size={16} />
            ) : pliki.length === 0 ? (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Brak listy plików (to może być pierwszy commit w repozytorium).
              </Typography>
            ) : (
              <List dense disablePadding>
                {pliki.map((p) => {
                  const { name, dir } = splitPath(p);
                  return (
                    <ListItemButton
                      key={p}
                      onClick={() => onOpenDiff(p, wybrany.hash)}
                      sx={{ py: 0.25 }}
                    >
                      <ListItemText
                        primary={<Typography variant="caption">{name}</Typography>}
                        secondary={
                          dir ? (
                            <Typography
                              variant="caption"
                              sx={{ fontSize: 10, color: 'text.secondary' }}
                            >
                              {dir}
                            </Typography>
                          ) : null
                        }
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

/** Widok w motywie edytora — patrz `theme.ts`. */
export function HistoryTab(props: HistoryTabProps) {
  return (
    <ThemeProvider theme={MOTYW_ZAKLADKI}>
      <Box sx={{ height: '100%', bgcolor: 'background.default', color: 'text.primary' }}>
        <HistoryTabWnetrze {...props} />
      </Box>
    </ThemeProvider>
  );
}
