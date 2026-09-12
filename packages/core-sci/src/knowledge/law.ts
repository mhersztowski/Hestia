/**
 * law.ts — katalog praw i zasad fizycznych, **jeden na książkę**.
 *
 * Słownik odpowiada na pytanie „co znaczy to słowo", katalog praw na pytanie
 * „na czym stoi cały tom". To dwie różne listy: pojęć w skorowidzu jest 577,
 * a praw i zasad **32** — i to one wracają w kolejnych rozdziałach jako
 * narzędzie, a nie jako słownictwo.
 *
 * Katalog powstaje ze **skorowidza w całości**, a nie z przenoszonych po kolei
 * rozdziałów. Dzięki temu jest mapą od pierwszego dnia: czytelnik widzi, ile
 * praw tom zawiera i gdzie ich szukać, na długo przed tym, zanim będzie mógł je
 * przeczytać. Pozycja bez `@statement` **czeka na swój rozdział** — to nie jest
 * błąd i nie ma osobnego pola na ten stan, bo byłoby drugim źródłem tej samej
 * prawdy.
 *
 * `@formula` i `@term` wiążą prawo z **warstwą obliczeniową** dokumentu: prawo
 * Hooke'a wskazuje na `rh1-15-eq4`, czyli na ten sam blok, z którego liczy się
 * symulacja. Bez tego katalog byłby spisem tytułów.
 */

export interface LawIssue {
  message: string;
}

export interface LawBlock {
  id: string;
  /** Nazwa prawa — pierwszy wiersz, w brzmieniu ze skorowidza. */
  title: string;
  /** Treść prawa; cytat z książki, gdy rozdział jest już przeniesiony. */
  statement?: string;
  /** Wzory, w których prawo jest zapisane — identyfikatory bloków `formula`. */
  formulas: string[];
  /** Hasło słownika, jeżeli skorowidz zrobił z prawa także pojęcie. */
  term?: string;
  /** Numer rozdziału — po nim katalog się grupuje i porządkuje. */
  chapter?: number;
  /** Gdzie książka prawo formułuje: podrozdział, strona, wpis skorowidza. */
  source?: string;
  /** Warianty nazwy, po których czytelnik może szukać. */
  aka: string[];
  /** Czy pozycja czeka na przeniesienie swojego rozdziału. */
  awaiting: boolean;
  issues: LawIssue[];
  unknown: string[];
}

export const LAW_FENCE = /```law:([A-Za-z0-9_-]+)\n([\s\S]*?)```/g;

/** Czyta pozycję katalogu praw. Format jak w `term` i `callout`. */
export function parseLawBlock(id: string, code: string): LawBlock {
  const block: LawBlock = {
    id, title: '', formulas: [], aka: [], awaiting: true, issues: [], unknown: [],
  };

  // Treść prawa bywa dłuższa niż wiersz pliku — dokumenty są zawijane na 80
  // kolumn, a łamanie nie ma prawa urwać zdania w połowie.
  let ostatnia: 'statement' | undefined;

  for (const surowa of code.split('\n')) {
    const linia = surowa.trim();
    if (!linia) continue;

    if (!linia.startsWith('@')) {
      if (ostatnia === 'statement' && surowa.startsWith(' ')) {
        block.statement = `${block.statement} ${linia}`;
        continue;
      }
      if (!block.title) block.title = linia;
      else block.unknown.push(linia);
      continue;
    }

    ostatnia = undefined;
    const spacja = linia.indexOf(' ');
    const nazwa = (spacja < 0 ? linia : linia.slice(0, spacja)).slice(1);
    const reszta = spacja < 0 ? '' : linia.slice(spacja + 1).trim();

    switch (nazwa) {
      case 'statement':
        block.statement = reszta;
        ostatnia = 'statement';
        break;
      case 'formula':
        block.formulas.push(...reszta.split(',').map((s) => s.trim()).filter(Boolean));
        break;
      case 'term':
        block.term = reszta;
        break;
      case 'chapter': {
        const n = Number.parseInt(reszta, 10);
        if (Number.isInteger(n) && String(n) === reszta) block.chapter = n;
        else block.issues.push({ message: `@chapter musi być liczbą, a jest „${reszta}".` });
        break;
      }
      case 'source':
        block.source = reszta;
        break;
      case 'aka':
        block.aka.push(...reszta.split(',').map((s) => s.trim()).filter(Boolean));
        break;
      default:
        block.unknown.push(linia);
        break;
    }
  }

  block.awaiting = !block.statement;

  if (!block.title) block.issues.push({ message: 'Prawo musi mieć nazwę w pierwszym wierszu.' });
  if (block.chapter === undefined && !block.issues.some((i) => i.message.includes('@chapter'))) {
    block.issues.push({ message: 'Prawo musi wskazywać rozdział w @chapter.' });
  }
  if (!block.source) block.issues.push({ message: 'Prawo musi wskazywać miejsce w @source.' });

  return block;
}
