/**
 * glossary.ts — słownik zagadnień książki.
 *
 * Podręcznik wprowadza termin kursywą i definiuje go w biegnącym zdaniu:
 * „ruch, który powtarza się w regularnych odstępach czasu, nazywamy *ruchem
 * okresowym*". Hasło słownika **cytuje to zdanie**, a nie streszcza — inaczej
 * definicje fizyki pisałby ten, kto przenosi tekst, a nie autor.
 *
 * Słownik jest **jeden na książkę**. U Resnicka „ruch harmoniczny" obejmuje
 * także ruch nieprosty, a w innym podręczniku bywa synonimem ruchu prostego;
 * jeden słownik dla całej bazy musiałby te definicje pogodzić. Identyfikator
 * niesie przedrostek książki (`rh1-poj-…`), więc mimo to zostaje unikalny
 * w całej bazie i odsyłacz `[[…]]` pozostaje przenośny.
 */

export interface TermIssue {
  message: string;
  line?: number;
}

export interface TermBlock {
  id: string;
  /** Nazwa hasła — pierwszy wiersz bloku, tak jak brzmi w książce. */
  term: string;
  /** Definicja cytowana z książki. */
  definition?: string;
  /** Gdzie autor termin wprowadza — podrozdział i strona. */
  source?: string;
  /** Warianty nazwy, po których czytelnik może szukać. */
  aka: string[];
  issues: TermIssue[];
  unknown: string[];
}

export const TERM_FENCE = /```term:([A-Za-z0-9_-]+)\n([\s\S]*?)```/g;

/**
 * Czyta hasło słownika.
 *
 * Format celowo bliski blokowi `formula`: pierwszy wiersz to treść, reszta to
 * dyrektywy `@…`. Autor uczy się jednej konwencji, nie dwóch.
 */
export function parseTermBlock(id: string, code: string): TermBlock {
  const block: TermBlock = { id, term: '', aka: [], issues: [], unknown: [] };

  const linie = code.split('\n');
  // Kontynuacja definicji: zdanie z książki bywa dłuższe niż wiersz pliku,
  // a łamanie wiersza nie ma prawa urwać go w połowie.
  let ostatnia: 'definition' | undefined;

  linie.forEach((surowa) => {
    const linia = surowa.trim();
    if (!linia) return;

    if (!linia.startsWith('@')) {
      if (ostatnia === 'definition' && surowa.startsWith(' ')) {
        block.definition = `${block.definition} ${linia}`;
        return;
      }
      if (!block.term) block.term = linia;
      else block.unknown.push(linia);
      return;
    }

    ostatnia = undefined;
    const spacja = linia.indexOf(' ');
    const nazwa = (spacja < 0 ? linia : linia.slice(0, spacja)).slice(1);
    const reszta = spacja < 0 ? '' : linia.slice(spacja + 1).trim();

    switch (nazwa) {
      case 'definition':
        block.definition = reszta;
        ostatnia = 'definition';
        return;
      case 'source':
        block.source = reszta;
        return;
      case 'aka':
        block.aka.push(...reszta.split(',').map((s) => s.trim()).filter(Boolean));
        return;
      default:
        block.unknown.push(linia);
        return;
    }
  });

  if (!block.term) {
    block.issues.push({ message: 'Hasło bez nazwy — pierwszy wiersz bloku ma być nazwą terminu.' });
  }
  if (!block.definition) {
    block.issues.push({ message: `Hasło „${block.term || id}" nie ma definicji („@definition …").` });
  }

  return block;
}

/** Zapis hasła z powrotem do bloku — round-trip dla edytora. */
export function serializeTermBlock(block: TermBlock): string {
  const out = [block.term];
  if (block.definition) out.push(`@definition ${block.definition}`);
  if (block.source) out.push(`@source ${block.source}`);
  if (block.aka.length) out.push(`@aka ${block.aka.join(', ')}`);
  return out.join('\n');
}
