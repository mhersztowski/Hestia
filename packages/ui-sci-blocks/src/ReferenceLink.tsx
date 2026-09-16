/**
 * ReferenceLink — odsyłacz do wzoru albo hasła słownika, w biegnącym tekście.
 *
 * Przy 3191 odesłaniach w jednym tomie skakanie po dokumencie jest największym
 * kosztem czytania. Dlatego odsyłacz **pokazuje cel na miejscu**: dymek
 * z definicją albo wzorem, bez opuszczania zdania.
 *
 * Zachowanie zależy od tego, czy urządzenie **ma najeżdżanie** — pytamy o to
 * `matchMedia('(hover: hover)')`, a nie zgadujemy po szerokości ekranu, bo
 * laptop z ekranem dotykowym ma jedno i drugie i ma się zachowywać jak desktop.
 *
 *  • **z myszą** — najechanie odsłania dymek, kliknięcie przenosi,
 *  • **na dotyku** — tapnięcie odsłania dymek i **nie przenosi**; przejście
 *    jest jawnym przyciskiem w dymku.
 *
 * To drugie jest istotne: wcześniej dymek otwierał wyłącznie `onMouseEnter`,
 * a przeglądarka mobilna po tapnięciu wysyła syntetyczne `mouseenter` i zaraz
 * `click` — dymek migał i następowało przejście, więc na telefonie definicji
 * nie dało się przeczytać w ogóle. Wariant „drugi tap przenosi" odrzucony:
 * pierwszy tap wygląda wtedy jak zepsuty link.
 *
 * Odsyłacz w próżnię wygląda inaczej niż działający i mówi wprost, czego nie
 * ma. Cichy link, po którego kliknięciu nic się nie dzieje, jest gorszy od
 * widocznego braku — autor nigdy się o nim nie dowie.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import {
  parseFormulaBlock,
  parseTermBlock,
  symbolName,
  type ReferenceKind,
} from '@hestia/core-sci';
import { FigureBlock } from './FigureBlock';
import { TableBlock } from './TableBlock';
import { CalloutBlock } from './CalloutBlock';
import { LawBlock } from './LawBlock';
import { Math as MathView, symbolToLatex } from './Math';

export interface ReferenceTarget {
  /** Treść bloku (wzoru albo hasła) — z niej powstaje podgląd. */
  code?: string;
  /** Rodzaj celu; brak = wzór, dla zgodności ze starszymi wywołaniami. */
  kind?: ReferenceKind;
  /** Tytuł dokumentu, gdy cel leży w innym. */
  documentTitle?: string;
  sameDocument: boolean;
}

export interface ReferenceLinkProps {
  id: string;
  label?: string;
  target?: ReferenceTarget;
  /** Kliknięcie; brak = odsyłacz jest tylko podświetlony. */
  onNavigate?: (id: string) => void;
}

const styl: CSSProperties = {
  color: '#2563eb',
  borderBottom: '1px dotted #93c5fd',
  cursor: 'pointer',
  position: 'relative',
  whiteSpace: 'nowrap',
};

const stylBraku: CSSProperties = {
  color: '#b91c1c',
  borderBottom: '1px dotted #fca5a5',
  cursor: 'help',
};

/**
 * Czy urządzenie umie najeżdżać.
 *
 * Sprawdzane raz przy montowaniu; `matchMedia` bywa nieobecne w środowiskach
 * testowych i w SSR, więc brak traktujemy jak „ma mysz" — to zachowanie
 * dotychczasowe, czyli bezpieczniejsze dla istniejących widoków.
 */
function czyMysz(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(hover: hover)').matches;
}

/**
 * Ile czekać przed zamknięciem dymka po zjechaniu kursorem.
 *
 * Między słowem a dymkiem jest odstęp — kursor w drodze do dymka opuszcza
 * kotwicę i natychmiastowe zamknięcie sprawiało, że **nie dało się kliknąć**
 * przycisku „otwórz". Zamknięcie jest więc odroczone i anulowane, gdy kursor
 * wejdzie w dymek.
 */
const ZWLOKA_ZAMKNIECIA = 180;

export function ReferenceLink({ id, label, target, onNavigate }: ReferenceLinkProps) {
  const [podglad, setPodglad] = useState(false);
  const kotwica = useRef<HTMLSpanElement>(null);
  const [mysz] = useState(czyMysz);
  const zamkniecie = useRef<ReturnType<typeof setTimeout>>();
  const dymekEl = useRef<HTMLSpanElement>(null);
  /**
   * Położenie dymka w układzie **okna**, nie rodzica.
   *
   * Dymek renderuje się w portalu do `body`, więc liczymy współrzędne wprost:
   * `left`/`top` w pikselach i najwyższą dopuszczalną wysokość.
   */
  const [pozycja, setPozycja] = useState<{ left: number; top: number; maxHeight: number }>();

  /**
   * Domknięcie dymka do widoku.
   *
   * Dymek stoi domyślnie nad słowem i wyrównany do jego lewej krawędzi — przy
   * odsyłaczu blisko prawego brzegu wychodziłby poza ekran, a przy odsyłaczu
   * w pierwszym wierszu nie miałby się gdzie zmieścić u góry. Mierzymy po
   * otwarciu i przesuwamy albo odbijamy pod słowo.
   *
   * `useLayoutEffect`, bo korekta ma być widoczna od pierwszej klatki —
   * inaczej dymek mrugnąłby w złym miejscu.
   */
  useLayoutEffect(() => {
    if (!podglad) {
      setPozycja(undefined);
      return undefined;
    }
    const el = dymekEl.current;
    const kot = kotwica.current;
    if (!el || !kot || typeof window === 'undefined') return undefined;

    const MARGINES = 8;

    /**
     * Geometria licząca się w tym samym układzie, w którym dymek jest rysowany.
     *
     * Poprzednie podejścia przesuwały dymek `transform`-em wewnątrz treści.
     * Nie mogło to działać w ogólnym przypadku: każdy przodek z `overflow`
     * przycinał dymek, a każdy z `transform` stawał się dla niego układem
     * odniesienia — więc korekta liczona względem okna trafiała w inne
     * współrzędne niż te, w których dymek naprawdę leżał. Tryb czytania
     * stronami ma jedno i drugie.
     */
    const ustaw = () => {
      const link = kot.getBoundingClientRect();
      const dymek = el.getBoundingClientRect();
      const szer = dymek.width || 280;
      const wys = dymek.height || 200;

      const oknoW = window.innerWidth;
      const oknoH = window.innerHeight;

      // Poziomo: startujemy przy lewej krawędzi odsyłacza i wpychamy w ekran.
      const left = Math.max(MARGINES, Math.min(link.left, oknoW - szer - MARGINES));

      // Pionowo: nad odsyłaczem, jeśli jest tam miejsce; inaczej pod nim.
      // Gdy nie ma go po żadnej stronie, wybieramy stronę większą i przycinamy
      // wysokość — dymek przewija się wtedy w środku, zamiast wyjść poza ekran.
      const nadWolne = link.top - MARGINES * 2;
      const podWolne = oknoH - link.bottom - MARGINES * 2;
      const nad = wys <= nadWolne || nadWolne >= podWolne;

      const dostepna = Math.max(120, Math.min(oknoH - MARGINES * 2, nad ? nadWolne : podWolne));
      const wysokosc = Math.min(wys, dostepna);
      const top = nad
        ? Math.max(MARGINES, link.top - MARGINES - wysokosc)
        : Math.min(link.bottom + MARGINES, oknoH - MARGINES - wysokosc);

      setPozycja((p) =>
        p && p.left === left && p.top === top && p.maxHeight === dostepna
          ? p
          : { left, top, maxHeight: dostepna }
      );
    };

    ustaw();

    // Rysunek w podglądzie doładowuje się **po** otwarciu i zmienia wysokość
    // dymka — bez ponownego pomiaru korekta dotyczyłaby nieaktualnego kształtu.
    const obserwator =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(ustaw);
    if (el) obserwator?.observe(el);

    window.addEventListener('scroll', ustaw, true);
    window.addEventListener('resize', ustaw);
    return () => {
      obserwator?.disconnect();
      window.removeEventListener('scroll', ustaw, true);
      window.removeEventListener('resize', ustaw);
    };
  }, [podglad]);

  const anulujZamkniecie = () => {
    if (zamkniecie.current) clearTimeout(zamkniecie.current);
    zamkniecie.current = undefined;
  };
  const odlozZamkniecie = () => {
    anulujZamkniecie();
    zamkniecie.current = setTimeout(() => setPodglad(false), ZWLOKA_ZAMKNIECIA);
  };
  const pokaz = () => {
    anulujZamkniecie();
    setPodglad(true);
  };

  // Odmontowanie w trakcie odliczania zostawiłoby timer wołający setState.
  useEffect(() => anulujZamkniecie, []);

  /**
   * Zamykanie dymka otwartego dotykiem.
   *
   * Nasłuch na `pointerdown`, nie na `click`: kliknięcie w przycisk „otwórz"
   * wewnątrz dymka doszłoby do dokumentu i zamknęłoby dymek, zanim zdążyłby się
   * wykonać. `pointerdown` poprzedza `click`, więc sprawdzamy zawieranie
   * i zostawiamy zdarzenia z wnętrza w spokoju.
   */
  useEffect(() => {
    if (!podglad || mysz) return undefined;

    const pozaDymkiem = (e: Event) => {
      if (!kotwica.current?.contains(e.target as Node)) setPodglad(false);
    };
    const naEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPodglad(false);
    };

    document.addEventListener('pointerdown', pozaDymkiem);
    document.addEventListener('keydown', naEscape);
    return () => {
      document.removeEventListener('pointerdown', pozaDymkiem);
      document.removeEventListener('keydown', naEscape);
    };
  }, [podglad, mysz]);

  if (!target) {
    return (
      <span style={stylBraku} title={`Nie ma „${id}" w bazie wiedzy.`}>
        {label ?? id}
      </span>
    );
  }

  const haslo = target.kind === 'term' && target.code ? parseTermBlock(id, target.code) : undefined;
  const rysunek = target.kind === 'figure' ? target.code : undefined;
  const tablica = target.kind === 'table' ? target.code : undefined;
  const notka = target.kind === 'callout' ? target.code : undefined;
  const prawo = target.kind === 'law' ? target.code : undefined;
  const paragraf = target.kind === 'section';
  const blok =
    !haslo && !rysunek && !tablica && !paragraf && target.code
      ? parseFormulaBlock(id, target.code)
      : undefined;
  const maPodglad = Boolean(haslo || blok || rysunek || tablica || paragraf);

  // Podpis domyślny to nazwa wielkości albo hasła, nie identyfikator: w zdaniu
  // „zgodnie z T" czyta się to jak matematykę, a nie jak odnośnik do bazy.
  const tekst = label ?? haslo?.term ?? (blok?.target ? symbolName(blok.target) : id);

  // Pojęcie definiowane jest w podręczniku **kursywą**. Odsyłacz nie ma prawa
  // tego zmienić — znacznik dokłada tylko podkreślenie, a tekst zostaje taki,
  // jaki czytelnik widzi w druku.
  const stylCelu: CSSProperties = haslo
    ? { ...styl, fontStyle: 'italic', color: '#4338ca', borderBottomColor: '#c7d2fe' }
    : styl;

  const klik = () => {
    if (mysz) onNavigate?.(id);
    else setPodglad((v) => !v);
  };

  return (
    <span
      ref={kotwica}
      style={stylCelu}
      onMouseEnter={mysz ? pokaz : undefined}
      onMouseLeave={mysz ? odlozZamkniecie : undefined}
      onClick={klik}
      role={onNavigate ? 'link' : undefined}
      tabIndex={onNavigate ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onNavigate?.(id);
      }}
    >
      {tekst}
      {podglad &&
        maPodglad &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={dymekEl}
            role="dialog"
            style={{
              ...STYL_DYMKA,
              // Pierwsza klatka: dymek musi się wyrenderować, żeby dało się go
              // zmierzyć. Rysujemy go wtedy niewidocznie, zamiast mignąć w złym
              // miejscu i przeskoczyć.
              visibility: pozycja ? 'visible' : 'hidden',
              left: pozycja ? `${pozycja.left}px` : 0,
              top: pozycja ? `${pozycja.top}px` : 0,
              maxHeight: pozycja ? `${pozycja.maxHeight}px` : undefined,
            }}
            onMouseEnter={mysz ? anulujZamkniecie : undefined}
            onMouseLeave={mysz ? odlozZamkniecie : undefined}
          >
            {rysunek && <FigureBlock id={id} code={rysunek} compact />}
            {tablica && <TableBlock id={id} code={tablica} compact />}
            {notka && <CalloutBlock id={id} code={notka} compact />}
            {prawo && <LawBlock id={id} code={prawo} compact />}
            {paragraf && (
              <span style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
                {target.documentTitle ?? id}
              </span>
            )}
            {haslo ? (
              <>
                <span style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
                  {haslo.term}
                </span>
                <span style={{ fontSize: 12, lineHeight: 1.5, display: 'block', marginTop: 3 }}>
                  {haslo.definition}
                </span>
                {haslo.source && (
                  <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginTop: 4 }}>
                    {haslo.source}
                  </span>
                )}
              </>
            ) : blok ? (
              <>
                <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 2 }}>
                  {id}
                  {!target.sameDocument && target.documentTitle && ` · ${target.documentTitle}`}
                </span>
                {/*
                Równanie, które nie jest przypisaniem (`@relation`), nie ma
                lewej strony — składanie go jako „cel = wyrażenie" dawało samo
                „=". Takich wzorów w podręczniku jest pełno: równanie ruchu,
                warunki, tożsamości. Dla nich pokazujemy zapis autora w całości.
              */}
                <MathView
                  latex={
                    blok!.kind === 'relation' && blok!.latex
                      ? blok!.latex
                      : `${blok!.targetLatex ?? symbolToLatex(blok!.target ?? '')} = ${
                          blok!.chain?.join(' = ') ?? blok!.expression ?? ''
                        }`
                  }
                  block={false}
                />
              </>
            ) : null}

            {onNavigate && (
              <button
                type="button"
                style={przycisk}
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(id);
                }}
              >
                {paragraf
                  ? 'przejdź do paragrafu'
                  : `otwórz ${
                      haslo
                        ? 'hasło'
                        : rysunek
                          ? 'rysunek'
                          : tablica
                            ? 'tablicę'
                            : notka
                              ? 'notkę'
                              : prawo
                                ? 'prawo'
                                : 'wzór'
                    }`}
              </button>
            )}
          </span>,
          document.body
        )}
    </span>
  );
}

/**
 * Dymek.
 *
 * `maxWidth` przez `min(…, 100vw − 32px)`, bo sztywne 280 px wychodziło poza
 * krawędź telefonu. `whiteSpace: normal` zdejmuje `nowrap` odziedziczone po
 * odsyłaczu — inaczej definicja byłaby jedną długą linią.
 *
 * Wyeksportowane wyłącznie po to, żeby dało się to sprawdzić testem: jsdom nie
 * zna funkcji `min()` i **wyrzuca całą deklarację**, więc przez DOM ograniczenia
 * szerokości nie widać.
 */
export const STYL_DYMKA: CSSProperties = {
  // `fixed`, bo dymek żyje w portalu do `body` i pozycjonuje się względem okna.
  // W drzewie dokumentu każdy przodek z `overflow` przycinałby go, a każdy
  // z `transform` przestawiał układ odniesienia — patrz `referencePopover.test`.
  position: 'fixed',
  zIndex: 1400,
  background: '#fff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '8px 10px 4px',
  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
  whiteSpace: 'normal',
  width: 'max-content',
  maxWidth: 'min(280px, calc(100vw - 16px))',
  // Wysokość ustala pomiar (patrz `pozycja.maxHeight`); ta wartość jest tylko
  // zabezpieczeniem na pierwszą klatkę, przed zmierzeniem.
  maxHeight: 'min(60vh, 420px)',
  overflowY: 'auto',
  display: 'block',
  fontStyle: 'normal',
  color: '#1e293b',
};

const przycisk: CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 4,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  color: '#334155',
  cursor: 'pointer',
};
