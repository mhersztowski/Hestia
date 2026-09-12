/**
 * DiagramBlockView — trzy tryby bloku kodu z diagramem: Code / View / Edit.
 *
 *   • **Code** — zwykła edycja tekstu (to, co blok kodu robił dotąd);
 *   • **View** — render biblioteką docelową (dla Mermaida: `mermaid.render`);
 *   • **Edit** — edytor graficzny z `@hestia/ui-devtools/diagrams`.
 *
 * Tryb graficzny pracuje na neutralnym modelu diagramu, a tekst wchodzi i
 * wychodzi przez adapter formatu. Dzięki temu ten sam pasek obsłuży kolejne
 * języki (PlantUML, własny JSON) — wystarczy, że rejestr formatów je rozpozna.
 *
 * Zapis z trybu graficznego nadpisuje treść bloku, więc adapter musi zachowywać
 * nierozpoznane linie; o to dba warstwa formatów, nie ten komponent.
 *
 * Dwie rzeczy, które warto wiedzieć, zanim się tu coś zmieni:
 *
 *   • **Tryb mieszka w infostringu** (` ```mermaid:view `), a nie w stanie
 *     komponentu — diagram bywa ilustracją w dokumencie i czytelnik ma zobaczyć
 *     rysunek, a nie źródło, bez klikania przy każdym otwarciu.
 *   • **Rodzaj, którego adapter nie umie edytować** (`mindmap`, `pie`…) zamyka
 *     tryb graficzny. Wcześniej takie źródło było domyślane na flowchart, więc
 *     płótno pokazywało węzły wyjęte z nierozumianej składni, a pierwsza
 *     operacja nadpisywała blok zapisem, którego Mermaid nie renderuje.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { registerBlockRenderer } from './blockRenderers';
import { useEditorServices } from '../capabilities';
import {
  languageWithMode, matchesDiagramLanguage, readMode, type DiagramBlockMode,
} from './diagramBlockMode';
import { downloadPng, downloadSvg } from './diagramExport';
import { formatIssue, issueSummary, type DiagramIssue } from './diagramIssues';
import {
  currentUserName, describeDiff, readCodeSource, writeCodeSource,
} from './diagramCodeImport';

/**
 * Okno importu i warstwa sieci wchodzą **leniwie**.
 *
 * Nie z powodu wagi bundla, tylko zależności: `MinisApiService` ciągnie za sobą
 * klienta RPC i pół aplikacji, a blok diagramu ma się renderować także tam,
 * gdzie tej aplikacji nie ma — w podglądzie, w eksporcie statycznym i w
 * testach. Import z kodu jest wtedy po prostu niedostępny, a diagram działa.
 */
const DiagramCodeImportDialog = lazy(() => import('./DiagramCodeImportDialog')
  .then((m) => ({ default: m.DiagramCodeImportDialog })));
const DiagramCodeExportDialog = lazy(() => import('./DiagramCodeExportDialog')
  .then((m) => ({ default: m.DiagramCodeExportDialog })));
import {
  DiagramEditor, SequenceEditor, PacketEditor, KanbanEditor, GanttEditor, TimelineEditor,
  diagramFormats, mergeLayout, mermaidFormat, starterDiagram, DIAGRAM_STARTERS, umlDiagramToDocument,
  type DiagramDocument, type DiagramFormat, type DiagramKind, type UmlDiagramLike,
} from '@hestia/ui-devtools/diagrams';
import '@xyflow/react/dist/style.css';

export type { DiagramBlockMode } from './diagramBlockMode';

interface Props {
  code: string;
  /** Zapis treści bloku (tryb graficzny); brak = blok tylko do odczytu. */
  onChange?: (next: string) => void;
  /** Język bloku kodu — do wyboru adaptera, gdy treść jest niejednoznaczna. */
  language?: string;
  /** Zapis infostringu; brak = tryb nie przeżyje zamknięcia dokumentu. */
  onLanguageChange?: (next: string) => void;
  children: (mode: DiagramBlockMode) => React.ReactNode;
}

/** Drobny przycisk paska podglądu — mniejszy niż przełącznik trybów. */
const miniBtn: React.CSSProperties = {
  fontSize: 11, padding: '1px 8px', borderRadius: 4, cursor: 'pointer',
  border: '1px solid #cbd5e1', background: '#fff', color: '#334155',
};

/** Przycisk nieczynny — ma wyglądać na nieczynny, a nie tylko nie reagować. */
const disabledBtn: React.CSSProperties = {
  opacity: 0.45, cursor: 'not-allowed', background: '#f8fafc', color: '#94a3b8',
};

const btn = (active: boolean): React.CSSProperties => ({
  fontSize: 12, padding: '2px 10px', borderRadius: 4, cursor: 'pointer',
  border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`,
  background: active ? '#dbeafe' : '#fff',
  color: active ? '#1e40af' : '#334155',
  fontWeight: active ? 600 : 400,
});

/** Skale powiększenia — jedno kliknięcie ma dawać widoczną różnicę. */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];

/**
 * Render Mermaida — biblioteka ładowana leniwie, bo waży kilkaset kilobajtów.
 *
 * Komponent trzyma **tekst SVG**, a nie tylko wstawia go do DOM: ten sam ciąg
 * jest źródłem podglądu i eksportu, więc pobrany plik jest dokładnie tym, co
 * widać, a nie drugim renderem, który mógłby się różnić.
 */
function MermaidPreview({ code, onSvg }: { code: string; onSvg?: (svg: string) => void }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError('');
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
        // Identyfikator musi być unikalny — mermaid tworzy pod nim element w DOM.
        const id = `mmd-${Math.random().toString(36).slice(2)}`;
        const wynik = await mermaid.render(id, code);
        if (cancelled) return;
        setSvg(wynik.svg);
        onSvg?.(wynik.svg);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [code, onSvg]);

  // Escape zamyka pełny ekran — nakładka przykrywa cały dokument, więc musi
  // dać się zamknąć bez szukania przycisku.
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  if (error) {
    return (
      <pre style={{ margin: 0, padding: 12, color: '#b91c1c', fontSize: 12, whiteSpace: 'pre-wrap' }}>
        Nie udało się wyrenderować diagramu:{'\n'}{error}
      </pre>
    );
  }

  const krok = (kierunek: 1 | -1) => {
    const index = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + kierunek))];
    setZoom(next ?? 1);
  };

  const obraz = (
    <div
      style={{
        padding: 12,
        overflow: 'auto',
        // Powiększenie przez `zoom` na treści, nie `transform`: przy `transform`
        // kontener zachowuje dawny rozmiar i paski przewijania nie sięgają tam,
        // gdzie diagram faktycznie się kończy.
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );

  const pasek = (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 8px' }} contentEditable={false}>
      <button type="button" style={miniBtn} onClick={() => krok(-1)} title="Pomniejsz">−</button>
      <span style={{ fontSize: 11, color: '#64748b', minWidth: 38, textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button type="button" style={miniBtn} onClick={() => krok(1)} title="Powiększ">+</button>
      <button type="button" style={miniBtn} onClick={() => setZoom(1)} title="Rozmiar naturalny">1:1</button>
      <span style={{ flex: 1 }} />
      <button
        type="button"
        style={miniBtn}
        onClick={() => setFullscreen((v) => !v)}
        title={fullscreen ? 'Zamknij pełny ekran (Esc)' : 'Pełny ekran'}
      >
        {fullscreen ? 'Zamknij' : 'Pełny ekran'}
      </button>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1400, background: '#fff',
          display: 'flex', flexDirection: 'column',
        }}
        contentEditable={false}
      >
        {pasek}
        <div style={{ flex: 1, overflow: 'auto' }}>{obraz}</div>
      </div>
    );
  }

  return (
    <div>
      {pasek}
      {obraz}
    </div>
  );
}

/**
 * Uwagi z rozbioru, pokazywane pod tekstem diagramu.
 *
 * Zwinięte do jednej linii, bo w większości bloków uwag nie ma wcale, a te,
 * które są, dotyczą zwykle rzeczy świadomie zostawionych (styl, `click`).
 * Rozwinięta lista pod każdym diagramem szybko stałaby się szumem, który
 * przestaje się czytać — a wtedy przestaje działać także wtedy, gdy ma rację.
 */
function IssuePanel({ issues, untouched }: { issues: DiagramIssue[]; untouched: number }) {
  const [otwarte, setOtwarte] = useState(false);

  const podsumowanie = [
    issueSummary(issues),
    untouched > 0 ? `${untouched} linii bez zmian` : undefined,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ padding: '4px 10px', borderTop: '1px solid rgba(0,0,0,0.06)' }} contentEditable={false}>
      <button
        type="button"
        onClick={() => setOtwarte((v) => !v)}
        style={{
          ...miniBtn,
          border: 'none',
          background: 'transparent',
          padding: 0,
          color: issues.length > 0 ? '#b45309' : '#64748b',
        }}
        title="Uwagi z odczytu diagramu"
      >
        {otwarte ? '▾' : '▸'} {podsumowanie}
      </button>
      {otwarte && (
        <>
          {issues.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 11, color: '#92400e' }}>
              {issues.map((issue, index) => (
                <li key={`${issue.line ?? 'x'}-${index}`}>{formatIssue(issue)}</li>
              ))}
            </ul>
          )}
          {untouched > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b' }}>
              {untouched === 1 ? 'Jedna linia jest' : `${untouched} linii jest`} poza modelem edytora
              (styl, <code>click</code>, komentarz, składnia spoza obsługiwanej).
              Edytor graficzny ich nie pokaże, ale zapis odda je nietknięte.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function DiagramBlockView({ code, onChange, language, onLanguageChange, children }: Props) {
  /**
   * Tryb mieszka w infostringu, a stan komponentu jest tylko jego kopią.
   *
   * Kopia jest potrzebna, bo blok bywa **tylko do odczytu** (tryb czytania,
   * eksport statyczny) — tam przełącznik ma działać, choć zapis nie dojdzie.
   */
  const zapisany = readMode(language ?? 'mermaid');
  const [mode, setMode] = useState<DiagramBlockMode>(zapisany);
  useEffect(() => { setMode(zapisany); }, [zapisany]);

  const zmienTryb = useCallback((next: DiagramBlockMode) => {
    setMode(next);
    if (language && onLanguageChange) onLanguageChange(languageWithMode(language, next));
  }, [language, onLanguageChange]);

  const format: DiagramFormat | undefined = useMemo(() => {
    // Rozpoznanie z treści ma pierwszeństwo: blok związany z plikiem
    // `.umlproj.json` bywa oznaczony jako `mermaid` z czasów, gdy adaptera
    // projektu jeszcze nie było.
    const przedrostek = (language ?? 'mermaid').split(':')[0];
    return diagramFormats.detect(code) ?? diagramFormats.get(przedrostek) ?? diagramFormats.get('mermaid');
  }, [code, language]);

  /**
   * SVG ostatniego udanego renderu — źródło eksportu.
   *
   * W stanie, a nie w ref, bo od jego obecności zależy, czy przyciski zapisu
   * mają być czynne. Podgląd musi więc raz przejść, zanim da się pobrać plik —
   * i to jest uczciwe: pobieramy dokładnie to, co widać.
   */
  const [renderedSvg, setRenderedSvg] = useState('');
  useEffect(() => { setRenderedSvg(''); }, [code]);

  const [exportError, setExportError] = useState('');

  /** Skąd pochodzi diagram — obecne tylko wtedy, gdy powstał z kodu źródłowego. */
  const codeSource = useMemo(() => readCodeSource(code), [code]);
  const [importOpen, setImportOpen] = useState(false);
  const [codeExportOpen, setCodeExportOpen] = useState(false);
  /** Podsumowanie ostatniego odświeżenia; znika przy następnej zmianie treści. */
  const [diff, setDiff] = useState<string[] | null>(null);
  const { umlCodeSync } = useEditorServices();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  /** Treść, dla której powstało podsumowanie — po cudzej zmianie przestaje ono być prawdą. */
  const diffForRef = useRef('');
  useEffect(() => {
    if (code !== diffForRef.current) setDiff(null);
  }, [code]);


  /**
   * Rodzaj diagramu, którego adapter nie umie edytować (`mindmap`, `pie`…).
   *
   * Sprawdzamy to **przed** wejściem w tryb graficzny, a nie w nim: samo
   * otwarcie płótna z węzłami wyjętymi z nierozumianej składni sugeruje, że
   * edycja jest możliwa, a pierwsza operacja nadpisałaby blok.
   */
  const unsupported = useMemo(() => {
    if (!format || !code.trim()) return undefined;
    try {
      return format.parse(code).document.unsupported;
    } catch {
      return undefined;
    }
  }, [format, code]);

  /**
   * Diagnostyka rozbioru — pokazywana przy tekście, bo tam się ją poprawia.
   *
   * Oprócz `issues` liczymy **linie zostawione nietknięte**. Adaptery są
   * wybaczające: prawie wszystko, czego nie rozumieją (`style`, `click`,
   * `classDef`, komentarze, składnia spoza modelu), ląduje w `unknown`, a nie
   * w `issues` — i wraca przy zapisie na swoje miejsce. Dla autora to jest
   * ważniejsza wiadomość niż lista błędów: „edytor graficzny tego nie pokaże,
   * ale też nie skasuje".
   */
  const diagnostyka = useMemo(() => {
    if (!format || !code.trim() || unsupported) return { issues: [] as DiagramIssue[], untouched: 0 };
    try {
      const wynik = format.parse(code);
      return { issues: wynik.issues, untouched: wynik.document.unknown.length };
    } catch (e) {
      return {
        issues: [{ message: e instanceof Error ? e.message : String(e) }] as DiagramIssue[],
        untouched: 0,
      };
    }
  }, [format, code, unsupported]);

  /** Rodzaj diagramu wprost z treści — decyduje, które narzędzia mają sens. */
  const kindOfCode = useMemo(() => {
    if (!format || !code.trim() || unsupported) return undefined;
    try {
      return format.parse(code).document.kind;
    } catch {
      return undefined;
    }
  }, [format, code, unsupported]);

  // Blok wczytany w trybie graficznym, którego nie da się edytować, wraca do
  // podglądu — tam widać diagram, zamiast komunikatu o odmowie.
  useEffect(() => {
    if (unsupported && mode === 'edit') zmienTryb('view');
  }, [unsupported, mode, zmienTryb]);

  // Model trzymamy lokalnie tylko w trybie graficznym: źródłem prawdy pozostaje
  // tekst bloku, więc każde wejście w „Edit" parsuje go od nowa.
  const [doc, setDoc] = useState<DiagramDocument | null>(null);
  const [parseError, setParseError] = useState('');
  /** Tekst, który sami zapisaliśmy — pozwala odróżnić własną zmianę od cudzej. */
  const selfWrittenRef = useRef<string | null>(null);
  /** Ostatni model, żeby przenieść na nowy układ po ponownym sparsowaniu. */
  const lastDocRef = useRef<DiagramDocument | null>(null);
  lastDocRef.current = doc;

  useEffect(() => {
    if (mode !== 'edit' || !format) return;
    // Zmiana pochodząca z edytora graficznego wraca tu pętlą (model → tekst →
    // blok → `code`). Ponowne parsowanie dawałoby nowy model bez współrzędnych,
    // więc diagram układałby się od zera po KAŻDEJ operacji — stąd skakanie.
    if (code === selfWrittenRef.current) return;
    try {
      const parsed = format.parse(code).document;
      // Tekst Mermaida nie niesie układu, więc przenosimy go z poprzedniego
      // modelu — dotyczy też ręcznej edycji w zakładce „Code".
      setDoc(lastDocRef.current ? mergeLayout(parsed, lastDocRef.current) : parsed);
      setParseError('');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }, [mode, code, format]);

  /**
   * Ponowny import z tego samego katalogu i tych samych plików.
   *
   * Układ przeżywa, bo siedzi we front matterze i nakłada go adapter przy
   * wczytaniu — klasa, która została na miejscu, nie skacze. Zmiany pokazujemy
   * osobno, bo bez nich odświeżenie jest ruchem w ciemno: diagram wygląda
   * podobnie i nie wiadomo, czy w kodzie w ogóle coś się ruszyło.
   */
  const odswiez = useCallback(async () => {
    if (!codeSource || !onChange || !format) return;
    setRefreshing(true);
    setRefreshError('');
    setDiff(null);
    try {
      const user = currentUserName();
      if (!user) throw new Error('Odświeżenie wymaga zalogowania');

      if (!umlCodeSync) throw new Error('Odświeżenie wymaga hosta z synchronizacją UML');
      const wynik = await umlCodeSync.syncUmlFromCode<{ diagrams: UmlDiagramLike[] }>(
        user, codeSource.dir, undefined, undefined,
        codeSource.files.length > 0 ? codeSource.files : undefined,
      );
      const swiezy = wynik.project.diagrams[0];
      if (!swiezy) throw new Error('Backend nie zwrócił diagramu');

      const przed = format.parse(code).document;
      const po = umlDiagramToDocument(swiezy);
      // Układ z bloku wchodzi na nowy model: klasa, która była, zostaje tam,
      // gdzie ją postawiono.
      const zUkladem = mergeLayout(po, przed);

      const tekst = writeCodeSource(format.serialize(zUkladem), codeSource);
      diffForRef.current = tekst;
      setDiff(describeDiff(przed, zUkladem));
      onChange(tekst);
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [codeSource, onChange, format, code]);

  const handleDocChange = useCallback((next: DiagramDocument) => {
    setDoc(next);
    if (!format || !onChange) return;
    const text = format.serialize(next);
    selfWrittenRef.current = text;
    onChange(text);
  }, [format, onChange]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid rgba(0,0,0,0.08)' }} contentEditable={false}>
        <button type="button" style={btn(mode === 'code')} onClick={() => zmienTryb('code')} title="Edycja tekstu diagramu">Code</button>
        <button type="button" style={btn(mode === 'view')} onClick={() => zmienTryb('view')} title="Podgląd wyrenderowany przez Mermaid">View</button>
        <button
          type="button"
          style={{ ...btn(mode === 'edit'), ...(unsupported ? disabledBtn : undefined) }}
          onClick={() => !unsupported && zmienTryb('edit')}
          disabled={!!unsupported}
          title={unsupported
            ? `Diagram „${unsupported}" nie ma jeszcze edytora graficznego — zostaje podgląd i edycja tekstu`
            : 'Edytor graficzny'}
        >
          Edit
        </button>
        {format && <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 4 }}>{format.label}</span>}
        {unsupported && (
          <span style={{ fontSize: 11, color: '#b45309' }}>
            {unsupported} — bez edycji graficznej
          </span>
        )}

        <span style={{ flex: 1 }} />

        {/* Zapis obrazu wymaga renderu, więc ma sens tylko przy podglądzie.
            Przycisk pokazany w innych trybach byłby czynny albo martwy w
            zależności od tego, czy blok był wcześniej oglądany — a to jest
            zachowanie nie do przewidzenia. */}
        {/* Import z kodu ma sens wszędzie tam, gdzie blok da się zapisać —
            także przy pustym, bo to najczęstszy moment, w którym się o niego
            sięga. Odświeżenie pojawia się dopiero, gdy blok wie, skąd pochodzi. */}
        {onChange && !unsupported && (
          <button
            type="button"
            style={miniBtn}
            onClick={() => setImportOpen(true)}
            title="Zbuduj diagram klas z plików źródłowych (TypeScript, Python, C++)"
          >
            Z kodu…
          </button>
        )}
        {onChange && codeSource && (
          <button
            type="button"
            style={{ ...miniBtn, ...(refreshing ? disabledBtn : undefined) }}
            disabled={refreshing}
            onClick={() => { void odswiez(); }}
            title={`Wczytaj ponownie z ${codeSource.dir}`}
          >
            {refreshing ? 'Odświeżam…' : 'Odśwież z kodu'}
          </button>
        )}

        {/* Szkielet kodu ma sens wyłącznie dla diagramu klas — dla schematu
            blokowego czy sekwencji nie ma z czego go zrobić. */}
        {kindOfCode === 'class' && (
          <button
            type="button"
            style={miniBtn}
            onClick={() => setCodeExportOpen(true)}
            title="Wygeneruj szkielet klas w TypeScripcie, Pythonie albo C++"
          >
            Do kodu…
          </button>
        )}

        {mode === 'view' && (
          <>
            <button
              type="button"
              style={{ ...miniBtn, ...(renderedSvg ? undefined : disabledBtn) }}
              disabled={!renderedSvg}
              onClick={() => {
                setExportError('');
                try {
                  downloadSvg(renderedSvg, code);
                } catch (e) {
                  setExportError(e instanceof Error ? e.message : String(e));
                }
              }}
              title="Zapisz diagram jako plik SVG"
            >
              SVG
            </button>
            <button
              type="button"
              style={{ ...miniBtn, ...(renderedSvg ? undefined : disabledBtn) }}
              disabled={!renderedSvg}
              onClick={() => {
                setExportError('');
                downloadPng(renderedSvg, code).catch((e: unknown) => {
                  setExportError(e instanceof Error ? e.message : String(e));
                });
              }}
              title="Zapisz diagram jako obraz PNG (w podwójnej rozdzielczości)"
            >
              PNG
            </button>
          </>
        )}
      </div>

      {exportError && (
        <div style={{ padding: '4px 10px', fontSize: 11, color: '#b91c1c' }} contentEditable={false}>
          Nie udało się zapisać obrazu: {exportError}
        </div>
      )}

      {refreshError && (
        <div style={{ padding: '4px 10px', fontSize: 11, color: '#b91c1c' }} contentEditable={false}>
          Nie udało się odświeżyć z kodu: {refreshError}
        </div>
      )}

      {/* Wynik odświeżenia. Pusta lista też jest wiadomością — i to często
          najważniejszą: „kod się nie zmienił" znaczy, że diagram jest aktualny. */}
      {diff && (
        <div
          style={{ padding: '4px 10px', fontSize: 11, color: '#334155', background: '#f8fafc' }}
          contentEditable={false}
        >
          {diff.length === 0 ? 'Odświeżono — bez zmian względem kodu.' : (
            <>
              <strong>Po odświeżeniu:</strong>
              <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                {diff.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      {codeExportOpen && doc && (
        <Suspense fallback={null}>
          <DiagramCodeExportDialog
            open={codeExportOpen}
            onClose={() => setCodeExportOpen(false)}
            document={doc}
          />
        </Suspense>
      )}

      {importOpen && (
        <Suspense fallback={null}>
          <DiagramCodeImportDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            initialDir={codeSource?.dir}
            onImport={(next) => { setDiff(null); onChange?.(next); }}
          />
        </Suspense>
      )}

      {mode === 'code' && children('code')}
      {mode === 'code' && (diagnostyka.issues.length > 0 || diagnostyka.untouched > 0) && (
        <IssuePanel issues={diagnostyka.issues} untouched={diagnostyka.untouched} />
      )}
      {/*
        `contentEditable={false}` na obszarze rysunku, nie tylko na paskach.
        Bloczek stoi wewnątrz edytowalnego obszaru ProseMirror-a, więc wszystko
        nieoznaczone jawnie dostaje kursor: migał on w podglądzie, a naciśnięcia
        klawiszy — zwłaszcza Entera — dopisywały do pliku `.md` puste akapity,
        których w treści nie widać.
      */}
      {mode === 'view' && (
        <div contentEditable={false}>
          {format?.id === 'mermaid'
            ? <MermaidPreview code={code} onSvg={setRenderedSvg} />
            // Projekt UML nie ma renderera tekstowego — Mermaid nie czyta JSON-a.
            // Podglądem jest wtedy edytor graficzny w trybie tylko do odczytu, bo
            // to on wie, jak narysować diagram klas z modelu.
            : <MermaidPreview code={format ? mermaidFormat.serialize(format.parse(code).document) : code} onSvg={setRenderedSvg} />}
        </div>
      )}
      {/* Pusty blok: zanim pokażemy płótno, trzeba wiedzieć, co rysujemy.
          Wybór rodzaju od razu wstawia poprawny szkielet, bo pusty diagram
          Mermaida kończy się komunikatem o błędzie składni. */}
      {mode === 'edit' && !code.trim() && onChange && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} contentEditable={false}>
          <div style={{ fontSize: 13, color: '#334155' }}>Wybierz rodzaj diagramu:</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {DIAGRAM_STARTERS.map((starter) => (
              <button
                key={starter.kind}
                type="button"
                onClick={() => {
                  const target = format ?? diagramFormats.get('mermaid');
                  if (!target) return;
                  onChange(target.serialize(starterDiagram(starter.kind as DiagramKind)));
                }}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid #cbd5e1', background: '#fff', minWidth: 200,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{starter.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{starter.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'edit' && (code.trim() || !onChange) && (
        // Płótno edytora graficznego — jak wyżej: bez tego kursor ProseMirror-a
        // ląduje między kształtami, a pisanie idzie do dokumentu.
        <div contentEditable={false}>
        {!format ? (
          <div style={{ padding: 12, fontSize: 12, color: '#b91c1c' }}>
            Nie rozpoznano formatu diagramu — edycja graficzna niedostępna.
          </div>
        ) : parseError ? (
          <div style={{ padding: 12, fontSize: 12, color: '#b91c1c' }}>Błąd odczytu diagramu: {parseError}</div>
        ) : doc?.kind === 'timeline' ? (
          // Oś wydarzeń to układ kolumn, nie graf — własny edytor.
          <TimelineEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={520} />
        ) : doc?.kind === 'gantt' ? (
          // Harmonogram to oś czasu, nie graf — własny edytor.
          <GanttEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={520} />
        ) : doc?.kind === 'kanban' ? (
          // Tablica kanban to układ pudełek, nie graf — własny edytor.
          <KanbanEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={520} />
        ) : doc?.kind === 'packet' ? (
          // Mapa bitów ma własny edytor: pole opisuje zakres bitów, a nie
          // położenie w grafie.
          <PacketEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={520} />
        ) : doc?.kind === 'sequence' ? (
          // Sekwencja ma własny edytor: jej układ wynika z kolejności w czasie,
          // a nie z pozycji elementów, więc płótno grafowe tu nie pasuje.
          <SequenceEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={560} />
        ) : doc ? (
          <DiagramEditor
            document={doc}
            onChange={handleDocChange}
            readOnly={!onChange}
            // Wysokość rośnie z diagramem: przy stałych 460 px diagram z
            // kilkunastoma węzłami był ściskany do nieczytelności albo ucinany.
            // Klasa liczy się podwójnie — ma ciało (pola i metody), więc zajmuje
            // wielokrotnie więcej miejsca w pionie niż zwykły węzeł.
            height={Math.min(760, Math.max(420, 160 + doc.nodes.reduce(
              (sum, node) => sum + 26 + (node.members?.length ?? 0) * 8, 0,
            )))}
          />
        ) : null}
        </div>
      )}
    </div>
  );
}

// Diagram Mermaida jest pierwszym klientem rejestru widoków bloków. Rejestracja
// przy imporcie modułu, tak jak formaty w `web-devtools` — edytor nie musi
// wiedzieć, że mermaid istnieje.
registerBlockRenderer({
  name: 'mermaid',
  matches: matchesDiagramLanguage,
  Component: DiagramBlockView,
});
