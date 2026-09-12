/**
 * Konflikty scalania. Plik ze znacznikiem zwykle się kompiluje — znacznik ląduje
 * w komentarzu albo w napisie — i trafia do repozytorium, a wychodzi na jaw
 * tygodnie później. Dlatego czytanie i sprawdzanie musi być pewne.
 */
import { describe, it, expect } from 'vitest';
import { parseConflicts, resolveConflict, resolveAll, hasConflictMarkers } from './conflicts';

const zKonfliktem = [
  'const a = 1;',
  '<<<<<<< HEAD',
  'const b = 2;',
  '=======',
  'const b = 3;',
  '>>>>>>> gałąź-obok',
  'const c = 4;',
].join('\n');

const zBaza = [
  '<<<<<<< HEAD',
  'moje',
  '||||||| wspólny przodek',
  'wyjściowe',
  '=======',
  'ich',
  '>>>>>>> inna',
].join('\n');

describe('czytanie konfliktu', () => {
  it('znajduje granice, etykiety i obie wersje', () => {
    const [k] = parseConflicts(zKonfliktem);
    expect(k.startLine).toBe(2);
    expect(k.endLine).toBe(6);
    expect(k.oursLabel).toBe('HEAD');
    expect(k.theirsLabel).toBe('gałąź-obok');
    expect(k.ours).toEqual(['const b = 2;']);
    expect(k.theirs).toEqual(['const b = 3;']);
  });

  it('wersja wyjściowa przy stylu diff3', () => {
    const [k] = parseConflicts(zBaza);
    expect(k.base).toEqual(['wyjściowe']);
    expect(k.ours).toEqual(['moje']);
    expect(k.theirs).toEqual(['ich']);
  });

  it('bez diff3 nie ma pola wersji wyjściowej', () => {
    // Puste pole i brak pola to co innego: pierwsze obiecuje wybór, którego nie ma.
    expect(parseConflicts(zKonfliktem)[0].base).toBeUndefined();
  });

  it('kilka konfliktów w jednym pliku', () => {
    const tresc = `${zKonfliktem}\n${zKonfliktem}`;
    expect(parseConflicts(tresc)).toHaveLength(2);
  });

  it('plik bez konfliktów', () => {
    expect(parseConflicts('zwykły\nkod')).toEqual([]);
  });

  // Taki plik ktoś już ruszał ręcznie; potraktowanie reszty jako jednej strony
  // skasowałoby jego pracę przy pierwszym „weź moje".
  it('niedomknięty konflikt jest pomijany, a nie zgadywany', () => {
    expect(parseConflicts('<<<<<<< HEAD\nmoje\n=======\nich\n(brak zamknięcia)')).toEqual([]);
  });

  it('przy zagnieżdżeniu bierze konflikt kompletny, a resztę zostawia kontroli', () => {
    // Zewnętrzne otwarcie jest niedomknięte, wewnętrzne — pełne. Rozwiązanie
    // wewnętrznego jest sensowne, a to, że zewnętrzny znacznik zostaje, wyłapie
    // `hasConflictMarkers` przed zapisem: nic nie trafi do repozytorium po cichu.
    const dziwny = '<<<<<<< HEAD\na\n<<<<<<< inne\nb\n=======\nc\n>>>>>>> x';
    const znalezione = parseConflicts(dziwny);
    expect(znalezione).toHaveLength(1);
    expect(znalezione[0].startLine).toBe(3);
    expect(hasConflictMarkers(resolveConflict(dziwny, znalezione[0], 'ours'))).toBe(true);
  });
});

describe('rozwiązywanie', () => {
  const [k] = parseConflicts(zKonfliktem);

  it('moja wersja', () => {
    expect(resolveConflict(zKonfliktem, k, 'ours')).toBe('const a = 1;\nconst b = 2;\nconst c = 4;');
  });

  it('ich wersja', () => {
    expect(resolveConflict(zKonfliktem, k, 'theirs')).toBe('const a = 1;\nconst b = 3;\nconst c = 4;');
  });

  // Najczęściej trafne przy dopisanych obok siebie importach albo pozycjach
  // listy — obie strony mają wtedy rację.
  it('obie wersje po kolei', () => {
    expect(resolveConflict(zKonfliktem, k, 'both'))
      .toBe('const a = 1;\nconst b = 2;\nconst b = 3;\nconst c = 4;');
  });

  it('wersja wyjściowa, gdy jest dostępna', () => {
    const [zb] = parseConflicts(zBaza);
    expect(resolveConflict(zBaza, zb, 'base')).toBe('wyjściowe');
  });

  it('po rozwiązaniu nie zostaje ani jeden znacznik', () => {
    for (const wybor of ['ours', 'theirs', 'both'] as const) {
      expect(hasConflictMarkers(resolveConflict(zKonfliktem, k, wybor)), wybor).toBe(false);
    }
  });
});

describe('rozwiązanie wszystkich naraz', () => {
  it('działa dla kilku konfliktów i nie gubi tekstu między nimi', () => {
    const tresc = ['start', zKonfliktem, 'środek', zKonfliktem, 'koniec'].join('\n');
    const wynik = resolveAll(tresc, 'ours');
    expect(hasConflictMarkers(wynik)).toBe(false);
    expect(wynik).toContain('środek');
    expect(wynik).toContain('start');
    expect(wynik).toContain('koniec');
    expect(wynik.match(/const b = 2;/g)).toHaveLength(2);
  });

  // Podmiana od początku przesunęłaby numery wierszy kolejnych konfliktów.
  it('kolejność podmiany nie psuje numerów wierszy', () => {
    const tresc = [zKonfliktem, zKonfliktem, zKonfliktem].join('\n');
    expect(hasConflictMarkers(resolveAll(tresc, 'theirs'))).toBe(false);
  });
});

describe('wykrywanie pozostałości', () => {
  it('każdy rodzaj znacznika jest wykrywany', () => {
    expect(hasConflictMarkers('<<<<<<< HEAD')).toBe(true);
    expect(hasConflictMarkers('=======')).toBe(true);
    expect(hasConflictMarkers('>>>>>>> gałąź')).toBe(true);
    expect(hasConflictMarkers('||||||| baza')).toBe(true);
  });

  it('podobny tekst w kodzie nie jest znacznikiem', () => {
    // Znacznik to dokładnie siedem znaków na początku wiersza.
    expect(hasConflictMarkers('const x = a >>> b;')).toBe(false);
    expect(hasConflictMarkers('// ====== sekcja ======')).toBe(false);
    expect(hasConflictMarkers('<<<<<< sześć')).toBe(false);
  });
});
