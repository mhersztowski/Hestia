/**
 * inlineText — składanie tekstu w linii: wyróżnienia, kod, matematyka,
 * obrazki i odsyłacze `((…))`.
 *
 * Wyjęte z `ReaderView`, bo **podpis rysunku i tablicy musi składać się tak samo
 * jak akapit**. Dopóki podpis renderował się jako goły tekst, `$m$` zostawało
 * dolarami, a `**Rys. 15-3.**` gwiazdkami — czyli dokładnie tym, czego czytelnik
 * nie ma prawa zobaczyć.
 */
import type { ReactNode } from 'react';
import { ReferenceLink } from './ReferenceLink';
import { Math as MathView } from './Math';
import type { ReferenceKind } from '@hestia/core-sci';

export type ResolveRef = (id: string) => {
  code?: string;
  kind?: ReferenceKind;
  documentTitle?: string;
  sameDocument: boolean;
} | undefined;

/**
 * Czy `src` obrazka wolno wpuścić do dokumentu.
 *
 * Dokument bazy wiedzy bywa cudzy, a `src` to jedyne miejsce w tym rendererze,
 * gdzie treść trafia wprost do atrybutu DOM. Przepuszczamy trzy rzeczy:
 * ścieżkę względną (bez schematu), `http(s)` i `data:` z **rastrowym** obrazem.
 *
 * `data:image/svg+xml` jest świadomie odrzucane. W `<img>` przeglądarka i tak
 * nie uruchomi skryptu z SVG, ale rysunki z podręcznika są rastrowe, a nasze
 * własne diagramy będą prawdziwymi elementami `<svg>` — nie ma więc powodu,
 * żeby ta furtka w ogóle istniała.
 */
function bezpieczneZrodlo(src: string): boolean {
  const adres = src.trim();
  const schemat = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(adres);
  if (!schemat) return true;

  const nazwa = schemat[1].toLowerCase();
  if (nazwa === 'http' || nazwa === 'https') return true;
  return /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(adres);
}

export function inline(
  source: string,
  resolve?: (id: string) => { code?: string; kind?: ReferenceKind; documentTitle?: string; sameDocument: boolean } | undefined,
  onNavigate?: (id: string) => void,
): ReactNode[] {
  const out: ReactNode[] = [];
  // Obrazek idzie pierwszy, bo jego `![alt](src)` zawiera nawiasy kwadratowe —
  // wzorzec odsyłacza wgryzłby się w środek. Zaraz po nim odsyłacz `[[id]]`:
  // gdyby wpadł po formatowaniu, podpis z gwiazdkami rozbiłby go w połowie.
  // Matematyka w linii (`$x$`) stoi przed formatowaniem, bo wzór bywa pełen
  // gwiazdek i podkreśleń, których nie wolno wziąć za wyróżnienie. Wymagamy
  // znaku niebędącego spacją tuż za otwierającym dolarem — dzięki temu „5 $ za
  // sztukę" zostaje kwotą, a nie początkiem wzoru.
  // Znak poprzedzony ukośnikiem idzie **pierwszy**: podręcznik oznacza przypis
  // gwiazdką, a niezauważona `\*` otwierała kursywę, która połykała resztę
  // akapitu razem z odsyłaczami do słownika.
  //
  // Odsyłacz to `((id))`, a **nie** `[[id]]` — ten drugi zapis należy do edytora
  // Markdown i znaczy tam link do pliku w Drive.
  // Wzór w linii **wolno złamać na wiersze**, tak jak podpis odsyłacza —
  // dokumenty bazy są zawijane na 80 kolumn, więc dłuższe `$…$` i tak przez to
  // łamanie przechodzi. Pusty wiersz zostaje granicą: bez tego samotny dolar
  // („5 $ za sztukę") połykałby tekst aż do następnego dolara w dokumencie.
  const pattern = /(\\[\\*_`[\]$~])|(!\[[^\]]*\]\([^)\s]+\)|\$\$[^$]+\$\$|\$[^$\s](?:[^$\n]|\n(?!\s*\n))*\$|\(\([A-Za-z][A-Za-z0-9_-]*(?:\|[^)]+)?\)\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let key = 0;

  for (const match of source.matchAll(pattern)) {
    if (match.index! > last) out.push(source.slice(last, match.index));
    const token = match[0];
    last = match.index! + token.length;

    if (token.startsWith('\\') && token.length === 2) {
      out.push(token[1]);
      continue;
    }

    if (token.startsWith('![')) {
      const obrazek = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(token);
      // Źródło niebezpieczne zostaje **tekstem**, a nie znika: autor ma
      // zobaczyć, że jego zapis nie został przyjęty.
      if (!obrazek || !bezpieczneZrodlo(obrazek[2])) {
        out.push(token);
        continue;
      }
      out.push(
        <img
          key={key += 1}
          src={obrazek[2].trim()}
          alt={obrazek[1]}
          style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '10px auto' }}
        />,
      );
      continue;
    }

    if (token.startsWith('$')) {
      // `$$…$$` musi stać we wzorcu **przed** `$…$`, inaczej ten drugi wgryza
      // się w środek („$F = …$" z „$$F = …$$") i zostawia samotny dolar.
      const blokowy = token.startsWith('$$');
      // Złamanie wiersza w źródle jest zawijaniem pliku, nie treścią wzoru.
      const latex = (blokowy ? token.slice(2, -2) : token.slice(1, -1)).replace(/\s*\n\s*/g, ' ');
      out.push(<MathView key={key += 1} latex={latex} block={blokowy} />);
      continue;
    }

    if (token.startsWith('((')) {
      const [id, podpis] = token.slice(2, -2).split('|');
      // Podpis bywa złamany na wiersze w źródle — akapit składa się na nowo.
      const label = podpis?.replace(/\s+/g, ' ').trim();
      out.push(
        <ReferenceLink
          key={key += 1}
          id={id}
          label={label}
          target={resolve?.(id)}
          onNavigate={onNavigate}
        />,
      );
    } else if (token.startsWith('`')) {
      out.push(
        <code key={key += 1} style={{ background: '#f1f5f9', borderRadius: 3, padding: '1px 4px', fontSize: '0.9em' }}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      // Zawartość wyróżnienia idzie przez ten sam renderer: w podręczniku
      // symbol matematyczny wewnątrz frazy kursywnej jest sytuacją zwykłą
      // („*Jeżeli stała $b$ jest mała*"), a surowa treść zostawiała dolary.
      // Rekurencja kończy się od razu, bo wzorzec wyróżnienia nie dopuszcza
      // gwiazdek w środku.
      out.push(<strong key={key += 1}>{inline(token.slice(2, -2), resolve, onNavigate)}</strong>);
    } else {
      out.push(<em key={key += 1}>{inline(token.slice(1, -1), resolve, onNavigate)}</em>);
    }
  }

  if (last < source.length) out.push(source.slice(last));
  return out;
}
