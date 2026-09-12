/**
 * Geometria mapy bitów.
 *
 * Sedno: pole przekraczające koniec wiersza musi zostać pocięte na kawałki, a
 * każdy kawałek wiedzieć, czy jest pierwszy (dostaje etykietę) i czy pole
 * ciągnie się dalej.
 */
import { describe, it, expect } from 'vitest';
import { parsePacketDiagram } from '../formats/mermaid/packetDiagram';
import { layoutPacket } from './packetLayout';

const ulóż = (text: string) => layoutPacket(parsePacketDiagram(text).document.packet!);

describe('pola w jednym wierszu', () => {
  const l = ulóż('packet-beta\n0-15: "A"\n16-31: "B"');

  it('każde pole daje jeden kawałek', () => {
    expect(l.segments).toHaveLength(2);
  });

  it('leżą w tym samym wierszu', () => {
    expect(l.segments[0].row).toBe(0);
    expect(l.segments[1].row).toBe(0);
  });

  it('drugie zaczyna się tam, gdzie kończy pierwsze', () => {
    expect(l.segments[1].x).toBe(l.segments[0].x + l.segments[0].width);
  });

  it('szerokość odpowiada liczbie bitów', () => {
    expect(l.segments[0].width).toBe(l.segments[1].width);
  });
});

describe('pole przekraczające wiersz', () => {
  // 24-63 to 40 bitów: koniec pierwszego wiersza i cały drugi.
  const l = ulóż('packet-beta\n0-23: "Naglowek"\n24-63: "Dane"');
  const dane = l.segments.filter((s) => s.label === 'Dane');

  it('jest cięte na kawałki', () => {
    expect(dane).toHaveLength(2);
  });

  it('kawałki leżą w kolejnych wierszach', () => {
    expect(dane[0].row).toBe(0);
    expect(dane[1].row).toBe(1);
  });

  it('pierwszy kawałek kończy wiersz', () => {
    expect(dane[0].toBit).toBe(31);
    expect(dane[0].continues).toBe(true);
  });

  it('drugi zaczyna się na początku wiersza', () => {
    expect(dane[1].x).toBe(0);
    expect(dane[1].fromBit).toBe(32);
  });

  it('tylko pierwszy kawałek dostaje etykietę', () => {
    expect(dane[0].first).toBe(true);
    expect(dane[1].first).toBe(false);
  });

  it('ostatni kawałek nie jest oznaczony jako ciągnący się dalej', () => {
    expect(dane[1].continues).toBe(false);
  });
});

describe('wiersze i rozmiar', () => {
  it('96 bitów daje trzy wiersze', () => {
    expect(ulóż('packet-beta\n0-95: "Wszystko"').rows).toBe(3);
  });

  it('wysokość rośnie z liczbą wierszy', () => {
    const jeden = ulóż('packet-beta\n0-31: "A"');
    const trzy = ulóż('packet-beta\n0-95: "A"');
    expect(trzy.height).toBeGreaterThan(jeden.height);
  });

  it('szerokość odpowiada liczbie bitów w wierszu', () => {
    const l = ulóż('packet-beta\n0-31: "A"');
    expect(l.width).toBe(l.segments[0].width);
  });
});

describe('podziałka', () => {
  const l = ulóż('packet-beta\n0-31: "A"');

  it('ma znaczniki co osiem bitów plus koniec', () => {
    expect(l.ticks.filter((t) => t.row === 0).map((t) => t.bit)).toEqual([0, 8, 16, 24, 31]);
  });

  it('każdy wiersz ma własną podziałkę', () => {
    const dwa = ulóż('packet-beta\n0-63: "A"');
    expect(new Set(dwa.ticks.map((t) => t.row)).size).toBe(2);
  });
});

describe('przypadki brzegowe', () => {
  it('pusty pakiet nie wywraca układu', () => {
    const l = ulóż('packet-beta');
    expect(l.segments).toEqual([]);
    expect(l.height).toBeGreaterThan(0);
  });

  it('odwrócony zakres jest pomijany w rysunku', () => {
    expect(ulóż('packet-beta\n15-0: "Bledne"').segments).toEqual([]);
  });

  it('pole jednobitowe ma szerokość jednego bitu', () => {
    const l = ulóż('packet-beta\n0-7: "A"\n8: "Flaga"');
    const flaga = l.segments.find((s) => s.label === 'Flaga')!;
    expect(flaga.width).toBe(l.segments[0].width / 8);
  });
});
