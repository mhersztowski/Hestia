/**
 * DiagramCodeImportDialog — diagram klas z kodu źródłowego.
 *
 * Przepływ jest dwustopniowy i to jest sedno tego okna: **najpierw katalog,
 * potem wybór plików**. Skan `packages/core` daje kilkadziesiąt klas — to nie
 * jest diagram, to jest wykres kabli. Dlatego pierwszy krok tylko pokazuje, co
 * w katalogu jest, a użytkownik decyduje, co ma trafić na rysunek.
 *
 * Drugi krok **nie pyta backendu ponownie**: projekt UML z pierwszego przebiegu
 * ma już wszystkie klasy razem z plikiem, z którego pochodzą, więc zawężenie
 * jest filtrowaniem tego, co leży w pamięci.
 */
import { useCallback, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, List, ListItem, Stack, TextField, Typography,
} from '@mui/material';
import {
  umlDiagramToDocument, mermaidFormat,
  type DiagramDocument, type UmlDiagramLike,
} from '@hestia/ui-devtools/diagrams';
import { useEditorServices } from '../capabilities';
import { currentUserName, writeCodeSource, type CodeSource } from './diagramCodeImport';

/** Kształt odpowiedzi `POST /api/users/{u}/uml/sync` w części, której używamy. */
interface UmlProjectLike {
  diagrams: UmlDiagramLike[];
}

/**
 * Ile plików zaznaczamy z góry.
 *
 * Powyżej tego progu nie zaznaczamy nic: diagram z trzydziestu plików jest
 * nieczytelny, a domyślne „wszystko" zachęcałoby do kliknięcia „Wstaw" bez
 * patrzenia.
 */
const PROG_AUTOZAZNACZENIA = 8;

export interface DiagramCodeImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Wstawienie gotowego diagramu do bloku. */
  onImport: (code: string) => void;
  /** Katalog z poprzedniego importu — podpowiedź przy odświeżaniu. */
  initialDir?: string;
}

interface PlikZKlasami {
  file: string;
  classes: string[];
}

/** Pliki z projektu UML razem z klasami, które w nich są. */
function grupujPoPlikach(diagram: UmlDiagramLike): PlikZKlasami[] {
  const mapa = new Map<string, string[]>();
  for (const node of diagram.nodes) {
    const file = node.data.linkedFile ?? '(bez pliku)';
    mapa.set(file, [...(mapa.get(file) ?? []), node.data.name]);
  }
  return [...mapa.entries()]
    .map(([file, classes]) => ({ file, classes: classes.sort() }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

export function DiagramCodeImportDialog({
  open, onClose, onImport, initialDir,
}: DiagramCodeImportDialogProps) {
  const { umlCodeSync } = useEditorServices();
  const [dir, setDir] = useState(initialDir ?? '');
  const [pliki, setPliki] = useState<PlikZKlasami[]>([]);
  const [wybrane, setWybrane] = useState<Set<string>>(new Set());
  const [diagram, setDiagram] = useState<UmlDiagramLike | null>(null);
  const [blad, setBlad] = useState('');
  const [pracuje, setPracuje] = useState(false);

  const szukaj = useCallback(async () => {
    const user = currentUserName();
    if (!user || !dir.trim()) return;
    setPracuje(true);
    setBlad('');
    setPliki([]);
    setDiagram(null);
    try {
      if (!umlCodeSync) return;
      const wynik = await umlCodeSync.syncUmlFromCode<UmlProjectLike>(user, dir.trim());
      const pierwszy = wynik.project.diagrams[0];
      if (!pierwszy || pierwszy.nodes.length === 0) {
        setBlad('W tym katalogu nie znaleziono klas ani interfejsów.');
        return;
      }
      const znalezione = grupujPoPlikach(pierwszy);
      setDiagram(pierwszy);
      setPliki(znalezione);
      setWybrane(new Set(
        znalezione.length <= PROG_AUTOZAZNACZENIA ? znalezione.map((p) => p.file) : [],
      ));
    } catch (e) {
      setBlad(e instanceof Error ? e.message : String(e));
    } finally {
      setPracuje(false);
    }
  }, [dir]);

  const przelacz = (file: string) => {
    setWybrane((poprzednie) => {
      const next = new Set(poprzednie);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const wstaw = () => {
    if (!diagram) return;

    // Zawężenie robimy na modelu, nie drugim żądaniem: projekt z pierwszego
    // przebiegu ma już wszystko, czego potrzeba.
    const zawezony: UmlDiagramLike = {
      ...diagram,
      nodes: diagram.nodes.filter((n) => wybrane.has(n.data.linkedFile ?? '(bez pliku)')),
    };
    const doc: DiagramDocument = umlDiagramToDocument(zawezony);

    const source: CodeSource = {
      dir: dir.trim(),
      // Pełny wybór zapisujemy jako pusty — „cały katalog" znaczy wtedy to samo,
      // a odświeżenie po dopisaniu pliku obejmie go bez ruszania bloku.
      files: wybrane.size === pliki.length ? [] : [...wybrane].sort(),
    };
    onImport(writeCodeSource(mermaidFormat.serialize(doc), source));
    onClose();
  };

  const liczbaKlas = pliki
    .filter((p) => wybrane.has(p.file))
    .reduce((suma, p) => suma + p.classes.length, 0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Diagram klas z kodu źródłowego</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              fullWidth
              size="small"
              label="Katalog z kodem"
              placeholder="np. mycastle-code/packages/core/src/nodes albo drive/projekt/src"
              helperText="Ścieżka względem katalogu użytkownika. Przedrostek mycastle-code/ sięga do źródeł MyCastle."
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void szukaj(); }}
            />
            <Button variant="contained" onClick={() => void szukaj()} disabled={pracuje || !dir.trim()}>
              {pracuje ? 'Szukam…' : 'Szukaj klas'}
            </Button>
          </Stack>

          {blad && <Alert severity="error">{blad}</Alert>}

          {pliki.length > 0 && (
            <>
              <Typography variant="body2" color="text.secondary">
                Znaleziono {pliki.length} plików. Zaznacz te, które mają trafić na diagram —
                skan całego katalogu daje zwykle rysunek, którego nie da się przeczytać.
              </Typography>
              {pliki.length > PROG_AUTOZAZNACZENIA && wybrane.size === 0 && (
                <Alert severity="info">
                  Plików jest sporo, więc nic nie zaznaczyliśmy z góry. Wybierz kilka, od których chcesz zacząć.
                </Alert>
              )}
              <List dense sx={{ maxHeight: 320, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                {pliki.map((p) => (
                  <ListItem key={p.file} disableGutters sx={{ px: 1 }}>
                    <FormControlLabel
                      control={<Checkbox size="small" checked={wybrane.has(p.file)} onChange={() => przelacz(p.file)} />}
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{p.file}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {p.classes.join(', ')}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {diagram && (
          <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', pl: 2 }}>
            {liczbaKlas === 0 ? 'nie wybrano żadnej klasy' : `${liczbaKlas} klas(y) na diagramie`}
          </Typography>
        )}
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" onClick={wstaw} disabled={!diagram || wybrane.size === 0}>
          Wstaw diagram
        </Button>
      </DialogActions>
    </Dialog>
  );
}
