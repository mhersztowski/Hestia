/**
 * Szerokość rysunku w bloku `figure`.
 *
 * Rysunki z podręcznika mają bardzo różne proporcje: schemat układu jest szeroki
 * i niski, a wykres drgań wysoki i wąski. Pokazane wszystkie na pełnej szerokości
 * kolumny jedne toną w bieli, a inne zajmują cały ekran. Autor musi więc móc
 * powiedzieć, ile miejsca ma zająć **ten** rysunek — i musi to zostać w pliku,
 * a nie w ustawieniach przeglądarki.
 */
import { describe, it, expect } from 'vitest';
import { parseFigureBlock } from './blocks';
import { setFigureWidth } from './figureWidth';

const RYSUNEK = (extra: string[]) => [
  '![Rys. 15-1](data:image/png;base64,AAAA)',
  '@caption Wahadło matematyczne.',
  ...extra,
].join('\n');

describe('odczyt szerokości', () => {
  it('czyta wartość procentową', () => {
    const blok = parseFigureBlock('15-1', RYSUNEK(['@width 60%']));

    expect(blok.issues).toEqual([]);
    expect(blok.width).toBe('60%');
  });

  it('czyta wartość w pikselach', () => {
    expect(parseFigureBlock('15-1', RYSUNEK(['@width 420px'])).width).toBe('420px');
  });

  it('goła liczba znaczy piksele — tak zapisuje ją każdy, kto pisze ręcznie', () => {
    expect(parseFigureBlock('15-1', RYSUNEK(['@width 300'])).width).toBe('300px');
  });

  it('bez dyrektywy nie ma szerokości i rysunek zajmuje tyle, ile może', () => {
    expect(parseFigureBlock('15-1', RYSUNEK([])).width).toBeUndefined();
  });

  it('melduje zapis, którego nie rozumie, zamiast go połknąć', () => {
    const blok = parseFigureBlock('15-1', RYSUNEK(['@width połowa']));

    expect(blok.width).toBeUndefined();
    expect(blok.issues.map((i) => i.message).join(' ')).toMatch(/szerokość/i);
  });

  it('nie przyjmuje wartości bez sensu', () => {
    expect(parseFigureBlock('15-1', RYSUNEK(['@width -20%'])).issues.length).toBeGreaterThan(0);
    expect(parseFigureBlock('15-1', RYSUNEK(['@width 0'])).issues.length).toBeGreaterThan(0);
  });
});

describe('zapis szerokości do bloku', () => {
  it('dopisuje dyrektywę, gdy jej nie było', () => {
    const wynik = setFigureWidth(RYSUNEK([]), '50%');

    expect(parseFigureBlock('15-1', wynik).width).toBe('50%');
    // Reszta bloku zostaje nietknięta — autor ma tam swój podpis i obraz.
    expect(wynik).toContain('@caption Wahadło matematyczne.');
    expect(wynik).toContain('![Rys. 15-1]');
  });

  it('podmienia istniejącą wartość, a nie dokłada drugiej', () => {
    const wynik = setFigureWidth(RYSUNEK(['@width 80%']), '35%');

    expect(parseFigureBlock('15-1', wynik).width).toBe('35%');
    expect(wynik.match(/@width/g)).toHaveLength(1);
  });

  it('usuwa dyrektywę, gdy szerokość wraca do domyślnej', () => {
    const wynik = setFigureWidth(RYSUNEK(['@width 80%']), undefined);

    expect(parseFigureBlock('15-1', wynik).width).toBeUndefined();
    expect(wynik).not.toContain('@width');
    expect(wynik).toContain('@caption');
  });

  /**
   * Podpis bywa dłuższy niż wiersz i jest wtedy łamany z wcięciem — parser
   * dokleja takie wiersze do ostatniej dyrektywy. Gdyby `@width` wylądowało
   * między nimi, druga połowa podpisu stałaby się kontynuacją szerokości.
   */
  it('nie wchodzi w środek łamanego podpisu', () => {
    const zŁamaniem = [
      '![Rys.](data:image/png;base64,AAAA)',
      '@caption Bardzo długi podpis, który nie mieści się',
      '  w jednym wierszu i jest łamany z wcięciem.',
    ].join('\n');

    const blok = parseFigureBlock('r', setFigureWidth(zŁamaniem, '40%'));
    expect(blok.width).toBe('40%');
    expect(blok.caption).toBe('Bardzo długi podpis, który nie mieści się w jednym wierszu i jest łamany z wcięciem.');
  });

  it('normalizuje gołą liczbę przy zapisie', () => {
    expect(setFigureWidth(RYSUNEK([]), '300')).toContain('@width 300px');
  });
});
