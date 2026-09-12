/**
 * Blok algebry liniowej jako część dokumentu.
 *
 * Ta sama zasada co przy fizyce: **dokument jest warstwą obliczeniową**.
 * Macierz stoi w dokumencie, wektor stoi w dokumencie, a `w = A \cdot v` liczy
 * się z nich — zmiana macierzy w tekście zmienia scenę, bez kodu widoku.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { compileLinAlg } from './compileLinAlg';

const PRZEKSZTALCENIE = [
  '@linalg',
  '@mat A = [[2, 1], [0, 1]]',
  '@vec v = [1, 0.5]',
  'w = A \\cdot v',
].join('\n');

const model = (source: string) => compileLinAlg(parseFormulaBlock('scena', source));

describe('deklaracje', () => {
  it('czyta macierz i wektor jako parametry', () => {
    const m = model(PRZEKSZTALCENIE);
    expect(m.issues).toEqual([]);
    expect(m.matrices.map((x) => x.name)).toEqual(['A']);
    expect(m.vectors.map((x) => x.name)).toEqual(['v']);
    expect(m.matrices[0].value).toEqual([[2, 1], [0, 1]]);
    expect(m.vectors[0].value).toEqual([1, 0.5]);
  });

  it('zgłasza macierz o złym kształcie zamiast ją domykać', () => {
    // Domknięcie brakującej liczby zerem dałoby inne przekształcenie niż to,
    // które autor napisał — i nic by tego nie zdradziło poza obrazem.
    const m = model('@linalg\n@mat A = [[1, 2], [3]]');
    expect(m.issues.join(' ')).toMatch(/A/);
    expect(m.issues.join(' ')).toMatch(/2×2|kształ/i);
  });

  it('zgłasza nieznany symbol w wyrażeniu', () => {
    const m = model('@linalg\n@mat A = [[1, 0], [0, 1]]\nw = A \\cdot q');
    expect(m.issues.join(' ')).toMatch(/q/);
  });
});

describe('obliczenia', () => {
  it('mnoży macierz przez wektor', () => {
    const wynik = model(PRZEKSZTALCENIE).run({});
    expect(wynik.vectors.w).toEqual([2.5, 0.5]);
  });

  it('liczy z wartościami podmienionymi z zewnątrz', () => {
    // Przeciąganie wektora na scenie podmienia `v` — model musi liczyć z tego,
    // co dostał, a nie z tego, co stoi w dokumencie.
    const wynik = model(PRZEKSZTALCENIE).run({ vectors: { v: [0, 1] } });
    expect(wynik.vectors.w).toEqual([1, 1]);
  });

  it('składa macierze w zadanej kolejności', () => {
    const m = model([
      '@linalg',
      '@mat A = [[0, -1], [1, 0]]',
      '@mat B = [[2, 0], [0, 1]]',
      'C = A \\cdot B',
      'u = C \\cdot [1, 0]',
    ].join('\n'));

    expect(m.issues).toEqual([]);
    const wynik = m.run({});
    // Najpierw B (rozciąga x dwukrotnie), potem A (obrót o 90°).
    expect(wynik.vectors.u[0]).toBeCloseTo(0, 10);
    expect(wynik.vectors.u[1]).toBeCloseTo(2, 10);
  });

  it('odwrotność cofa przekształcenie', () => {
    const m = model([
      '@linalg',
      '@mat A = [[2, 1], [0, 1]]',
      '@vec v = [1, 1]',
      'w = A \\cdot v',
      'z = A^{-1} \\cdot w',
    ].join('\n'));

    const wynik = m.run({});
    expect(wynik.vectors.z[0]).toBeCloseTo(1, 10);
    expect(wynik.vectors.z[1]).toBeCloseTo(1, 10);
  });

  it('macierz osobliwa nie udaje, że da się ją odwrócić', () => {
    const m = model('@linalg\n@mat P = [[1, 0], [0, 0]]\nQ = P^{-1}');
    expect(m.run({}).issues.join(' ')).toMatch(/odwróci|osobliw/i);
  });

  it('wyznacznik i ślad są zwykłymi liczbami', () => {
    const m = model('@linalg\n@mat A = [[3, 0], [0, 2]]\nd = \\det(A)');
    expect(m.run({}).scalars.d).toBeCloseTo(6, 10);
  });

  it('skalar mnoży wektor', () => {
    const m = model('@linalg\n@vec v = [1, 2]\nu = 3 \\cdot v');
    expect(m.run({}).vectors.u).toEqual([3, 6]);
  });

  it('wektory się dodają', () => {
    const m = model('@linalg\n@vec a = [1, 0]\n@vec b = [0, 2]\ns = a + b');
    expect(m.run({}).vectors.s).toEqual([1, 2]);
  });
});

describe('scena wynika z typów, nie z nazw', () => {
  it('podaje macierz przekształcenia do animacji', () => {
    // Scena „siatka + kwadrat jednostkowy" potrzebuje wiedzieć, **która**
    // macierz jest przekształceniem. Gdy jest jedna, nie ma wątpliwości.
    expect(model(PRZEKSZTALCENIE).transform).toBe('A');
  });

  it('przy złożeniu pokazuje wynik, nie pierwszy składnik', () => {
    // Blok liczący `C = R \cdot D` jest o złożeniu — animowanie samego R
    // pokazywałoby co innego niż to, o czym mówi tekst, a wyznacznik na
    // ekranie nie zgadzałby się z iloczynem wyznaczników składników.
    const m = model([
      '@linalg',
      '@mat R = [[0, -1], [1, 0]]',
      '@mat D = [[2, 0], [0, 1]]',
      'C = R \\cdot D',
    ].join('\n'));

    expect(m.transform).toBe('C');
  });

  it('wektory do narysowania to wszystkie wektory bloku', () => {
    const m = model(PRZEKSZTALCENIE);
    expect(m.drawnVectors.sort()).toEqual(['v', 'w']);
  });

  it('blok bez macierzy nadal rysuje wektory', () => {
    const m = model('@linalg\n@vec a = [1, 0]\n@vec b = [0, 2]\ns = a + b');
    expect(m.issues).toEqual([]);
    expect(m.transform).toBeUndefined();
    expect(m.drawnVectors.sort()).toEqual(['a', 'b', 's']);
  });
});

describe('animacja przekształcenia', () => {
  it('podmiana macierzy działa też dla złożenia', () => {
    // Scena animuje `C`, więc podmienia jego wartość na zinterpolowaną. Gdyby
    // definicja `C = R \cdot D` miała pierwszeństwo, suwak animacji nie
    // ruszałby niczym — obraz stałby na wyniku końcowym.
    const m = compileLinAlg(parseFormulaBlock('scena', [
      '@linalg',
      '@mat R = [[0, -1], [1, 0]]',
      '@mat D = [[2, 0], [0, 1]]',
      'C = R \\cdot D',
      '@vec v = [1, 0]',
      'w = C \\cdot v',
    ].join('\n')));

    // Identyczność w miejsce C: wynik musi pokrywać się z wejściem.
    const wPolowie = m.run({ matrices: { C: [[1, 0], [0, 1]] } });
    expect(wPolowie.vectors.w).toEqual([1, 0]);

    // Bez podmiany — pełne przekształcenie.
    expect(m.run({}).vectors.w[0]).toBeCloseTo(0, 10);
    expect(m.run({}).vectors.w[1]).toBeCloseTo(2, 10);
  });
});

describe('blok trójwymiarowy', () => {
  const PRZESTRZEN = [
    '@linalg',
    '@mat3 R = [[0, -1, 0], [1, 0, 0], [0, 0, 1]]',
    '@vec3 v = [1, 0, 0]',
  ].join('\n');

  it('rozpoznaje wymiar z użytych dyrektyw', () => {
    // Wymiar wynika z zapisu macierzy, a nie z osobnej deklaracji — autor
    // pisze go raz i nie ma jak się pomylić.
    const blok = parseFormulaBlock('scena', PRZESTRZEN);
    expect(blok.linalg?.dim3).toBe(true);
    expect(blok.linalg?.matrices[0].name).toBe('R');
    expect(blok.linalg?.vectors[0].name).toBe('v');
  });

  it('blok dwuwymiarowy nie udaje trójwymiarowego', () => {
    expect(parseFormulaBlock('scena', PRZEKSZTALCENIE).linalg?.dim3).toBeFalsy();
  });
});
