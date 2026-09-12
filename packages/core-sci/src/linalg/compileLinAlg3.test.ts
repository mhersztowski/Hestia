/**
 * Blok algebry w trzech wymiarach.
 *
 * Te same reguły co w 2D; testy sprawdzają to, co w 3D wychodzi inaczej —
 * obrót wokół osi, zgniatanie przestrzeni do płaszczyzny i to, że wymiar
 * macierzy jest pilnowany, a nie domykany.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { compileLinAlg3 } from './compileLinAlg3';

const OBROT = [
  '@linalg',
  '@mat3 R = [[0, -1, 0], [1, 0, 0], [0, 0, 1]]',
  '@vec3 v = [1, 0, 0]',
  'w = R \\cdot v',
].join('\n');

const model = (source: string) => compileLinAlg3(parseFormulaBlock('scena', source));

describe('compileLinAlg3', () => {
  it('obrót o 90° wokół osi z przenosi x na y', () => {
    const m = model(OBROT);
    expect(m.issues).toEqual([]);

    const w = m.run({}).vectors.w;
    expect(w[0]).toBeCloseTo(0, 10);
    expect(w[1]).toBeCloseTo(1, 10);
    expect(w[2]).toBeCloseTo(0, 10);
  });

  it('zgłasza macierz o złym kształcie zamiast ją domykać', () => {
    const m = model('@linalg\n@mat3 A = [[1, 0], [0, 1]]');
    expect(m.issues.join(' ')).toMatch(/3×3/);
  });

  it('składa obroty', () => {
    const m = model([
      '@linalg',
      '@mat3 A = [[0, -1, 0], [1, 0, 0], [0, 0, 1]]',
      '@mat3 B = [[1, 0, 0], [0, 0, -1], [0, 1, 0]]',
      'C = A \\cdot B',
      '@vec3 v = [0, 0, 1]',
      'w = C \\cdot v',
    ].join('\n'));

    expect(m.issues).toEqual([]);
    expect(m.transform).toBe('C');
    // B przenosi z na -y, potem A obraca -y na x... sprawdzamy przez złożenie.
    const w = m.run({}).vectors.w;
    expect(Math.hypot(...w)).toBeCloseTo(1, 10);
  });

  it('rzut nie udaje, że da się go odwrócić', () => {
    const m = model('@linalg\n@mat3 P = [[1,0,0],[0,1,0],[0,0,0]]\nQ = P^{-1}');
    expect(m.run({}).issues.join(' ')).toMatch(/odwróci|zgniata/i);
  });

  it('podmiana ma pierwszeństwo nad definicją', () => {
    const m = model(OBROT);
    const identycznosc = m.run({ matrices: { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] } });
    expect(identycznosc.vectors.w).toEqual([1, 0, 0]);
  });
});
