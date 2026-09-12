/**
 * Mermaid `packet` ⇄ model.
 *
 * Format jest krótki, ale ma dwie pułapki: pole jednobitowe zapisuje się jedną
 * liczbą (`8: "Flaga"`), a nagłówek występuje w dwóch wariantach (`packet` i
 * `packet-beta`), z których każdy działa w innych wersjach biblioteki.
 */
import { describe, it, expect } from 'vitest';
import { parsePacketDiagram, serializePacketDiagram } from './packetDiagram';
import { validatePacket, packetSize, fieldWidth } from '../../model/packet';

const parse = (text: string) => parsePacketDiagram(text).document;
const spec = (text: string) => parse(text).packet!;
const roundTrip = (text: string) => serializePacketDiagram(parse(text));

const UDP = [
  'packet-beta',
  'title UDP Packet',
  '0-15: "Source Port"',
  '16-31: "Destination Port"',
  '32-47: "Length"',
  '48-63: "Checksum"',
  '64-95: "Data"',
].join('\n');

describe('rozpoznanie', () => {
  it('nagłówek daje dokument rodzaju `packet`', () => {
    expect(parse(UDP).kind).toBe('packet');
  });

  it('czyta tytuł', () => {
    expect(spec(UDP).title).toBe('UDP Packet');
  });

  it('czyta wszystkie pola', () => {
    expect(spec(UDP).fields).toHaveLength(5);
  });

  it('czyta zakres bitów', () => {
    expect(spec(UDP).fields[0]).toMatchObject({ start: 0, end: 15, label: 'Source Port' });
  });

  it('przyjmuje nagłówek bez `-beta`', () => {
    expect(parse('packet\n0-7: "Bajt"').kind).toBe('packet');
  });
});

describe('pole jednobitowe', () => {
  const s = spec('packet-beta\n8: "Flaga URG"\n9: "Flaga ACK"');

  it('jedna liczba znaczy jeden bit', () => {
    expect(s.fields[0]).toMatchObject({ start: 8, end: 8 });
  });

  it('ma szerokość jednego bitu', () => {
    expect(fieldWidth(s.fields[0])).toBe(1);
  });

  it('wraca przy zapisie bez zakresu', () => {
    const out = roundTrip('packet-beta\n8: "Flaga URG"');
    expect(out).toContain('8: "Flaga URG"');
    expect(out).not.toContain('8-8');
  });
});

describe('etykiety', () => {
  it('zdejmuje cudzysłowy', () => {
    expect(spec('packet-beta\n0-7: "Opis"').fields[0].label).toBe('Opis');
  });

  it('przyjmuje etykietę bez cudzysłowów', () => {
    expect(spec('packet-beta\n0-7: Opis bez cudzyslowow').fields[0].label).toBe('Opis bez cudzyslowow');
  });

  it('zapisuje zawsze w cudzysłowach — spacje inaczej psują składnię', () => {
    expect(roundTrip('packet-beta\n0-7: Opis ze spacja')).toContain('0-7: "Opis ze spacja"');
  });
});

describe('zachowanie treści', () => {
  it('drugi zapis jest identyczny z pierwszym', () => {
    const once = roundTrip(UDP);
    expect(serializePacketDiagram(parsePacketDiagram(once).document)).toBe(once);
  });

  it('zachowuje wariant nagłówka', () => {
    expect(roundTrip(UDP).split('\n')[0]).toBe('packet-beta');
    expect(roundTrip('packet\n0-7: "Bajt"').split('\n')[0]).toBe('packet');
  });

  it('zachowuje komentarz', () => {
    expect(roundTrip('packet-beta\n%% komentarz\n0-7: "Bajt"')).toContain('%% komentarz');
  });

  it('nie gubi żadnego pola', () => {
    expect(spec(roundTrip(UDP)).fields).toHaveLength(5);
  });
});

describe('rozmiar pakietu', () => {
  it('wynika z ostatniego bitu', () => {
    expect(packetSize(spec(UDP))).toBe(96);
  });

  it('pusty pakiet ma rozmiar zero', () => {
    expect(packetSize(spec('packet-beta'))).toBe(0);
  });
});

/**
 * Podział przestrzeni bitów.
 *
 * Dziura albo nakładka to błąd w opisie protokołu, nie kwestia wyglądu —
 * Mermaid odmawia wtedy narysowania diagramu, więc lepiej pokazać to wprost.
 */
describe('sprawdzanie podziału bitów', () => {
  it('poprawny pakiet nie ma usterek', () => {
    expect(validatePacket(spec(UDP))).toEqual([]);
  });

  it('wykrywa dziurę', () => {
    const issues = validatePacket(spec('packet-beta\n0-7: "A"\n16-23: "B"'));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'gap', from: 8, to: 15 });
  });

  it('wykrywa nakładanie się pól', () => {
    const issues = validatePacket(spec('packet-beta\n0-15: "A"\n8-23: "B"'));
    expect(issues[0]).toMatchObject({ kind: 'overlap', from: 8 });
  });

  it('wykrywa odwrócony zakres', () => {
    expect(validatePacket(spec('packet-beta\n15-0: "A"'))[0].kind).toBe('reversed');
  });

  it('usterka niesie czytelny opis', () => {
    expect(validatePacket(spec('packet-beta\n0-7: "A"\n16-23: "B"'))[0].message)
      .toContain('8-15');
  });
});
