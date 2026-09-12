/**
 * Słownik zagadnień — hasła definiowane przez książkę.
 *
 * W podręczniku termin wprowadzany jest **kursywą**: „ruch, który powtarza się
 * w regularnych odstępach czasu, nazywamy *ruchem okresowym*". Takich miejsc
 * jest w samym 15-1 piętnaście, w tomie rzędu ośmiuset.
 *
 * Dwie rzeczy przesądzają o kształcie:
 *
 *  • **Definicja jest cytatem z książki**, nie streszczeniem. Hasło ma
 *    powtarzać zdanie autora, bo alternatywą jest pisanie definicji fizyki
 *    przeze mnie.
 *  • **Słownik jest jeden na książkę**, nie na całą bazę. U Resnicka „ruch
 *    harmoniczny" obejmuje też ruch nieprosty; inny podręcznik używa tej nazwy
 *    jako synonimu ruchu prostego. Wspólny słownik musiałby godzić sprzeczne
 *    definicje. Identyfikator niesie przedrostek książki, więc pozostaje
 *    unikalny w całej bazie.
 */
import { describe, it, expect } from 'vitest';
import { parseTermBlock } from './glossary';
import { buildIndex } from './index';
import { resolveReference, danglingReferences } from './references';

const HASLO = [
  'Ruch okresowy (periodyczny)',
  '@definition Ruch, który powtarza się w regularnych odstępach czasu.',
  '@source 15-1, s. 344',
  '@aka periodyczny, ruch periodyczny',
].join('\n');

describe('parseTermBlock', () => {
  it('czyta nazwę hasła z pierwszego wiersza', () => {
    expect(parseTermBlock('rh1-poj-ruch-okresowy', HASLO).term).toBe('Ruch okresowy (periodyczny)');
  });

  it('czyta definicję i źródło', () => {
    const h = parseTermBlock('rh1-poj-ruch-okresowy', HASLO);
    expect(h.definition).toBe('Ruch, który powtarza się w regularnych odstępach czasu.');
    expect(h.source).toBe('15-1, s. 344');
  });

  it('czyta warianty nazwy', () => {
    // Książka podaje synonimy w nawiasie („wibracyjnym albo oscylacyjnym"),
    // a czytelnik szuka po tym, co widzi w tekście.
    expect(parseTermBlock('x', HASLO).aka).toEqual(['periodyczny', 'ruch periodyczny']);
  });

  it('definicja w kilku wierszach skleja się w jedną', () => {
    // Zdanie z książki bywa dłuższe niż wiersz pliku; łamanie wiersza nie może
    // urwać definicji w połowie.
    const blok = [
      'Przemieszczenie (wychylenie)',
      '@definition Odległość (liniowa albo kątowa) drgającego punktu',
      '  materialnego od położenia równowagi w dowolnej chwili.',
    ].join('\n');

    expect(parseTermBlock('t', blok).definition)
      .toBe('Odległość (liniowa albo kątowa) drgającego punktu materialnego od położenia równowagi w dowolnej chwili.');
  });

  it('hasło bez definicji zgłasza problem, a nie udaje gotowego', () => {
    const h = parseTermBlock('rh1-poj-puste', 'Jakiś termin');
    expect(h.issues).toHaveLength(1);
    expect(h.issues[0].message).toMatch(/definicj/i);
  });

  it('nieznana dyrektywa nie jest połykana', () => {
    // Zasada z reszty projektu: albo rozumiemy wiersz w całości, albo
    // zostawiamy go nietkniętym i mówimy o tym.
    const h = parseTermBlock('t', `${HASLO}\n@wymyslona coś`);
    expect(h.unknown).toContain('@wymyslona coś');
  });
});

describe('hasła w indeksie bazy', () => {
  it('odsyłacz ((…)) trafia w hasło tak samo jak we wzór', () => {
    const slownik = [
      '```term:rh1-poj-ruch-okresowy',
      'Ruch okresowy',
      '@definition Ruch, który powtarza się w regularnych odstępach czasu.',
      '```',
    ].join('\n');

    const indeks = buildIndex([
      { path: 'book/Slownik.md', markdown: `---\ntitle: Słownik\n---\n${slownik}` },
      { path: 'book/15-01.md', markdown: '---\ntitle: 15-1\n---\nnazywamy ((rh1-poj-ruch-okresowy)).' },
    ]);

    expect(indeks.issues).toEqual([]);
    const cel = resolveReference('rh1-poj-ruch-okresowy', indeks, 'book/15-01.md');
    expect(cel.found).toBe(true);
    expect(cel.path).toBe('book/Slownik.md');
    expect(cel.kind).toBe('term');
  });

  it('duplikat hasła między dokumentami jest błędem', () => {
    const h = '```term:rh1-poj-x\nX\n@definition Coś.\n```';
    const indeks = buildIndex([
      { path: 'a.md', markdown: h },
      { path: 'b.md', markdown: h },
    ]);
    expect(indeks.issues.some((i) => /dwóch dokumentach/.test(i.message))).toBe(true);
  });

  it('hasło i wzór nie mogą dzielić identyfikatora', () => {
    // Odsyłacz rozwiązuje się po samym identyfikatorze, więc kolizja między
    // rodzajami celów jest tak samo groźna jak kolizja w obrębie jednego.
    const indeks = buildIndex([
      { path: 'a.md', markdown: '```formula:rh1-15-eq1\nE = m\n```' },
      { path: 'b.md', markdown: '```term:rh1-15-eq1\nCoś\n@definition Coś.\n```' },
    ]);
    expect(indeks.issues.some((i) => /rh1-15-eq1/.test(i.message))).toBe(true);
  });

  it('odsyłacz w próżnię nadal jest zgłaszany', () => {
    const indeks = buildIndex([{ path: 'a.md', markdown: 'patrz ((rh1-poj-nieistniejace)).' }]);
    expect(danglingReferences('patrz ((rh1-poj-nieistniejace)).', indeks)).toEqual(['rh1-poj-nieistniejace']);
  });
});

describe('przykład w dokumentacji nie staje się danymi', () => {
  it('wcięte ogrodzenie jest kodem, nie hasłem', () => {
    // `PLAN.md` leży w tej samej bazie i pokazuje format bloku `term`.
    // Markdown traktuje wcięcie o cztery spacje jako blok kodu — indeks musi
    // robić tak samo, inaczej dokumentacja zakłada hasła i rezerwuje
    // identyfikatory, które potem kolidują z prawdziwymi.
    const dok = [
      'Format hasła:',
      '',
      '    ```term:rh1-poj-przyklad',
      '    Okres',
      '    @definition Coś tam.',
      '    ```',
      '',
    ].join('\n');

    const indeks = buildIndex([{ path: 'PLAN.md', markdown: dok }]);
    expect(indeks.documents[0].terms).toEqual([]);
    expect(indeks.termHome.size).toBe(0);
  });

  it('to samo dotyczy wzoru i zadania', () => {
    const dok = [
      '    ```formula:przyklad-wzoru',
      '    E = m c^2',
      '    ```',
      '',
      '    ```exercise:przyklad-zadania',
      '    Policz.',
      '    @answer E',
      '    ```',
    ].join('\n');

    const indeks = buildIndex([{ path: 'PLAN.md', markdown: dok }]);
    expect(indeks.documents[0].formulas).toEqual([]);
    expect(indeks.documents[0].exercises).toEqual([]);
  });

  it('zwykłe ogrodzenie od początku wiersza działa dalej', () => {
    const indeks = buildIndex([{
      path: 'a.md',
      markdown: '```term:rh1-poj-x\nX\n@definition Coś.\n```',
    }]);
    expect(indeks.termHome.size).toBe(1);
  });
});
