import { describe, it, expect } from 'vitest';
import { parseLawBlock } from './law';

const blok = (t: string) => parseLawBlock('rh1-prawo-probne', t);

describe('pozycja katalogu praw', () => {
  it('czyta treść, wzory, hasło i miejsce w książce', () => {
    const p = blok([
      "Prawo Hooke'a",
      '@statement Siła jest proporcjonalna do przemieszczenia i skierowana przeciwnie.',
      '@formula rh1-15-eq4',
      '@term rh1-poj-prawo-hookea',
      '@chapter 15',
      "@source 15-2, s. 349 (skorowidz: „prawo — Hooke'a 148, 349, 350, 489\")",
      '@aka prawem Hooke\'a, prawa Hooke\'a',
    ].join('\n'));

    expect(p.title).toBe("Prawo Hooke'a");
    expect(p.statement).toMatch(/^Siła jest proporcjonalna/);
    expect(p.formulas).toEqual(['rh1-15-eq4']);
    expect(p.term).toBe('rh1-poj-prawo-hookea');
    expect(p.chapter).toBe(15);
    expect(p.aka).toEqual(["prawem Hooke'a", "prawa Hooke'a"]);
    expect(p.issues).toEqual([]);
  });

  /**
   * Katalog powstaje ze skorowidza **w całości**, a rozdziały przenosimy po
   * kolei — więc większość pozycji długo nie ma treści. Brak `@statement` znaczy
   * „czeka na swój rozdział" i nie jest błędem; osobne pole `@status` byłoby
   * drugim źródłem tej samej prawdy i rozjechałoby się przy pierwszej poprawce.
   */
  it('brak treści znaczy „czeka", a nie „zepsute"', () => {
    const p = blok(['Prawo Pascala', '@chapter 17', '@source 17-3, s. 432'].join('\n'));
    expect(p.statement).toBeUndefined();
    expect(p.awaiting).toBe(true);
    expect(p.issues).toEqual([]);
  });

  it('pozycja z treścią nie czeka', () => {
    const p = blok(['Prawo X', '@statement Coś tam.', '@chapter 5', '@source 5-1, s. 90'].join('\n'));
    expect(p.awaiting).toBe(false);
  });

  it('kilka wzorów pod jednym prawem', () => {
    const p = blok([
      'Zasady dynamiki Newtona', '@formula rh1-5-eq1, rh1-5-eq2', '@formula rh1-5-eq3',
      '@chapter 5', '@source 5-2, s. 91',
    ].join('\n'));
    expect(p.formulas).toEqual(['rh1-5-eq1', 'rh1-5-eq2', 'rh1-5-eq3']);
  });

  it('treść łamana na wiersze skleja się z powrotem', () => {
    const p = blok([
      'Prawo', '@statement Pierwsza część,', '  druga część.', '@chapter 1', '@source 1-1, s. 13',
    ].join('\n'));
    expect(p.statement).toBe('Pierwsza część, druga część.');
  });

  it('brak tytułu, rozdziału albo miejsca jest zgłaszany', () => {
    expect(blok('@chapter 5\n@source 5-1, s. 90').issues.map((i) => i.message).join(' '))
      .toMatch(/nazwę/i);
    expect(blok('Prawo\n@source 5-1, s. 90').issues.map((i) => i.message).join(' '))
      .toMatch(/@chapter/);
    expect(blok('Prawo\n@chapter 5').issues.map((i) => i.message).join(' '))
      .toMatch(/@source/);
  });

  it('rozdział musi być liczbą — inaczej katalog nie da się ułożyć', () => {
    const p = blok('Prawo\n@chapter piętnasty\n@source 15-2, s. 349');
    expect(p.chapter).toBeUndefined();
    expect(p.issues.map((i) => i.message).join(' ')).toMatch(/@chapter/);
  });

  it('nierozpoznana dyrektywa nie ginie po cichu', () => {
    const p = blok('Prawo\n@chapter 5\n@source 5-1, s. 90\n@odkrywca Newton');
    expect(p.unknown).toContain('@odkrywca Newton');
  });
});
