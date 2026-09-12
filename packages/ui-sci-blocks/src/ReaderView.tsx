/**
 * ReaderView — dokument w trybie czytania.
 *
 * To samo, co widzi autor w edytorze, tylko bez edytora: tekst, wzory,
 * symulacje i zadania, ułożone w kolejności z pliku. Raport (Etap 3) opisuje
 * to jako „dokument bez chrome edytora, ładny na Foldzie".
 *
 * Wzory składa KaTeX (patrz `Math.tsx`); jego arkusz stylów ładuje host —
 * pakiet nie wstrzykuje CSS-a, żeby nie walczyć z motywem aplikacji.
 *
 * Renderowanie markdownu jest tu **celowo minimalne** — nagłówki, akapity, kod
 * w linii i wyliczenia. Pełny renderer należy do hosta (MdEditor ma go od
 * dawna); tutaj chodzi o to, żeby dokument dało się przeczytać bez aplikacji, w
 * podglądzie i w przyszłym eksporcie statycznym. Dokładanie drugiego pełnego
 * renderera markdownu obok istniejącego byłoby budowaniem frameworka zamiast
 * treści — a przed tym raport ostrzega wprost.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { parseFormulaBlock, type FormulaBlock, type ReferenceKind } from '@hestia/core-sci';
import { FormulaBlockView } from './FormulaBlockView';
import { SimBlock } from './SimBlock';
import { ScriptBlock } from './ScriptBlock';
import { ExerciseBlock } from './ExerciseBlock';
import { FieldBlock } from './FieldBlock';
import { LinAlgBlock } from './LinAlgBlock';
import { ProcedureBlock } from './ProcedureBlock';
import { FigureBlock } from './FigureBlock';
import { TableBlock } from './TableBlock';
import { CalloutBlock } from './CalloutBlock';
import type { SolutionDraft } from './SolutionDialog';
import type { Solution } from '@hestia/core-sci';
import { LawBlock } from './LawBlock';
import { Markdown } from './Markdown';
import { punktyLamania, stronaDlaOffsetu } from './lamanieStron';
import { kontenerPrzewijania, pozycjaPrzewijania, przewinDo } from './przewijanie';
import type { WorkerFactory } from './useModelRunner';
import type { Quality } from '@hestia/core-sci';

export interface ReaderViewProps {
  markdown: string;
  /** Szerokość kolumny tekstu; węższa czyta się lepiej. */
  maxWidth?: number;
  /** Fabryka workera obliczeń — symulacje liczą poza wątkiem interfejsu. */
  workerFactory?: WorkerFactory;
  /**
   * Zgłoszenie próby rozwiązania zadania — host zapisuje je w postępach.
   *
   * Identyfikator zadania jest unikalny tylko w obrębie dokumentu, więc
   * doklejamy do niego ścieżkę; inaczej „zadanie-1" z dwóch lekcji dzieliłoby
   * jeden harmonogram powtórek.
   */
  onAttempt?: (attempt: { id: string; quality: Quality; hintsUsed: number }) => void;
  /** Ścieżka dokumentu — przedrostek identyfikatora zadania. */
  path?: string;
  /**
   * Rozwiązywanie odsyłaczy `[[id]]` na wzory bazy.
   *
   * Host podaje je, bo tylko on ma indeks całej bazy; bez tego odsyłacze do
   * innych dokumentów pokazują się jako nieznane. Odsyłacze w obrębie
   * dokumentu działają zawsze — na jego własnych wzorach.
   */
  resolveRef?: (id: string) => {
    code?: string;
    kind?: ReferenceKind;
    documentTitle?: string;
    sameDocument: boolean;
  } | undefined;
  /** Przejście do celu odsyłacza; brak = odsyłacz tylko pokazuje podgląd. */
  onNavigate?: (id: string) => void;
  /**
   * Czytanie stronami zamiast przewijania.
   *
   * Przewijanie jest złe dla podręcznika z dwóch powodów: gubi miejsce (po
   * odłożeniu telefonu nie wiadomo, gdzie się było) i nie pokazuje postępu.
   * Strona ma wysokość widoku, więc czytelnik wraca zawsze do tego samego
   * kadru, a licznik „3 / 12" mówi coś prawdziwego.
   *
   * Podział **wynika z pomiaru**, nie z liczby znaków: ten sam rozdział na
   * telefonie i na monitorze ma inną liczbę stron i tak być powinno.
   */
  paged?: boolean;
  /**
   * Zgłoszenie „przeczytałem" — host zapisuje je w statystykach.
   *
   * Brak = przycisku nie ma. Statystyka potrzebuje sygnału, którego nie da się
   * wywnioskować z przewijania: przewinięcie do końca znaczy tyle, że ktoś
   * przeciągnął palcem. Deklaracja czytelnika jest jedyną wiarygodną miarą.
   */
  onRead?: (read: boolean) => void;
  /** Czy dokument jest już oznaczony jako przeczytany. */
  read?: boolean;
  /**
   * Historia i zapis rozwiązań zadań.
   *
   * Kontrakt hosta, bo tylko on ma plik postępów. Klucz jest taki sam jak
   * w harmonogramie (`dokument:zadanie`), więc jedno zadanie ma jedną tożsamość
   * w całej warstwie postępów. Brak = przycisków „rozwiąż" i „historia" nie ma.
   */
  solutionStore?: {
    get: (exerciseId: string) => Solution[];
    save: (exerciseId: string, draft: SolutionDraft) => void;
  };
}

type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'formula'; id: string; body: string }
  | { kind: 'sim'; body: string }
  | { kind: 'simscript'; body: string }
  | { kind: 'exercise'; id: string; body: string }
  | { kind: 'field'; id: string; body: string }
  | { kind: 'linalg'; id: string; body: string }
  | { kind: 'procedure'; id: string; body: string }
  | { kind: 'figure'; id: string; body: string }
  | { kind: 'table'; id: string; body: string }
  | { kind: 'callout'; id: string; body: string }
  | { kind: 'law'; id: string; body: string }
  | { kind: 'code'; language: string; body: string };

const FENCE = /```([^\n]*)\n([\s\S]*?)```/g;

/** Dzieli dokument na tekst i bloki — kolejność z pliku zostaje zachowana. */
export function splitDocument(markdown: string): Segment[] {
  const body = markdown
    // Nagłówek YAML należy do metadanych, nie do treści.
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    // Znaczniki bloków, które dokłada edytor (`<!-- bid:… -->`). Są techniczne
    // i w trybie czytania nie mają czego szukać — bez tego artykuł zaczyna
    // wyglądać jak zrzut z bazy danych.
    .replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n?/gm, '');
  const segments: Segment[] = [];
  let last = 0;

  for (const match of body.matchAll(FENCE)) {
    const before = body.slice(last, match.index);
    if (before.trim()) segments.push({ kind: 'text', content: before });
    last = match.index! + match[0].length;

    const info = match[1].trim();
    const content = match[2];

    const formula = /^formula:([A-Za-z0-9_-]+)$/.exec(info);
    const exercise = /^exercise:([A-Za-z0-9_-]+)$/.exec(info);
    const field = /^field:([A-Za-z0-9_-]+)$/.exec(info);
    const linalg = /^linalg:([A-Za-z0-9_-]+)$/.exec(info);
    const procedura = /^procedure:([A-Za-z0-9_-]+)$/.exec(info);
    const rysunek = /^figure:([A-Za-z0-9_-]+)$/.exec(info);
    const tablica = /^table:([A-Za-z0-9_-]+)$/.exec(info);
    const notka = /^callout:([A-Za-z0-9_-]+)$/.exec(info);
    const prawo = /^law:([A-Za-z0-9_-]+)$/.exec(info);

    if (rysunek) segments.push({ kind: 'figure', id: rysunek[1], body: content });
    else if (notka) segments.push({ kind: 'callout', id: notka[1], body: content });
    else if (prawo) segments.push({ kind: 'law', id: prawo[1], body: content });
    else if (tablica) segments.push({ kind: 'table', id: tablica[1], body: content });
    else if (procedura) segments.push({ kind: 'procedure', id: procedura[1], body: content });
    else if (linalg) segments.push({ kind: 'linalg', id: linalg[1], body: content });
    else if (field) segments.push({ kind: 'field', id: field[1], body: content });
    else if (formula) segments.push({ kind: 'formula', id: formula[1], body: content });
    else if (exercise) segments.push({ kind: 'exercise', id: exercise[1], body: content });
    else if (/^simscript(:|$)/.test(info)) segments.push({ kind: 'simscript', body: content });
    else if (/^sim(:|$)/.test(info)) segments.push({ kind: 'sim', body: content });
    else segments.push({ kind: 'code', language: info, body: content });
  }

  const rest = body.slice(last);
  if (rest.trim()) segments.push({ kind: 'text', content: rest });
  return segments;
}

/**
 * Nastawy bloku `field` — JSON, jak w `sim`.
 *
 * `duration` i `frames` sterują przebiegiem, cała reszta to wartości
 * parametrów. Rozdzielamy je tutaj, żeby autor mógł pisać płaski obiekt
 * (`{"alpha": 0.01, "duration": 3}`) zamiast zagnieżdżać parametry w osobnym polu.
 */
function parseSetup(body: string) {
  try {
    const { duration, frames, ...values } = JSON.parse(body || '{}') as Record<string, number>;
    return { duration, frames, values };
  } catch {
    return undefined;
  }
}

/** Nastawy sceny algebry — co pokazać obok przekształcenia. */
function parseStageSetup(body: string) {
  try {
    return JSON.parse(body || '{}') as { eigen?: boolean; extent?: number; unitSquare?: boolean };
  } catch {
    return undefined;
  }
}

const text: CSSProperties = { fontSize: 15, lineHeight: 1.65, color: '#1e293b' };

export function ReaderView({
  markdown, maxWidth = 720, workerFactory, onAttempt, path, resolveRef, onNavigate, paged,
  onRead, read, solutionStore,
}: ReaderViewProps) {
  const segments = useMemo(() => splitDocument(markdown), [markdown]);
  // Bloki `formula` z dyrektywą `@pde` opisują pola; blok `field` tylko je
  // uruchamia, tak jak `sim` uruchamia graf wzorów.
  const pola = useMemo(
    () => segments
      .filter((s): s is Extract<Segment, { kind: 'formula' }> => s.kind === 'formula')
      .filter((s) => /^\s*@pde\b/m.test(s.body)),
    [segments],
  );

  // Bloki `formula` z `@linalg` opisują sceny przekształceń; blok `linalg`
  // tylko je uruchamia, tak jak `field` uruchamia pola.
  const sceny = useMemo(
    () => segments
      .filter((s): s is Extract<Segment, { kind: 'formula' }> => s.kind === 'formula')
      .filter((s) => /^\s*@linalg\b/m.test(s.body)),
    [segments],
  );

  const formulas = useMemo<FormulaBlock[]>(
    () => segments
      .filter((s): s is Extract<Segment, { kind: 'formula' }> => s.kind === 'formula')
      .filter((s) => !/^\s*@pde\b/m.test(s.body) && !/^\s*@linalg\b/m.test(s.body))
      .map((s) => parseFormulaBlock(s.id, s.body)),
    [segments],
  );

  /**
   * Rozwiązanie odsyłacza: najpierw wzory tego dokumentu, potem indeks hosta.
   *
   * Dzięki temu odsyłacze wewnątrzdokumentowe — a w podręczniku to 97% —
   * działają nawet wtedy, gdy host nie podał indeksu (podgląd, eksport).
   */
  const rozwiazOdsylacz = (id: string) => {
    const wlasny = segments.find(
      (s): s is Extract<Segment, { kind: 'formula' | 'figure' | 'table' }> =>
        (s.kind === 'formula' || s.kind === 'figure' || s.kind === 'table'
          || s.kind === 'callout' || s.kind === 'law')
        && s.id === id,
    );
    if (wlasny) return { code: wlasny.body, kind: wlasny.kind, sameDocument: true };
    return resolveRef?.(id);
  };

  /**
   * Kliknięcie odsyłacza.
   *
   * Cel w tym samym dokumencie **przewijamy**, zamiast wołać nawigację hosta —
   * ta przeładowałaby tę samą stronę i nic by się nie stało. W podręczniku
   * ogromna większość odesłań jest wewnątrzdokumentowa, więc to jest przypadek
   * typowy, nie brzegowy.
   */
  const przejdzDoCelu = (id: string) => {
    const cel = typeof document !== 'undefined' ? document.getElementById(`ref-${id}`) : null;
    if (cel) {
      cel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onNavigate?.(id);
  };

  const okno = useRef<HTMLDivElement>(null);
  const tresc = useRef<HTMLDivElement>(null);
  /** Artykuł istnieje w obu trybach — po nim mierzymy miejsce lektury. */
  const artykul = useRef<HTMLElement>(null);
  const [strona, setStrona] = useState(0);
  /**
   * Przesunięcia początków stron.
   *
   * Lista, a nie jedna wysokość: strony mają różne rozmiary, bo łamiemy je
   * między elementami, a nie co stałą liczbę pikseli. Wersja z jedną wysokością
   * tnie wzór albo symulację w połowie.
   */
  const [punkty, setPunkty] = useState<number[]>([0]);

  /**
   * Przełączenie trybu czytania zachowuje miejsce w dokumencie.
   *
   * Tryb odpowiada za **sposób pokazywania**, nie za miejsce lektury. Skok na
   * początek rozdziału przy każdym przełączeniu kazał czytelnikowi szukać
   * akapitu, przy którym przed chwilą był.
   *
   * Obie strony przeliczenia idą przez jedną wielkość: przesunięcie od góry
   * treści. W trybie stron niesie je numer strony, w trybie przewijania —
   * pozycja okna. Wspólna miara jest tu jedynym sposobem, żeby przejście było
   * odwracalne.
   *
   * Efekt stoi **przed** pomiarem, bo przy wejściu w tryb stron podział na
   * strony dopiero powstanie: zapisujemy miejsce, a stronę wybiera pomiar,
   * gdy zna już punkty łamania.
   */
  const poprzedniTryb = useRef(paged);
  const docelowyOffset = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (poprzedniTryb.current === paged) return;
    const bylyStrony = poprzedniTryb.current;
    poprzedniTryb.current = paged;

    const element = artykul.current;
    if (!element || typeof window === 'undefined') return;

    // Treść przewija najbliższy przodek z własnym przewijaniem, a nie zawsze
    // okno: strona bywa osadzona w obszarze roboczym o stałej wysokości.
    // Pytanie okna dawało wtedy zero i przejście nie robiło nic.
    const kontener = kontenerPrzewijania(element);
    const przewiniete = pozycjaPrzewijania(kontener);

    // Górna krawędź treści w układzie przewijanej zawartości, nie okna.
    const odniesienie = kontener?.getBoundingClientRect().top ?? 0;
    const goraTresci = element.getBoundingClientRect().top - odniesienie + przewiniete;

    if (bylyStrony && !paged) {
      przewinDo(kontener, goraTresci + (punkty[strona] ?? 0));
    } else if (!bylyStrony && paged) {
      docelowyOffset.current = przewiniete - goraTresci;
    }
  }, [paged, punkty, strona]);

  /**
   * Pomiar: ile treści i ile widoku.
   *
   * Liczony po każdym renderze i przy każdej zmianie rozmiaru — treść rośnie
   * także **po** pierwszym renderze, gdy doładują się obrazy rysunków albo
   * policzy symulacja. Podział zrobiony raz, na starcie, kończyłby się ostatnią
   * stroną w połowie wykresu.
   */
  useLayoutEffect(() => {
    if (!paged || typeof window === 'undefined') return undefined;

    const zmierz = () => {
      const widok = okno.current?.clientHeight || window.innerHeight;
      const kontener = tresc.current;
      const wysokosc = kontener?.scrollHeight ?? 0;

      // Mierzymy **dzieci artykułu**, nie sam artykuł: to one są akapitami,
      // wzorami i symulacjami, między którymi wolno łamać.
      const tekst = artykul.current;
      const gora = tekst?.getBoundingClientRect().top ?? 0;
      const elementy = [...(tekst?.children ?? [])].map((dziecko) => {
        const prostokat = dziecko.getBoundingClientRect();
        return { top: prostokat.top - gora, height: prostokat.height };
      });

      const nowe = punktyLamania(elementy, widok, wysokosc);
      setPunkty((p) => (p.length === nowe.length && p.every((v, i) => v === nowe[i]) ? p : nowe));

      // Miejsce zapamiętane przy wejściu w tryb stron — odtwarzamy je dopiero
      // teraz, bo dopiero teraz wiadomo, gdzie przebiegają granice stron.
      if (docelowyOffset.current !== null) {
        setStrona(stronaDlaOffsetu(nowe, docelowyOffset.current));
        docelowyOffset.current = null;
      }
    };

    zmierz();
    window.addEventListener('resize', zmierz);
    const obserwator = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(zmierz);
    if (tresc.current) obserwator?.observe(tresc.current);
    return () => {
      window.removeEventListener('resize', zmierz);
      obserwator?.disconnect();
    };
  }, [paged, markdown]);

  // Zmiana podziału (obrót telefonu) nie może zostawić numeru strony za końcem.
  useEffect(() => {
    setStrona((p) => Math.min(p, punkty.length - 1));
  }, [punkty.length]);

  const przewroc = useCallback((o: number) => {
    setStrona((p) => Math.min(Math.max(0, p + o), punkty.length - 1));
  }, [punkty.length]);

  useEffect(() => {
    if (!paged || typeof window === 'undefined') return undefined;
    const klawisz = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') przewroc(1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') przewroc(-1);
    };
    window.addEventListener('keydown', klawisz);
    return () => window.removeEventListener('keydown', klawisz);
  }, [paged, przewroc]);

  const tekstDokumentu = (
    <article ref={artykul} style={{ maxWidth, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14, ...text }}>
      {segments.map((segment, index) => {
        switch (segment.kind) {
          case 'text':
            return (
              <Markdown
                key={index}
                source={segment.content}
                resolve={rozwiazOdsylacz}
                onNavigate={przejdzDoCelu}
              />
            );
          case 'figure':
            return <FigureBlock key={index} id={segment.id} code={segment.body} />;
          case 'table':
            return <TableBlock key={index} id={segment.id} code={segment.body} />;
          case 'callout':
            return <CalloutBlock key={index} id={segment.id} code={segment.body} />;
          case 'law':
            return <LawBlock key={index} id={segment.id} code={segment.body} />;
          case 'formula':
            return (
              // Kotwica dla odsyłacza w obrębie dokumentu — bez niej „równanie
              // (15-2)" nie miałoby dokąd przewinąć.
              <div key={index} id={`ref-${segment.id}`}>
                <FormulaBlockView id={segment.id} code={segment.body} />
              </div>
            );
          case 'sim':
            return <SimBlock key={index} code={segment.body} formulas={formulas} workerFactory={workerFactory} />;
          case 'procedure':
            return <ProcedureBlock key={index} id={segment.id} code={segment.body} />;
          case 'linalg': {
            const scena = sceny.find((p) => p.id === segment.id);
            if (!scena) {
              return (
                <div key={index} style={{ fontSize: 12, color: '#b91c1c' }}>
                  Nie ma sceny algebry „{segment.id}" w tym dokumencie.
                  {sceny.length > 0 && <> Dostępne: {sceny.map((p) => p.id).join(', ')}.</>}
                </div>
              );
            }
            return <LinAlgBlock key={index} id={scena.id} code={scena.body} setup={parseStageSetup(segment.body)} />;
          }
          case 'field': {
            // Blok `field` wskazuje wzór pola po identyfikatorze; nastawy
            // (parametry, długość, liczba klatek) są w jego własnej treści.
            const pole = pola.find((p) => p.id === segment.id);
            if (!pole) {
              return (
                <div key={index} style={{ fontSize: 12, color: '#b91c1c' }}>
                  Nie ma wzoru pola „{segment.id}" w tym dokumencie.
                  {/* Lista dostępnych, bo najczęstszą przyczyną jest literówka
                      albo zmiana identyfikatora tylko w jednym z dwóch bloków. */}
                  {pola.length > 0 && <> Dostępne: {pola.map((p) => p.id).join(', ')}.</>}
                </div>
              );
            }
            // Bez `onFormulaChange`: w trybie czytania rysunek żyje do
            // przeładowania. Zapis należy do edytora, nie do czytelnika.
            return <FieldBlock key={index} id={pole.id} code={pole.body} setup={parseSetup(segment.body)} />;
          }
          case 'simscript':
            return <ScriptBlock key={index} code={segment.body} workerFactory={workerFactory} />;
          case 'exercise':
            return (
              <ExerciseBlock
                key={index}
                id={segment.id}
                code={segment.body}
                formulas={formulas}
                resolve={rozwiazOdsylacz}
                onNavigate={przejdzDoCelu}
                onAttempt={onAttempt && ((attempt) => onAttempt({
                  ...attempt,
                  id: path ? `${path}:${attempt.id}` : attempt.id,
                }))}
                /*
                  Klucz historii składamy **tak samo jak klucz harmonogramu** —
                  identyfikator zadania jest unikalny tylko w obrębie dokumentu,
                  więc bez ścieżki „zadanie-1" z dwóch rozdziałów dzieliłoby
                  jedną historię.
                */
                solutions={solutionStore?.get(path ? `${path}:${segment.id}` : segment.id)}
                onSolution={solutionStore && ((draft) => solutionStore.save(
                  path ? `${path}:${segment.id}` : segment.id,
                  draft,
                ))}
              />
            );
          default:
            return (
              <pre key={index} style={{ background: '#f8fafc', borderRadius: 6, padding: 10, overflowX: 'auto', fontSize: 12 }}>
                <code>{segment.body}</code>
              </pre>
            );
        }
      })}
      {onRead && (
        /*
          Na końcu treści, nie w nagłówku: w nagłówku byłby propozycją
          oznaczenia czegoś, czego czytelnik jeszcze nie przeczytał — czyli
          zaproszeniem do psucia własnej statystyki.
        */
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <button
            type="button"
            aria-pressed={!!read}
            onClick={() => onRead(!read)}
            style={read ? przyciskPrzeczytane : przyciskPrzeczytam}
          >
            {read ? '✓ przeczytane' : 'przeczytałem'}
          </button>
        </div>
      )}
    </article>
  );

  if (!paged) return tekstDokumentu;

  return (
    <div ref={okno} style={ramkaStron}>
      {/*
        Strona jest **przesunięciem** treści, nie jej przycięciem. Gdyby każda
        renderowała tylko swoje akapity, wzór albo symulacja przecięte granicą
        musiałyby się przemontować przy każdym przewróceniu — a symulacja liczy
        się wtedy od nowa.
      */}
      <div
        ref={tresc}
        data-testid="reader-pages"
        style={{
          transform: `translateY(-${punkty[strona] ?? 0}px)`,
          transition: 'transform 180ms ease-out',
        }}
      >
        {tekstDokumentu}
      </div>

      <button type="button" aria-label="poprzednia strona" onClick={() => przewroc(-1)} style={{ ...polowa, left: 0 }} />
      <button type="button" aria-label="następna strona" onClick={() => przewroc(1)} style={{ ...polowa, right: 0 }} />

      <div style={licznikStron}>{strona + 1} / {punkty.length}</div>
    </div>
  );
}

const przyciskPrzeczytam: CSSProperties = {
  fontSize: 13,
  padding: '6px 16px',
  borderRadius: 16,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  cursor: 'pointer',
};

/** Oznaczony stan wygląda inaczej, żeby dało się go rozpoznać bez czytania. */
const przyciskPrzeczytane: CSSProperties = {
  ...przyciskPrzeczytam,
  borderColor: '#059669',
  background: '#ecfdf5',
  color: '#047857',
};

/** Okno strony: przycina treść i jest układem odniesienia dla stref dotyku. */
const ramkaStron: CSSProperties = {
  position: 'relative',
  height: '100%',
  minHeight: 200,
  overflow: 'hidden',
};

/**
 * Strefa przewracania — połowa szerokości, przezroczysta.
 *
 * Przezroczysta, a nie widoczna: w książce nie ma przycisków, a czytelnik
 * uczy się tego jednym przypadkowym dotknięciem. `zIndex` niżej niż dymki
 * odsyłaczy, żeby przycisk „otwórz" w dymku dało się nacisnąć.
 */
const polowa: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: '35%',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  zIndex: 5,
};

const licznikStron: CSSProperties = {
  position: 'absolute',
  bottom: 6,
  left: '50%',
  transform: 'translateX(-50%)',
  fontSize: 11,
  color: '#64748b',
  background: 'rgba(255,255,255,0.85)',
  borderRadius: 10,
  padding: '2px 10px',
  pointerEvents: 'none',
  zIndex: 6,
};

/** Kod w linii, pogrubienie i kursywa — reszta zostaje tekstem. */
