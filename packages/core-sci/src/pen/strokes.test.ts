/**
 * Warunek początkowy rysowany piórem.
 *
 * Raport (Etap 4) chce rysika jako sposobu zadawania warunków początkowych.
 * Decyzja, która o wszystkim przesądza: pióro **nie zostawia bitmapy**, tylko
 * listę pociągnięć, która kompiluje się do zwykłego wyrażenia. Dzięki temu
 * dokument dalej trzyma matematykę, rysunek da się dopisać ręcznie, a autor
 * widzi, że rysowanie i pisanie wzoru to ta sama rzecz.
 *
 * Testy pilnują tego, co przy takim zapisie zawodzi: round-tripu przez tekst
 * i tego, żeby narysowane pole naprawdę było tam, gdzie je narysowano.
 */
import { describe, it, expect } from 'vitest';
import { compileStrokes, parseStrokes, serializeStrokes, type Stroke } from './strokes';
import { compileExpression } from '../formula/expression';

const KROPKA: Stroke[] = [{ x: 0.3, y: 0.4, radius: 0.1, amplitude: 1 }];

/** Wartość skompilowanego warunku w punkcie. */
function w(strokes: Stroke[], x: number, y: number): number {
  return compileExpression(compileStrokes(strokes), ['x', 'y']).evaluate({ x, y });
}

describe('serializacja pociągnięć', () => {
  it('przechodzi round-trip przez tekst dyrektywy', () => {
    // Dokument jest źródłem prawdy, więc zapis musi wracać bez strat —
    // inaczej samo otwarcie pliku przesuwałoby to, co autor narysował.
    const strokes: Stroke[] = [
      { x: 0.25, y: 0.5, radius: 0.08, amplitude: 1 },
      { x: 0.75, y: 0.5, radius: 0.12, amplitude: -0.6 },
    ];
    expect(parseStrokes(serializeStrokes(strokes))).toEqual(strokes);
  });

  it('zapis mieści się w jednej linii i da się przeczytać', () => {
    const tekst = serializeStrokes(KROPKA);
    expect(tekst).not.toContain('\n');
    expect(tekst).toMatch(/0\.3/);
  });

  it('uszkodzony zapis daje pustą listę, nie wyjątek', () => {
    // Ręczna edycja pliku jest normalna; literówka nie może wywalić dokumentu.
    expect(parseStrokes('to nie są liczby')).toEqual([]);
    expect(parseStrokes('')).toEqual([]);
  });

  it('pomija pociągnięcia niepełne zamiast zgadywać brakujące liczby', () => {
    expect(parseStrokes('0.3,0.4,0.1,1 0.5,0.5')).toEqual(KROPKA);
  });
});

describe('kompilacja do wyrażenia', () => {
  it('daje wyrażenie zależne tylko od x i y', () => {
    const skompilowane = compileExpression(compileStrokes(KROPKA), ['x', 'y']);
    expect(skompilowane.issues).toEqual([]);
    expect(skompilowane.freeSymbols.sort()).toEqual(['x', 'y']);
  });

  it('maksimum wypada tam, gdzie postawiono pióro', () => {
    expect(w(KROPKA, 0.3, 0.4)).toBeCloseTo(1, 3);
    expect(w(KROPKA, 0.3, 0.4)).toBeGreaterThan(w(KROPKA, 0.5, 0.4));
    expect(w(KROPKA, 0.3, 0.4)).toBeGreaterThan(w(KROPKA, 0.3, 0.9));
  });

  it('poza promieniem pociągnięcia wartość gaśnie', () => {
    // Bez tego jedno pociągnięcie podnosiłoby całe pole i „narysowana plamka"
    // przestałaby być plamką.
    expect(Math.abs(w(KROPKA, 0.3 + 0.4, 0.4))).toBeLessThan(0.02);
  });

  it('szerokie pociągnięcie sięga dalej niż wąskie', () => {
    const waskie: Stroke[] = [{ x: 0.5, y: 0.5, radius: 0.05, amplitude: 1 }];
    const szerokie: Stroke[] = [{ x: 0.5, y: 0.5, radius: 0.2, amplitude: 1 }];

    expect(w(szerokie, 0.65, 0.5)).toBeGreaterThan(w(waskie, 0.65, 0.5));
  });

  it('pociągnięcia się sumują, a ujemne odejmuje', () => {
    // Ujemna amplituda to „gumka na odwrót": pióro odwrócone rysuje dołek.
    // Bez sumowania druga kropka nadpisywałaby pierwszą.
    const dwie: Stroke[] = [
      { x: 0.3, y: 0.5, radius: 0.1, amplitude: 1 },
      { x: 0.7, y: 0.5, radius: 0.1, amplitude: -1 },
    ];
    expect(w(dwie, 0.3, 0.5)).toBeCloseTo(1, 2);
    expect(w(dwie, 0.7, 0.5)).toBeCloseTo(-1, 2);
    expect(w(dwie, 0.5, 0.5)).toBeCloseTo(0, 2);
  });

  it('brak pociągnięć znaczy pole puste, a nie zepsute', () => {
    const puste = compileExpression(compileStrokes([]), ['x', 'y']);
    expect(puste.issues).toEqual([]);
    expect(puste.evaluate({ x: 0.5, y: 0.5 })).toBe(0);
  });

  it('długi rysunek nie rozdyma wyrażenia bez granic', () => {
    // Każde pociągnięcie to jeden składnik wyrażenia liczony w każdym punkcie
    // siatki. Setka pociągnięć przy 96×96 to milion wywołań na krok — dlatego
    // rysunek jest przycinany, a nie liczony w nieskończoność.
    const duzo: Stroke[] = Array.from({ length: 500 }, (_, i) => ({
      x: i / 500, y: 0.5, radius: 0.02, amplitude: 1,
    }));
    // Liczymy `\exp`, a nie plusy: każdy składnik ma własny plus w środku,
    // między kwadratami odległości.
    const skladniki = compileStrokes(duzo).match(/\\exp/g)?.length ?? 0;
    expect(skladniki).toBeLessThanOrEqual(100);
    expect(skladniki).toBeGreaterThan(0);
  });
});
