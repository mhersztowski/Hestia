/**
 * DiagramCodeExportDialog — szkielet kodu z diagramu klas.
 *
 * Funkcja świadomie skromna i świadomie **jednokierunkowa**. Generowanie kodu
 * z diagramu odwraca zależność, na której stoi cała reszta: kod jest źródłem
 * prawdy, diagram jego widokiem. Dlatego to okno pokazuje pliki i pozwala je
 * pobrać, ale **niczego nie zapisuje** w repozytorium ani w Drive — decyzja,
 * gdzie ten kod trafi i co z nim zrobić, należy do piszącego.
 *
 * Wartość jest w dwóch wąskich przypadkach: projektowanie *przed* pisaniem
 * (diagram powstaje zamiast kodu, na etapie ustalania, jakie mają być klasy)
 * oraz ten sam model danych w kilku językach. Poza nimi szkielet klasy pisze
 * się szybciej, niż rysuje prostokąty — i to jest w porządku.
 */
import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { documentToUmlDiagram, type DiagramDocument } from '@hestia/ui-devtools/diagrams';
import { useEditorServices } from '../capabilities';
import { currentUserName } from './diagramCodeImport';

type Language = 'typescript' | 'python' | 'cpp';

const JEZYKI: Array<{ value: Language; label: string }> = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
];

export interface DiagramCodeExportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Diagram klas, z którego powstaje szkielet. */
  document: DiagramDocument;
}

interface Plik {
  file: string;
  content: string;
}

export function DiagramCodeExportDialog({
  open,
  onClose,
  document: doc,
}: DiagramCodeExportDialogProps) {
  const { umlCodeSync } = useEditorServices();
  const [language, setLanguage] = useState<Language>('typescript');
  const [pliki, setPliki] = useState<Plik[]>([]);
  const [blad, setBlad] = useState('');
  const [pracuje, setPracuje] = useState(false);

  const generuj = useCallback(async () => {
    const user = currentUserName();
    if (!user) {
      setBlad('Generowanie wymaga zalogowania');
      return;
    }

    setPracuje(true);
    setBlad('');
    try {
      if (!umlCodeSync) return;
      const wynik = await umlCodeSync.generateCodeFromUml(
        user,
        documentToUmlDiagram(doc),
        language
      );
      setPliki(wynik.files);
      if (wynik.files.length === 0)
        setBlad('Diagram nie ma klas, z których dałoby się coś wygenerować.');
    } catch (e) {
      setBlad(e instanceof Error ? e.message : String(e));
    } finally {
      setPracuje(false);
    }
  }, [doc, language]);

  const pobierz = (plik: Plik) => {
    const blob = new Blob([plik.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    // Sama nazwa pliku, bez ścieżki — przeglądarka i tak zapisze do Pobranych.
    link.download = plik.file.split('/').pop() ?? 'kod.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Szkielet kodu z diagramu</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            To jest <strong>punkt wyjścia</strong>, a nie synchronizacja. Pliki nie są nigdzie
            zapisywane — źródłem prawdy zostaje repozytorium, a diagram jego widokiem.
          </Alert>

          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              label="Język"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value as Language);
                setPliki([]);
              }}
              sx={{ minWidth: 180 }}
            >
              {JEZYKI.map((j) => (
                <MenuItem key={j.value} value={j.value}>
                  {j.label}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="contained" onClick={() => void generuj()} disabled={pracuje}>
              {pracuje ? 'Generuję…' : 'Generuj'}
            </Button>
          </Stack>

          {blad && <Alert severity="error">{blad}</Alert>}

          {pliki.map((plik) => (
            <Stack key={plik.file} spacing={0.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1 }}>
                  {plik.file}
                </Typography>
                <Button size="small" onClick={() => pobierz(plik)}>
                  Pobierz
                </Button>
              </Stack>
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  m: 0,
                  p: 1,
                  maxHeight: 240,
                  overflow: 'auto',
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre',
                }}
              >
                {plik.content}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Zamknij</Button>
      </DialogActions>
    </Dialog>
  );
}
