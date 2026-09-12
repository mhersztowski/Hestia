/**
 * Edycja mapy bitów.
 *
 * Pole opisuje zakres, więc każda zmiana rozmiaru albo kolejności musi
 * przeliczyć sąsiadów — inaczej powstaje dziura albo nakładka, czyli diagram,
 * którego Mermaid nie narysuje.
 */
import { describe, it, expect } from 'vitest';
import { parsePacketDiagram, serializePacketDiagram } from '../formats/mermaid/packetDiagram';
import {
  addPacketField, updatePacketField, removePacketField, resizePacketField,
  movePacketField, setPacketTitle,
} from './packetOps';
import { validatePacket } from './packet';
import type { DiagramDocument } from './diagram';

const doc = () => parsePacketDiagram([
  'packet-beta',
  '0-15: "Source Port"',
  '16-31: "Destination Port"',
  '32-47: "Length"',
].join('\n')).document;
const pola = (d: DiagramDocument) => d.packet!.fields;
const zapis = (d: DiagramDocument) => serializePacketDiagram(d);

describe('dodawanie', () => {
  it('dokleja pole na końcu pakietu', () => {
    const after = addPacketField(doc(), 16);
    expect(pola(after)[3]).toMatchObject({ start: 48, end: 63 });
  });

  it('nie zostawia dziury', () => {
    expect(validatePacket(addPacketField(doc(), 8).packet!)).toEqual([]);
  });

  it('nie powiela nazw', () => {
    const after = addPacketField(addPacketField(doc(), 8), 8);
    const nazwy = pola(after).map((f) => f.label);
    expect(new Set(nazwy).size).toBe(nazwy.length);
  });
});

describe('zmiana szerokości', () => {
  it('przesuwa następne pola', () => {
    const after = resizePacketField(doc(), 0, 8);
    expect(pola(after)[0]).toMatchObject({ start: 0, end: 7 });
    expect(pola(after)[1]).toMatchObject({ start: 8, end: 23 });
  });

  it('nie tworzy dziury ani nakładki', () => {
    expect(validatePacket(resizePacketField(doc(), 1, 32).packet!)).toEqual([]);
  });

  it('szerokość poniżej jednego bitu jest podnoszona do jednego', () => {
    expect(pola(resizePacketField(doc(), 0, 0))[0]).toMatchObject({ start: 0, end: 0 });
  });
});

describe('usuwanie', () => {
  it('domyślnie domyka lukę', () => {
    const after = removePacketField(doc(), 0);
    expect(pola(after)[0]).toMatchObject({ start: 0, end: 15, label: 'Destination Port' });
    expect(validatePacket(after.packet!)).toEqual([]);
  });

  it('na życzenie zostawia dziurę', () => {
    const after = removePacketField(doc(), 0, false);
    expect(validatePacket(after.packet!)[0].kind).toBe('gap');
  });
});

describe('kolejność', () => {
  it('przesunięcie zmienia kolejność pól', () => {
    expect(pola(movePacketField(doc(), 2, 0))[0].label).toBe('Length');
  });

  it('zakresy są przeliczane, więc układ zostaje ciągły', () => {
    const after = movePacketField(doc(), 2, 0);
    expect(pola(after)[0]).toMatchObject({ start: 0, end: 15 });
    expect(validatePacket(after.packet!)).toEqual([]);
  });

  it('kolejność w zapisie odpowiada kolejności pól', () => {
    const lines = zapis(movePacketField(doc(), 2, 0)).split('\n');
    expect(lines[1]).toContain('Length');
  });
});

describe('pozostałe', () => {
  it('zmiana etykiety wychodzi do Mermaida', () => {
    expect(zapis(updatePacketField(doc(), 0, { label: 'Port zrodlowy' }))).toContain('"Port zrodlowy"');
  });

  it('tytuł da się ustawić i usunąć', () => {
    const z = setPacketTitle(doc(), 'UDP');
    expect(zapis(z)).toContain('title UDP');
    expect(zapis(setPacketTitle(z, '  '))).not.toContain('title');
  });
});

/**
 * Wstawianie w środku struktury.
 *
 * Kolejność pól to kolejność bajtów na łączu, więc nowe pole musi dać się
 * dołożyć między istniejące — a nie tylko na końcu.
 */
describe('dodawanie po wskazanym polu', () => {
  it('wstawia tuż za nim', () => {
    const after = addPacketField(doc(), 8, 'nowe', 0);
    expect(pola(after).map((f) => f.label)).toEqual(['Source Port', 'nowe', 'Destination Port', 'Length']);
  });

  it('przesuwa następne pola', () => {
    const after = addPacketField(doc(), 8, 'nowe', 0);
    expect(pola(after)[1]).toMatchObject({ start: 16, end: 23 });
    expect(pola(after)[2]).toMatchObject({ start: 24, end: 39 });
  });

  it('nie tworzy dziury ani nakładki', () => {
    expect(validatePacket(addPacketField(doc(), 8, 'nowe', 0).packet!)).toEqual([]);
  });

  it('wstawienie za ostatnim działa jak doklejenie na koniec', () => {
    const after = addPacketField(doc(), 8, 'nowe', 2);
    expect(pola(after)[3]).toMatchObject({ start: 48, end: 55, label: 'nowe' });
  });

  it('bez wskazania pola nadal dokleja na końcu', () => {
    expect(pola(addPacketField(doc(), 8, 'nowe'))[3].label).toBe('nowe');
  });

  it('kolejność w zapisie odpowiada kolejności pól', () => {
    const lines = zapis(addPacketField(doc(), 8, 'nowe', 0)).split('\n');
    expect(lines[2]).toContain('nowe');
  });
});
