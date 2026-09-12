/**
 * Odsyłacze wewnątrz dokumentu i między dokumentami.
 *
 * Największa pojedyncza kategoria w podręczniku: 3191 wystąpień, więcej niż
 * wzorów i rysunków razem. Bez nich tekst „zgodnie z równaniem (15-9)" jest
 * martwą literą — czytelnik musi szukać ręcznie.
 *
 * Wymóg, który przesądza o projekcie: **odsyłacz wskazuje identyfikator, nigdy
 * ścieżkę**. Przeniesienie katalogu z książką ma być przebudową indeksu, a nie
 * edycją tysięcy odsyłaczy.
 */
import { describe, it, expect } from 'vitest';
import { parseReferences, resolveReference, splitByReferences } from './references';
import { buildIndex } from './index';

const INDEKS = {
  formulaHome: new Map([
    ['rh1-15-okres-oscylatora', 'book/15-drgania.md'],
    ['okres', 'mechanika/wahadlo.md'],
  ]),
  documentTitles: new Map([
    ['book/15-drgania.md', 'Drgania'],
    ['mechanika/wahadlo.md', 'Wahadło matematyczne'],
  ]),
};

describe('parseReferences', () => {
  it('znajduje odsyłacz w zdaniu', () => {
    const tekst = 'Zgodnie z ((rh1-15-okres-oscylatora)) okres nie zależy od amplitudy.';
    const [ref] = parseReferences(tekst);

    expect(ref.id).toBe('rh1-15-okres-oscylatora');
    expect(ref.label).toBeUndefined();
    // Położenie liczone z tekstu, nie wpisane ręcznie — inaczej test sprawdza
    // moją arytmetykę, a nie parser.
    expect(tekst.slice(ref.start, ref.end)).toBe('((rh1-15-okres-oscylatora))');
  });

  it('czyta własny podpis po pionowej kresce', () => {
    // Bez tego zdanie musiałoby brzmieć „zgodnie z rh1-15-okres-oscylatora",
    // czyli identyfikatorem zamiast po polsku.
    const [ref] = parseReferences('patrz ((rh1-15-okres-oscylatora|wzór na okres))');
    expect(ref.id).toBe('rh1-15-okres-oscylatora');
    expect(ref.label).toBe('wzór na okres');
  });

  it('znajduje kilka odsyłaczy w jednym akapicie', () => {
    expect(parseReferences('((a)) i ((b)) oraz ((c))')).toHaveLength(3);
  });

  it('nie myli się z podwójnym nawiasem w wyrażeniu', () => {
    // `[[1, 2], [3, 4]]` to macierz w bloku algebry, nie odsyłacz.
    expect(parseReferences('macierz [[1, 2], [3, 4]] jest jednostkowa')).toEqual([]);
  });

  it('tekst bez odsyłaczy daje pustą listę', () => {
    expect(parseReferences('Zwykły akapit bez niczego.')).toEqual([]);
  });
});

describe('resolveReference', () => {
  it('znajduje dokument, w którym mieszka wzór', () => {
    const wynik = resolveReference('rh1-15-okres-oscylatora', INDEKS, 'book/15-drgania.md');

    expect(wynik.found).toBe(true);
    expect(wynik.path).toBe('book/15-drgania.md');
    // Odsyłacz w obrębie dokumentu nie jest „wyjściem" — czytelnik zostaje.
    expect(wynik.sameDocument).toBe(true);
  });

  it('odsyłacz do innego dokumentu niesie jego tytuł', () => {
    const wynik = resolveReference('okres', INDEKS, 'book/15-drgania.md');

    expect(wynik.sameDocument).toBe(false);
    expect(wynik.documentTitle).toBe('Wahadło matematyczne');
  });

  it('odsyłacz w próżnię jest zgłaszany, nie ukrywany', () => {
    // Literówka w identyfikatorze dałaby link donikąd. Milczenie znaczyłoby, że
    // czytelnik klika i nic się nie dzieje.
    const wynik = resolveReference('literowka', INDEKS, 'book/15-drgania.md');
    expect(wynik.found).toBe(false);
  });

  it('nie zależy od ścieżki dokumentu źródłowego', () => {
    // Sedno przenośności: ten sam odsyłacz rozwiązuje się tak samo niezależnie
    // od tego, gdzie leży dokument, który go zawiera.
    const zJednego = resolveReference('okres', INDEKS, 'book/15-drgania.md');
    const zInnego = resolveReference('okres', INDEKS, 'zupelnie/inny/katalog/plik.md');

    expect(zJednego.path).toBe(zInnego.path);
  });
});

describe('splitByReferences', () => {
  it('rozbija tekst na fragmenty i odsyłacze', () => {
    const czesci = splitByReferences('Patrz ((a|wzór)) oraz koniec.');

    expect(czesci).toEqual([
      { kind: 'text', text: 'Patrz ' },
      { kind: 'ref', id: 'a', label: 'wzór' },
      { kind: 'text', text: ' oraz koniec.' },
    ]);
  });

  it('zachowuje cały tekst, gdy nie ma odsyłaczy', () => {
    expect(splitByReferences('nic tu nie ma')).toEqual([{ kind: 'text', text: 'nic tu nie ma' }]);
  });

  it('radzi sobie z odsyłaczem na początku i końcu', () => {
    expect(splitByReferences('((a)) środek ((b))')).toHaveLength(3);
  });
});

describe('odsyłacz do zadania', () => {
  it('trafia w blok exercise, a nie w próżnię', () => {
    /*
     * Podręcznik odsyła do zadań wprost („patrz zadanie 21, rozdział 2").
     * Zanim zadania trafiły do indeksu, taki odsyłacz wyglądał na poprawny
     * w tekście i milczał w aplikacji — indeks czytał bloki `exercise`
     * wyłącznie po to, by wiedzieć, czego zadanie używa.
     */
    const index = buildIndex([
      { path: 'zadania.md', markdown: '```exercise:zad-1\nTreść zadania.\n```' },
      { path: 'tekst.md', markdown: 'Patrz ((zad-1|zadanie 1)).' },
    ]);

    const cel = resolveReference('zad-1', index, 'tekst.md');
    expect(cel.found).toBe(true);
    expect(cel.kind).toBe('exercise');
    expect(cel.path).toBe('zadania.md');
  });

  it('zadanie o identyfikatorze zajętym przez wzór jest zgłaszane', () => {
    // Odsyłacz zna tylko identyfikator, więc kolizja między rodzajami jest
    // tak samo groźna jak w obrębie jednego rodzaju.
    const index = buildIndex([
      { path: 'a.md', markdown: '```formula:kolizja\n@relation\nx = 1\n```' },
      { path: 'b.md', markdown: '```exercise:kolizja\nTreść.\n```' },
    ]);
    expect(index.issues.some((i) => i.formulaId === 'kolizja')).toBe(true);
  });
});
