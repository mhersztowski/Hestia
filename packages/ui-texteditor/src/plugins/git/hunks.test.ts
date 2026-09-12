/**
 * Fragmenty i łatki. Testy są tu gęste, bo błąd kosztuje najwięcej ze wszystkich
 * w tym pluginie: `git apply` przyjmuje łatkę z błędnymi liczbami tylko wtedy,
 * gdy przypadkiem pasuje — a wtedy po cichu psuje plik. Odrzucenie jest łagodne,
 * ciche przyjęcie nie.
 */
import { describe, it, expect } from 'vitest';
import { diffLines, toHunks, formatPatch, reverseHunk, describeHunk } from './hunks';

const tekst = (...w: string[]) => w.join('\n');

describe('różnica wiersz po wierszu', () => {
  it('identyczne treści nie mają zmian', () => {
    expect(diffLines(tekst('a', 'b'), tekst('a', 'b')).every((l) => l.op === ' ')).toBe(true);
  });

  it('dodanie wiersza', () => {
    const d = diffLines(tekst('a', 'c'), tekst('a', 'b', 'c'));
    expect(d.map((l) => l.op + l.text)).toEqual([' a', '+b', ' c']);
  });

  it('usunięcie wiersza', () => {
    const d = diffLines(tekst('a', 'b', 'c'), tekst('a', 'c'));
    expect(d.map((l) => l.op + l.text)).toEqual([' a', '-b', ' c']);
  });

  // Zmiana wiersza ma się czytać jako jedna poprawka, a nie dwie osobne.
  it('zmiana wiersza daje parę − i + obok siebie', () => {
    const d = diffLines(tekst('a', 'stare', 'c'), tekst('a', 'nowe', 'c'));
    expect(d.map((l) => l.op)).toEqual([' ', '-', '+', ' ']);
  });

  it('pusty plik po jednej stronie', () => {
    expect(diffLines('', tekst('a', 'b')).map((l) => l.op)).toEqual(['+', '+']);
    expect(diffLines(tekst('a'), '').map((l) => l.op)).toEqual(['-']);
  });

  // Lepsza szczera zgrubna odpowiedź niż zawieszona karta.
  it('bardzo duże pliki dostają różnicę zgrubną, ale w skończonym czasie', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n');
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n');
    const start = Date.now();
    const d = diffLines(a, b, 100);
    expect(d.length).toBe(6000);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('podział na fragmenty', () => {
  it('jedna zmiana to jeden fragment z kontekstem', () => {
    const przed = tekst('1', '2', '3', '4', '5', '6', '7', '8', '9');
    const po = tekst('1', '2', '3', 'ZMIENIONE', '5', '6', '7', '8', '9');
    const hunki = toHunks(diffLines(przed, po), 2);
    expect(hunki).toHaveLength(1);
    expect(hunki[0].lines.filter((l) => l.op === ' ')).toHaveLength(4);   // po 2 z każdej strony
  });

  it('odległe zmiany dają osobne fragmenty', () => {
    const przed = Array.from({ length: 40 }, (_, i) => String(i)).join('\n');
    const po = przed.replace('\n5\n', '\nPIĄTY\n').replace('\n35\n', '\nTRZYDZIESTY\n');
    expect(toHunks(diffLines(przed, po), 3)).toHaveLength(2);
  });

  // Wspólny wiersz kontekstu należałby do dwóch łatek; przygotowanie pierwszej
  // przesunęłoby wiersze drugiej i git odrzuciłby ją jako niepasującą.
  it('bliskie zmiany scalają się w jeden fragment', () => {
    const przed = tekst('1', '2', '3', '4', '5', '6');
    const po = tekst('1', 'X', '3', '4', 'Y', '6');
    expect(toHunks(diffLines(przed, po), 3)).toHaveLength(1);
  });

  it('brak zmian to brak fragmentów', () => {
    expect(toHunks(diffLines(tekst('a'), tekst('a')))).toEqual([]);
  });

  it('fragment zna swoje miejsce w bieżącej treści', () => {
    // Po tym edytor wie, gdzie postawić przycisk „przygotuj ten fragment".
    const przed = tekst('1', '2', '3', '4', '5');
    const po = tekst('1', '2', 'NOWY', '3', '4', '5');
    const [h] = toHunks(diffLines(przed, po), 1);
    expect(h.newRange.from).toBeLessThanOrEqual(3);
    expect(h.newRange.to).toBeGreaterThanOrEqual(3);
  });
});

describe('łatka dla gita', () => {
  /** Sprawdza nagłówek fragmentu: liczby muszą zgadzać się z treścią. */
  const naglowki = (patch: string) => patch.split('\n').filter((w) => w.startsWith('@@'));

  it('ma nagłówek pliku z przedrostkami a/ i b/', () => {
    const patch = formatPatch('src/a.ts', toHunks(diffLines(tekst('a'), tekst('b'))));
    expect(patch).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(patch).toContain('--- a/src/a.ts');
    expect(patch).toContain('+++ b/src/a.ts');
  });

  // To jest ta liczba, przy której `git apply` odmawia — i słusznie, bo
  // przyjęcie niezgodnej łatki cicho psuje plik.
  it('liczby w nagłówku zgadzają się z liczbą wierszy', () => {
    const przed = tekst('1', '2', '3', '4', '5');
    const po = tekst('1', '2', 'ZMIENIONE', '4', '5');
    const hunki = toHunks(diffLines(przed, po), 2);
    const patch = formatPatch('a.ts', hunki);
    const [naglowek] = naglowki(patch);
    const [, staryZakres, nowyZakres] = /@@ -(\d+,\d+) \+(\d+,\d+) @@/.exec(naglowek)!;

    const wierszeLatki = patch.split('\n').filter((w) => /^[ +-]/.test(w) && !w.startsWith('---') && !w.startsWith('+++'));
    const stare = wierszeLatki.filter((w) => w[0] !== '+').length;
    const nowe = wierszeLatki.filter((w) => w[0] !== '-').length;
    expect(staryZakres.split(',')[1]).toBe(String(stare));
    expect(nowyZakres.split(',')[1]).toBe(String(nowe));
  });

  it('każdy fragment ma własny nagłówek', () => {
    const przed = Array.from({ length: 40 }, (_, i) => String(i)).join('\n');
    const po = przed.replace('\n5\n', '\nA\n').replace('\n35\n', '\nB\n');
    expect(naglowki(formatPatch('a.ts', toHunks(diffLines(przed, po))))).toHaveLength(2);
  });

  it('pusta lista fragmentów daje pustą łatkę, nie nagłówek bez treści', () => {
    expect(formatPatch('a.ts', [])).toBe('');
  });

  it('brak znaku końca linii dostaje adnotację', () => {
    // Bez niej git dopisze go po cichu i plik zmieni się bardziej, niż chciano.
    const patch = formatPatch('a.ts', toHunks(diffLines('a', 'b')), {
      oldEndsWithNewline: false, newEndsWithNewline: false, totalOldLines: 1, totalNewLines: 1,
    });
    expect(patch).toContain('\\ No newline at end of file');
  });

  // To jest ta pomyłka, przez którą git odrzucał każdą łatkę na prawdziwym
  // pliku: prawie każdy kończy się nową linią, a teksty w testach zwykle nie.
  it('końcowy znak nowej linii nie dokłada pustego wiersza', () => {
    const patch = formatPatch('a.ts', toHunks(diffLines('1\n2\n3\n', '1\nX\n3\n'), 3), {
      oldEndsWithNewline: true, newEndsWithNewline: true, totalOldLines: 3, totalNewLines: 3,
    });
    expect(patch).toContain('@@ -1,3 +1,3 @@');
    expect(patch).not.toContain('No newline');
  });

  it('plik kończący się nową linią ma tyle wierszy, ile widać', () => {
    expect(diffLines('a\nb\n', 'a\nb\n').length).toBe(2);
    expect(diffLines('a\nb', 'a\nb').length).toBe(2);
  });

  it('łatka kończy się znakiem nowej linii', () => {
    // `git apply` odrzuca łatkę urwaną na ostatnim wierszu.
    expect(formatPatch('a.ts', toHunks(diffLines(tekst('a'), tekst('b'))))).toMatch(/\n$/);
  });
});

describe('odwrócenie fragmentu', () => {
  it('zamienia dodania z usunięciami i zakresy miejscami', () => {
    const [h] = toHunks(diffLines(tekst('a', 'b'), tekst('a', 'c')), 1);
    const odwrocony = reverseHunk(h);
    expect(odwrocony.oldStart).toBe(h.newStart);
    expect(odwrocony.newStart).toBe(h.oldStart);
    expect(odwrocony.lines.map((l) => l.op)).toEqual(h.lines.map((l) => (l.op === '+' ? '-' : l.op === '-' ? '+' : ' ')));
  });

  it('podwójne odwrócenie wraca do punktu wyjścia', () => {
    const [h] = toHunks(diffLines(tekst('a', 'b', 'c'), tekst('a', 'X', 'c')), 1);
    expect(reverseHunk(reverseHunk(h))).toEqual(h);
  });
});

describe('opis fragmentu', () => {
  it('mówi, ile dodano i usunięto', () => {
    const [h] = toHunks(diffLines(tekst('a', 'b'), tekst('a', 'X', 'Y')), 0);
    expect(describeHunk(h)).toMatch(/\+2/);
    expect(describeHunk(h)).toMatch(/−1/);
  });
});
