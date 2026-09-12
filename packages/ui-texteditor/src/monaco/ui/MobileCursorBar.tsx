/**
 * MobileCursorBar — pasek doczepiony nad klawiaturą ekranową.
 *
 * Na telefonie precyzyjne postawienie kursora palcem jest walką: kliknięcie
 * trafia „mniej więcej", a klawiatury systemowe nie mają strzałek. Ten pasek
 * daje ruch o znak i o linię w obu osiach oraz skoki na początek/koniec linii
 * i pliku (układ w `cursorBarButtons.ts`). Przytrzymanie powtarza akcję.
 *
 * Dwie rzeczy decydują o tym, czy to w ogóle działa:
 *   • pasek NIE MOŻE zabierać fokusu — każde wciśnięcie blokuje domyślną akcję
 *     wskaźnika, bo utrata fokusu chowa klawiaturę i przerywa pisanie;
 *   • wykrycie klawiatury musi obsłużyć oba zachowania systemu — nakładkę
 *     (przeglądarka) i zmniejszenie okna (WebView aplikacji mobilnej). Szczegóły
 *     i powód w `keyboardInset.ts`; liczenie samą różnicą z `visualViewport`
 *     sprawiało, że w `app/mycastle-mobile` pasek nie pokazywał się nigdy.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Box, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
} from '@mui/material';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import type * as monaco from 'monaco-editor';
import { keyboardState, type KeyboardState } from './keyboardInset';
import { CURSOR_BAR_BUTTONS, type CursorBarAction } from './cursorBarButtons';
import { collapseForMove, normalizePastedText, withTimeout, positionAfterInsert } from './cursorBarActions';

const ICONS: Record<CursorBarAction, React.ReactNode> = {
  cursorTop: <VerticalAlignTopIcon fontSize="small" />,
  cursorHome: <FirstPageIcon fontSize="small" />,
  cursorLeft: <KeyboardArrowLeftIcon fontSize="small" />,
  cursorUp: <KeyboardArrowUpIcon fontSize="small" />,
  cursorDown: <KeyboardArrowDownIcon fontSize="small" />,
  cursorRight: <KeyboardArrowRightIcon fontSize="small" />,
  cursorEnd: <LastPageIcon fontSize="small" />,
  cursorBottom: <VerticalAlignBottomIcon fontSize="small" />,
};

export interface MobileCursorBarProps {
  /** Czy w ogóle pokazywać (tryb mobilny hosta). */
  enabled: boolean;
  /** Zwraca aktywny edytor — pobierany przy każdym wciśnięciu, bo aktywna grupa się zmienia. */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null | undefined;
}

export function MobileCursorBar({ enabled, getEditor }: MobileCursorBarProps) {
  const [kb, setKb] = useState<KeyboardState>({ visible: false, inset: 0 });
  const [focused, setFocused] = useState(false);
  /** Powtarzanie przy przytrzymaniu — jak auto-repeat klawiatury sprzętowej. */
  const repeatRef = useRef<{ timeout?: number; interval?: number }>({});
  /** Największa wysokość widoku bez klawiatury — punkt odniesienia dla WebView. */
  const baselineRef = useRef({ width: 0, height: 0 });
  /** Pole zastępcze, gdy przeglądarka nie daje odczytać schowka. */
  const [pastePromptOpen, setPastePromptOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState('');

  // Klawiatura nie zgłasza się żadnym zdarzeniem — jedyny sygnał to zmiana
  // wymiarów widoku.
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;

    const update = () => {
      const height = vv?.height ?? window.innerHeight;
      const width = vv?.width ?? window.innerWidth;
      // Obrót ekranu zmienia wysokość „bez klawiatury", więc baseline liczymy
      // od nowa — inaczej portretowa wysokość udawałaby klawiaturę w poziomie.
      const base = baselineRef.current;
      if (base.width !== width) baselineRef.current = { width, height };
      else if (height > base.height) baselineRef.current = { width, height: height };

      setKb(keyboardState(
        { innerHeight: window.innerHeight, viewportHeight: vv?.height ?? null, offsetTop: vv?.offsetTop ?? 0 },
        baselineRef.current.height,
      ));
    };
    update();

    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    // `window.resize` to jedyny sygnał w WebView z adjustResize (visualViewport
    // tam też się zmienia, ale na starszych silnikach zdarzenie nie przychodzi).
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  // Pasek ma sens tylko, gdy pisze się w edytorze — pilnujemy fokusu ukrytego
  // <textarea> Monaco, a nie dowolnego pola na stronie.
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const el = document.activeElement as HTMLElement | null;
      setFocused(!!el?.classList?.contains('inputarea'));
    };
    check();
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, [enabled]);

  const stopRepeat = () => {
    window.clearTimeout(repeatRef.current.timeout);
    window.clearInterval(repeatRef.current.interval);
    repeatRef.current = {};
  };
  useEffect(() => stopRepeat, []);

  const run = (command: CursorBarAction) => {
    const editor = getEditor();
    if (!editor) return;

    // Zaznaczenie zrobione palcem stawia karetkę na jego przeciwnym końcu, więc
    // sama komenda Monaco „skakała daleko". Najpierw zwijamy do właściwej
    // krawędzi — jak strzałki na klawiaturze sprzętowej.
    const selection = editor.getSelection();
    if (selection) {
      const { collapseTo, runCommand } = collapseForMove(command, selection);
      if (collapseTo) editor.setPosition(collapseTo);
      if (!runCommand) {
        editor.revealPositionInCenterIfOutsideViewport(collapseTo ?? editor.getPosition()!);
        editor.focus();
        return;
      }
    }

    // `trigger` używa wbudowanych komend Monaco, więc zaznaczanie, składanie kodu
    // i pozycja przewijania zachowują się dokładnie jak przy klawiszach strzałek.
    editor.trigger('mobile-cursor-bar', command, null);
    editor.focus();
  };

  /**
   * Wklejenie jedną edycją — z pominięciem ścieżki „wpisywania".
   *
   * Systemowe „Wklej" w WebView wprowadza tekst jak klawiaturę, więc auto-wcięcia
   * i auto-domykanie nawiasów rozjeżdżały wklejony kod, a powtórzenie operacji
   * bywało niemożliwe. Tu czytamy schowek sami i wstawiamy dosłownie — dowolną
   * liczbę razy.
   */
  const paste = async () => {
    const editor = getEditor();
    if (!editor) return;

    // Czytamy schowek najwyżej przez chwilę: w WebView bez uprawnienia ta
    // obietnica potrafi nigdy nie wrócić, a przycisk wygląda wtedy na martwy.
    const read = navigator.clipboard?.readText?.();
    const text = read ? normalizePastedText(await withTimeout(read, 800, '')) : '';

    if (!text) {
      // Brak dostępu do schowka — pole zastępcze, do którego użytkownik wkleja
      // systemowo i które wstawia tekst do edytora.
      setPastePromptOpen(true);
      return;
    }
    insertText(editor, text);
  };

  const insertText = (editor: monaco.editor.IStandaloneCodeEditor, text: string) => {
    const selection = editor.getSelection();
    if (!selection || !text) return;
    const start = { lineNumber: selection.startLineNumber, column: selection.startColumn };

    // Undo-stopy z obu stron: bez nich wklejenie sklejało się z poprzednimi
    // zmianami i jedno cofnięcie kasowało znacznie więcej, niż wynikało z akcji.
    editor.pushUndoStop();
    editor.executeEdits('mobile-paste', [{ range: selection, text, forceMoveMarkers: true }]);
    editor.pushUndoStop();

    // Monaco zostawia karetkę przed wstawionym fragmentem — kolejne wklejenie
    // trafiałoby w środek poprzedniego.
    const end = positionAfterInsert(start, text);
    editor.setPosition(end);
    editor.revealPositionInCenterIfOutsideViewport(end);
    editor.focus();
  };

  const press = (command: CursorBarAction) => (e: React.PointerEvent) => {
    // Bez tego wciśnięcie zabiera fokus edytorowi i klawiatura się chowa.
    e.preventDefault();
    e.stopPropagation();
    run(command);
    stopRepeat();
    repeatRef.current.timeout = window.setTimeout(() => {
      repeatRef.current.interval = window.setInterval(() => run(command), 60);
    }, 400);
  };

  // Pasek chowamy razem z klawiaturą, ale okno wklejania musi przeżyć jej
  // zniknięcie — otwarcie dialogu zabiera fokus edytorowi i klawiatura znika.
  const bar = !enabled || !focused || !kb.visible ? null : (
    <Box
      // position: fixed + bottom = wysokość nakładki klawiatury; w WebView, gdzie
      // okno jest już skrócone, inset wynosi 0 i pasek siedzi na jego dole.
      // `env(safe-area-inset-bottom)` trzyma go nad gestem nawigacji.
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: kb.inset > 0 ? kb.inset : 'env(safe-area-inset-bottom, 0px)',
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        // Stałe, równe przyciski zamiast rozciągliwych: przy `space-between`
        // i `flex: 1 1 auto` szerokości skakały zależnie od ikony i pasek
        // wyglądał na rozjechany. Nadmiar chowa poziome przewijanie.
        justifyContent: 'flex-start',
        flexWrap: 'nowrap',
        gap: 0.25,
        px: 0.5,
        py: 0.5,
        overflowX: 'auto',
        // Pasek przewijamy palcem w poziomie, ale bez „gumowego" odbicia strony.
        overscrollBehaviorX: 'contain',
        '&::-webkit-scrollbar': { display: 'none' },
        bgcolor: '#2d2d2d',
        borderTop: '1px solid #444',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.35)',
        touchAction: 'none',
      }}
      onPointerUp={stopRepeat}
      onPointerCancel={stopRepeat}
      onPointerLeave={stopRepeat}
    >
      <Tooltip title="Wklej ze schowka">
        <IconButton
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); void paste(); }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.preventDefault()}
          sx={{
            color: '#8ec7ff', bgcolor: '#38445a', '&:active': { bgcolor: '#4a5a78' },
            borderRadius: 1.5, flex: '0 0 auto', width: 40, height: 36, mr: 0.75,
          }}
        >
          <ContentPasteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {CURSOR_BAR_BUTTONS.map((b) => (
        <Tooltip key={b.command} title={b.title}>
          <IconButton
            onPointerDown={press(b.command)}
            // Kliknięcie już obsłużyliśmy na pointerdown; blokujemy domyślne,
            // żeby przeglądarka nie wywołała akcji drugi raz.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.preventDefault()}
            sx={{
              color: '#ddd', bgcolor: '#3a3a3a', '&:active': { bgcolor: '#4a4a4a' },
              borderRadius: 1.5,
              // Kciuk potrzebuje ~40 px celu — stała szerokość trzyma równy rytm
              // paska niezależnie od tego, jak szeroka jest ikona.
              flex: '0 0 auto', width: 40, height: 36,
            }}
          >
            {ICONS[b.command]}
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );

  return (
    <>
      {bar}

      {/* Zapasowa droga wklejania: WebView bez uprawnienia do schowka nie odda
          tekstu przez `navigator.clipboard`, ale systemowe „Wklej" w zwykłym
          polu działa zawsze. Stąd tekst wchodzi do edytora jedną edycją. */}
      <Dialog open={pastePromptOpen} onClose={() => setPastePromptOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontSize: '0.95rem' }}>Wklej tekst</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus multiline minRows={4} fullWidth value={pasteDraft}
            onChange={(e) => setPasteDraft(e.target.value)}
            placeholder="Przytrzymaj i wybierz „Wklej”, potem zatwierdź."
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setPastePromptOpen(false); setPasteDraft(''); }}>Anuluj</Button>
          <Button
            variant="contained"
            disabled={!pasteDraft}
            onClick={() => {
              const editor = getEditor();
              if (editor) insertText(editor, normalizePastedText(pasteDraft));
              setPastePromptOpen(false);
              setPasteDraft('');
            }}
          >
            Wstaw
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
