/**
 * Testy próbkowania krzywej.
 *
 * Wykres funkcji nie psuje się wyjątkiem — psuje się cicho: prostą pionową
 * w miejscu asymptoty, zerem tam, gdzie funkcja nie istnieje, albo kanciastym
 * łukiem, bo próbek było za mało w zakręcie. Wszystkie trzy przypadki są tu
 * sprawdzone wprost.
 */

import { describe, it, expect } from 'vitest';
import { sampleFunction, type Segment } from './sample';

const OPCJE = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

/** Wszystkie punkty ze wszystkich odcinków — do sprawdzeń niezależnych od podziału. */
function punkty(segments: Segment[]): Array<[number, number]> {
  return segments.flatMap((s) => s.points);
}

describe('gęstość próbkowania', () => {
  it('prosta nie dostaje ani jednego punktu ponad siatkę wstępną', () => {
    // Odcinek prosty jest opisany dwoma punktami. Każde zagęszczenie to praca
    // wykonana po nic — a przy kilkunastu krzywych naraz to już widać.
    const s = sampleFunction((x) => 2 * x + 1, { ...OPCJE, initialSamples: 32 });
    expect(punkty(s)).toHaveLength(33);
  });

  it('funkcja szybko oscylująca dostaje wyraźnie więcej punktów', () => {
    /*
     * Dobór funkcji nie jest przypadkowy. `sin(x)` na zakresie −10…10 przy
     * 64 odcinkach **nie potrzebuje** zagęszczenia: jego odchylenie od cięciwy
     * w szczycie to 0,011 jednostki, czyli jedna trzecia piksela. Zagęszczanie
     * go byłoby marnotrawstwem, którego nikt by nie zobaczył. Dopiero pięć razy
     * gęstsze oscylacje wychodzą poza próg widoczności.
     */
    const gesty = punkty(sampleFunction((x) => Math.sin(5 * x), OPCJE)).length;
    const prosty = punkty(sampleFunction((x) => 2 * x + 1, OPCJE)).length;
    expect(gesty).toBeGreaterThan(prosty * 2);
  });

  it('krzywa jest gładka tam, gdzie widać ją w kadrze', () => {
    // Poza kadrem kanciastość nie ma znaczenia — te punkty i tak są przycięte
    // i nikt ich nie ogląda. Mierzymy więc tylko to, co widać.
    const p = punkty(sampleFunction((x) => x * x, OPCJE)).filter(([, y]) => Math.abs(y) <= 10);
    for (let i = 1; i < p.length; i += 1) {
      expect(Math.abs(p[i][1] - p[i - 1][1])).toBeLessThan(2);
    }
  });

  it('punkty idą rosnąco po x i mieszczą się w zakresie', () => {
    const p = punkty(sampleFunction(Math.sin, OPCJE));
    for (let i = 1; i < p.length; i += 1) expect(p[i][0]).toBeGreaterThan(p[i - 1][0]);
    expect(p[0][0]).toBeGreaterThanOrEqual(-10);
    expect(p[p.length - 1][0]).toBeLessThanOrEqual(10);
  });
});

describe('miejsca, w których funkcja nie istnieje', () => {
  it('NaN przerywa krzywą, a nie spada do zera', () => {
    // `sqrt(x)` dla ujemnych x nie ma wartości rzeczywistej. Narysowanie tam
    // zera dołożyłoby do wykresu poziomą półprostą, której w funkcji nie ma.
    const s = sampleFunction(Math.sqrt, OPCJE);
    expect(punkty(s).every(([, y]) => Number.isFinite(y))).toBe(true);
    expect(punkty(s).every(([x]) => x >= -0.5)).toBe(true);
  });

  it('funkcja nieokreślona na całym zakresie daje zero odcinków', () => {
    expect(sampleFunction(() => Number.NaN, OPCJE)).toEqual([]);
  });

  it('dziura w środku dzieli krzywą na dwa odcinki', () => {
    // Bez podziału obie połówki zostałyby połączone kreską przez dziurę.
    const zDziura = (x: number) => (Math.abs(x) < 2 ? Number.NaN : x);
    const s = sampleFunction(zDziura, OPCJE);
    expect(s.length).toBe(2);
    expect(s[0].points.every(([x]) => x < 0)).toBe(true);
    expect(s[1].points.every(([x]) => x > 0)).toBe(true);
  });
});

describe('asymptoty', () => {
  it('1/x nie zostaje połączone kreską przez zero', () => {
    /*
     * To jest ta pomyłka, którą widać na pierwszy rzut oka: bez wykrycia
     * nieciągłości gałąź spod zera zostaje połączona z gałęzią nad zerem
     * pionową kreską przez całą wysokość ekranu — wykres pokazuje wtedy
     * coś, czego w funkcji nie ma.
     */
    const s = sampleFunction((x) => 1 / x, OPCJE);
    expect(s.length).toBeGreaterThanOrEqual(2);

    for (const segment of s) {
      const znaki = new Set(segment.points.map(([, y]) => Math.sign(y)));
      // Jeden odcinek nie może przechodzić z minus nieskończoności do plus.
      expect(znaki.size).toBeLessThanOrEqual(1);
    }
  });

  it('tangens rozpada się na gałęzie', () => {
    // Na zakresie −10…10 tangens ma sześć asymptot, więc gałęzi jest siedem.
    const s = sampleFunction(Math.tan, OPCJE);
    expect(s.length).toBeGreaterThanOrEqual(6);
  });

  it('wartości daleko poza widokiem są przycięte, ale krzywa nadal wchodzi w kadr', () => {
    // Punkt o wartości 10^9 rozciągnąłby ścieżkę na tyle, że przeglądarka
    // rysuje ją milisekundami; przycięcie do okolicy widoku niczego nie zmienia
    // w tym, co widać.
    const s = sampleFunction((x) => 1 / x, OPCJE);
    const p = punkty(s);
    expect(p.every(([, y]) => Math.abs(y) < 1e4)).toBe(true);
    // Ale gałąź musi dochodzić do krawędzi kadru, inaczej urywa się w powietrzu.
    expect(p.some(([, y]) => Math.abs(y) > 9)).toBe(true);
  });

  it('skok skończony też dzieli krzywą', () => {
    // Funkcja schodkowa: bez podziału dostajemy ukośną kreskę między stopniami.
    const schodek = (x: number) => (x < 0 ? -5 : 5);
    const s = sampleFunction(schodek, OPCJE);
    expect(s.length).toBe(2);
  });
});

describe('przypadki graniczne', () => {
  it('funkcja stała daje jeden odcinek', () => {
    const s = sampleFunction(() => 3, OPCJE);
    expect(s).toHaveLength(1);
    expect(s[0].points.every(([, y]) => y === 3)).toBe(true);
  });

  it('zakres o zerowej szerokości nie zapętla programu', () => {
    expect(() => sampleFunction(Math.sin, { ...OPCJE, xMin: 5, xMax: 5 })).not.toThrow();
  });

  it('odwrócony zakres jest czytany jak zwykły', () => {
    const s = sampleFunction(Math.sin, { ...OPCJE, xMin: 10, xMax: -10 });
    expect(punkty(s).length).toBeGreaterThan(10);
  });

  it('liczba wywołań funkcji jest ograniczona', () => {
    /*
     * Próbkowanie adaptacyjne dzieli, dopóki krzywa nie jest gładka — a funkcja
     * gęsto oscylująca nie będzie gładka nigdy. Bez twardego limitu `sin(1/x)`
     * przy zerze zawiesiłby kartę.
     */
    let wywolania = 0;
    sampleFunction((x) => { wywolania += 1; return Math.sin(1 / x); }, OPCJE);
    expect(wywolania).toBeLessThan(20000);
  });
});
