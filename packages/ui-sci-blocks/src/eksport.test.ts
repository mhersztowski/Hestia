/**
 * Wyjmowanie wyników z dokumentu.
 *
 * Do tej pory z bazy nie dało się wyjąć niczego: ani obrazu wykresu do
 * sprawozdania, ani danych do sprawdzenia w Pythonie. To są dokładnie te dwa
 * scenariusze, po które ktoś sięga, budując taką bazę — a `grep` po
 * `csv|download|toBlob` w całym pakiecie zwracał jedno trafienie, i to
 * w wysyłce rysunku do rozpoznania.
 *
 * Ten plik trzyma **czystą część**: układanie CSV i nazwę pliku. Zapis na dysk
 * to kilka wywołań przeglądarki bez własnej logiki.
 */
import { describe, it, expect } from 'vitest';
import { seriesToCsv, framesToCsv, exportFileName } from './eksport';

describe('seriesToCsv', () => {
  const przebiegi = {
    x: [[0, 1], [0.5, 2], [1, 3]] as Array<[number, number]>,
    v: [[0, 0], [0.5, -1], [1, -2]] as Array<[number, number]>,
  };

  it('pierwsza kolumna to czas, dalej po jednej na wielkość', () => {
    const csv = seriesToCsv(przebiegi);
    const [naglowek, pierwszy] = csv.split('\n');

    expect(naglowek).toBe('t,x,v');
    expect(pierwszy).toBe('0,1,0');
  });

  it('ma tyle wierszy, ile próbek, plus nagłówek', () => {
    expect(seriesToCsv(przebiegi).split('\n')).toHaveLength(4);
  });

  it('używa kropki dziesiętnej i przecinka jako separatora', () => {
    // Arkusz kalkulacyjny w polskiej lokalizacji poradzi sobie z importem,
    // a Python i R czytają to bez ustawień. Odwrotny wybór wymagałby ustawień
    // od każdego odbiorcy.
    const csv = seriesToCsv({ x: [[0.25, 1.5]] as Array<[number, number]> });
    expect(csv.split('\n')[1]).toBe('0.25,1.5');
  });

  it('wielkości o różnej liczbie próbek wyrównuje po czasie', () => {
    // Wielkość liczona rzadziej (albo urwana zdarzeniem) nie może przesuwać
    // kolumn — brak wartości zostaje pusty.
    const csv = seriesToCsv({
      x: [[0, 1], [1, 2]] as Array<[number, number]>,
      y: [[0, 9]] as Array<[number, number]>,
    });
    expect(csv.split('\n')).toEqual(['t,x,y', '0,1,9', '1,2,']);
  });

  it('brak przebiegów daje sam nagłówek czasu', () => {
    expect(seriesToCsv({})).toBe('t');
  });

  it('nazwy kolumn zachowują kolejność podaną przez model', () => {
    const csv = seriesToCsv({ z: [[0, 1]] as Array<[number, number]>, a: [[0, 2]] as Array<[number, number]> });
    expect(csv.split('\n')[0]).toBe('t,z,a');
  });
});

describe('framesToCsv', () => {
  const klatka = { t: 1.5, data: new Float32Array([1, 2, 3, 4]) };

  it('zapisuje siatkę wierszami, z nagłówkiem współrzędnych', () => {
    const csv = framesToCsv([klatka], 2, 2);
    expect(csv.split('\n')[0]).toBe('t,ix,iy,wartosc');
    expect(csv.split('\n')[1]).toBe('1.5,0,0,1');
    expect(csv.split('\n')[4]).toBe('1.5,1,1,4');
  });

  it('kilka klatek idzie po kolei w jednym pliku', () => {
    const csv = framesToCsv([klatka, { t: 3, data: new Float32Array([5, 6, 7, 8]) }], 2, 2);
    expect(csv.split('\n')).toHaveLength(9);
    expect(csv.split('\n')[5]).toBe('3,0,0,5');
  });

  it('pusta lista klatek daje sam nagłówek', () => {
    expect(framesToCsv([], 2, 2)).toBe('t,ix,iy,wartosc');
  });
});

describe('exportFileName', () => {
  it('składa nazwę z identyfikatora bloku i rozszerzenia', () => {
    expect(exportFileName('okres-wahadla', 'csv')).toBe('okres-wahadla.csv');
  });

  it('zamienia polskie znaki', () => {
    expect(exportFileName('zażółć gęślą', 'png')).toBe('zazolc-gesla.png');
  });

  it('bez identyfikatora daje nazwę zastępczą', () => {
    expect(exportFileName(undefined, 'csv')).toBe('wynik.csv');
    expect(exportFileName('', 'svg')).toBe('wynik.svg');
  });

  it('przycina bardzo długi identyfikator', () => {
    const nazwa = exportFileName('a'.repeat(200), 'csv');
    expect(nazwa.length).toBeLessThanOrEqual(64);
  });
});
