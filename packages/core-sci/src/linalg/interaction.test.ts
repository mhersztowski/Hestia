/**
 * Przeciąganie wektorów na scenie.
 *
 * Raport (§3.6c) chce parametrów wektorowych sterowanych **uchwytem końca
 * strzałki** zamiast suwaka. Sedno dydaktyczne: „przeciągnij v i obserwuj Av;
 * znajdź kierunek, w którym Av leży na v" zamienia definicję wektora własnego
 * w coś, co się odkrywa palcem, a nie zapamiętuje.
 *
 * Logika trafiania i miary równoległości mieszka w rdzeniu, bo nie ma w niej
 * nic z przeglądarki — a bez testu łatwo o wersję, która działa dla wektorów
 * długich i chybia przy krótkich.
 */
import { describe, it, expect } from 'vitest';
import { alignment, pickVector, snapToEigen } from './interaction';
import type { Matrix2, Vector2 } from './matrix';

const WEKTORY: Array<{ name: string; value: Vector2 }> = [
  { name: 'v', value: [2, 0] },
  { name: 'u', value: [0, 3] },
];

describe('pickVector', () => {
  it('trafia w koniec strzałki', () => {
    expect(pickVector([2, 0], WEKTORY, 0.4)).toBe('v');
    expect(pickVector([0, 3], WEKTORY, 0.4)).toBe('u');
  });

  it('nie trafia daleko od żadnego końca', () => {
    expect(pickVector([5, 5], WEKTORY, 0.4)).toBeUndefined();
  });

  it('przy dwóch blisko siebie wybiera bliższy', () => {
    const blisko: Array<{ name: string; value: Vector2 }> = [
      { name: 'a', value: [1, 0] },
      { name: 'b', value: [1.3, 0] },
    ];
    expect(pickVector([1.1, 0], blisko, 0.5)).toBe('a');
    expect(pickVector([1.25, 0], blisko, 0.5)).toBe('b');
  });

  it('krótki wektor da się złapać tak samo jak długi', () => {
    // Promień trafienia jest w jednostkach sceny, nie w ułamku długości —
    // inaczej wektor bliski zeru byłby nie do złapania właśnie wtedy, gdy
    // trzeba go wyciągnąć z powrotem.
    const krotki: Array<{ name: string; value: Vector2 }> = [{ name: 'v', value: [0.05, 0] }];
    expect(pickVector([0.05, 0.1], krotki, 0.4)).toBe('v');
  });
});

describe('alignment — jak blisko kierunku własnego', () => {
  const SKALOWANIE: Matrix2 = [[3, 0], [0, 2]];

  it('daje jedynkę, gdy obraz leży na wektorze', () => {
    expect(alignment(SKALOWANIE, [1, 0])).toBeCloseTo(1, 10);
    expect(alignment(SKALOWANIE, [0, 1])).toBeCloseTo(1, 10);
  });

  it('mniej niż jedynkę dla kierunku, który skręca', () => {
    expect(alignment(SKALOWANIE, [1, 1])).toBeLessThan(0.999);
  });

  it('rośnie w miarę zbliżania się do kierunku własnego', () => {
    const daleko = alignment(SKALOWANIE, [1, 1]);
    const blizej = alignment(SKALOWANIE, [1, 0.3]);
    expect(blizej).toBeGreaterThan(daleko);
  });

  it('ujemna wartość własna to wciąż kierunek własny', () => {
    // Obraz skierowany przeciwnie leży na tej samej prostej — kierunek jest
    // własny, choć zwrot się odwraca. Miara musi to uznać, bo inaczej
    // odbicie „nie miałoby" wektorów własnych, a ma dwa.
    const odbicie: Matrix2 = [[1, 0], [0, -1]];
    expect(alignment(odbicie, [0, 1])).toBeCloseTo(1, 10);
  });

  it('wektor zerowy nie ma kierunku, więc nie ma zgodności', () => {
    expect(alignment(SKALOWANIE, [0, 0])).toBe(0);
  });
});

describe('snapToEigen', () => {
  const SKALOWANIE: Matrix2 = [[3, 0], [0, 2]];

  it('przyciąga do kierunku własnego, gdy jesteśmy blisko', () => {
    const przyciagniety = snapToEigen(SKALOWANIE, [1, 0.05], 0.15);
    expect(przyciagniety).not.toBeNull();
    expect(przyciagniety![1]).toBeCloseTo(0, 8);
    // Długość zostaje — przyciągamy kierunek, nie skalę.
    expect(Math.hypot(...przyciagniety!)).toBeCloseTo(Math.hypot(1, 0.05), 8);
  });

  it('nie przyciąga z daleka', () => {
    expect(snapToEigen(SKALOWANIE, [1, 1], 0.15)).toBeNull();
  });

  it('nie przyciąga, gdy macierz nie ma kierunków własnych', () => {
    const obrot: Matrix2 = [[0, -1], [1, 0]];
    expect(snapToEigen(obrot, [1, 0.01], 0.5)).toBeNull();
  });
});
