/**
 * Markdown.tsx — jedyny render markdownu w bazie wiedzy.
 *
 * Wydzielony z czytnika, bo używa go też blok zadania: treść zadania z
 * podręcznika jest markdownem z matematyką (`$\mathbf{a}$`, `$$…$$`), a nie
 * zwykłym tekstem. Drugi renderer obok tego byłby drugim miejscem, w którym
 * matematyka wygląda inaczej — i pierwszym, o którym się zapomni przy poprawce.
 *
 * Świadomie bez biblioteki i bez `dangerouslySetInnerHTML` — dokument bazy
 * wiedzy bywa cudzy, a wstrzykiwanie HTML-a z treści to jedyne miejsce, gdzie
 * ten komponent mógłby zrobić krzywdę.
 */
import { inline } from './inlineText';
import type { ReferenceKind } from '@hestia/core-sci';

/** Nagłówki, akapity, listy numerowane i punktowane, cytaty, kod w linii, matematyka. */
export function Markdown({ source, resolve, onNavigate }: {
  source: string;
  resolve?: (id: string) => { code?: string; kind?: ReferenceKind; documentTitle?: string; sameDocument: boolean } | undefined;
  onNavigate?: (id: string) => void;
}) {
  const blocks = source.split(/\n{2,}/).filter((block) => block.trim());

  return (
    <>
      {blocks.map((block, index) => {
        const heading = /^(#{1,4})\s+(.*)$/.exec(block.trim());
        if (heading) {
          const level = heading[1].length;
          const sizes = [26, 20, 16, 14];
          return (
            <div
              key={index}
              style={{
                fontSize: sizes[level - 1], fontWeight: 600, color: '#0f172a',
                marginTop: level <= 2 ? 10 : 4, lineHeight: 1.25,
              }}
            >
              {inline(heading[2], resolve, onNavigate)}
            </div>
          );
        }

        // Lista numerowana: pytania i zadania w podręczniku są ponumerowane, a
        // bez tego zlewają się w jeden akapit i gubią odrębność pozycji.
        if (/^\s*\d+\.\s+/m.test(block)) {
          const items = rozdzielPozycje(block, /^\s*\d+\.\s+/);
          // Numer pozycji jest treścią: podręcznik odsyła „patrz zadanie 31",
          // a numeracja biegnie ciągiem przez cały rozdział — także przez
          // akapity wtrącone w środek listy i nagłówki grup. Bez `start` każda
          // przerwa zaczynałaby liczenie od nowa i numery przestałyby się
          // zgadzać z drukiem.
          const pierwszy = Number(/^\s*(\d+)\./.exec(block)?.[1] ?? 1);
          return (
            <ol
              key={index}
              start={pierwszy}
              style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {items.map((item, i) => <li key={i}>{inline(item, resolve, onNavigate)}</li>)}
            </ol>
          );
        }

        // Cytat blokowy: podpisy rysunków w podręczniku stoją właśnie tak, więc
        // bez tego każdy z 488 podpisów zaczynałby się od widocznego „>".
        if (/^\s*>\s?/.test(block)) {
          const tresc = block.split('\n')
            .map((linia) => linia.replace(/^\s*>\s?/, ''))
            .join(' ')
            .trim();
          return (
            <blockquote
              key={index}
              style={{
                margin: 0,
                paddingLeft: 12,
                borderLeft: '3px solid #cbd5e1',
                color: '#475569',
                fontSize: 14,
              }}
            >
              {inline(tresc, resolve, onNavigate)}
            </blockquote>
          );
        }

        if (/^\s*[-*]\s+/m.test(block)) {
          // Tak samo jak lista numerowana: pozycja bywa złamana na wiersze, bo
          // dokumenty bazy są zawijane na 80 kolumn. Filtrowanie linii gubiło
          // kontynuacje po cichu — lista wyglądała na kompletną.
          const items = rozdzielPozycje(block, /^\s*[-*]\s+/);
          return (
            <ul key={index} style={{ margin: 0, paddingLeft: 22 }}>
              {items.map((item, i) => <li key={i}>{inline(item, resolve, onNavigate)}</li>)}
            </ul>
          );
        }

        return <p key={index} style={{ margin: 0 }}>{inline(block, resolve, onNavigate)}</p>;
      })}
    </>
  );
}


/**
 * Dzieli blok na pozycje listy.
 *
 * Pozycja bywa łamana na kilka wierszy, więc nie wystarczy filtrować linii —
 * trzeba doklejać kontynuacje do ostatniej rozpoczętej pozycji.
 */
function rozdzielPozycje(block: string, znacznik: RegExp): string[] {
  const pozycje: string[] = [];
  for (const linia of block.split('\n')) {
    if (znacznik.test(linia)) pozycje.push(linia.replace(znacznik, ''));
    else if (pozycje.length && linia.trim()) pozycje[pozycje.length - 1] += ` ${linia.trim()}`;
  }
  return pozycje;
}

