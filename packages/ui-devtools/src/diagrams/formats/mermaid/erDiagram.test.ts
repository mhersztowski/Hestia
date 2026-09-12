/**
 * Mermaid `erDiagram` ⇄ model.
 *
 * Dwie rzeczy własne tego formatu:
 *   • encja ma **atrybuty** z rolami kluczy (`PK`, `FK`, `UK`) i komentarzem;
 *   • relacja ma **liczebność po obu stronach**, zapisaną lustrzanie
 *     (`||--o{`), więc lewy koniec czyta się od zewnątrz do środka.
 *
 * Obowiązuje zasada wspólna dla adapterów: linia zrozumiana w całości albo
 * nietknięta.
 */
import { describe, it, expect } from 'vitest';
import { parseErDiagram, serializeErDiagram } from './erDiagram';

const parse = (text: string) => parseErDiagram(text).document;
const roundTrip = (text: string) => serializeErDiagram(parse(text));

describe('rozpoznanie', () => {
  it('nagłówek daje dokument rodzaju `er`', () => {
    expect(parse('erDiagram\n  KLIENT ||--o{ ZAMOWIENIE : sklada').kind).toBe('er');
  });

  it('relacja tworzy obie encje', () => {
    const doc = parse('erDiagram\n  KLIENT ||--o{ ZAMOWIENIE : sklada');
    expect(doc.nodes.map((n) => n.id)).toEqual(['KLIENT', 'ZAMOWIENIE']);
  });

  it('encja z myślnikiem w nazwie', () => {
    expect(parse('erDiagram\n  ORDER ||--|{ LINE-ITEM : contains').nodes[1].id).toBe('LINE-ITEM');
  });
});

describe('liczebność relacji', () => {
  const rel = (line: string) => parse(`erDiagram\n  ${line}`).edges[0];

  it.each([
    ['A |o--o| B : x', 'zeroOrOne', 'zeroOrOne'],
    ['A ||--|| B : x', 'exactlyOne', 'exactlyOne'],
    ['A }o--o{ B : x', 'zeroOrMore', 'zeroOrMore'],
    ['A }|--|{ B : x', 'oneOrMore', 'oneOrMore'],
    ['A ||--o{ B : x', 'exactlyOne', 'zeroOrMore'],
    ['A }|--|| B : x', 'oneOrMore', 'exactlyOne'],
  ])('%s', (line, from, to) => {
    expect(rel(line)).toMatchObject({ erFrom: from, erTo: to });
  });

  it('linia ciągła znaczy relację identyfikującą', () => {
    expect(rel('A ||--o{ B : x').erIdentifying).toBe(true);
  });

  it('linia przerywana znaczy nieidentyfikującą', () => {
    expect(rel('A ||..o{ B : x').erIdentifying).toBe(false);
  });

  it('etykieta relacji', () => {
    expect(rel('A ||--o{ B : zawiera').label).toBe('zawiera');
  });

  it('etykieta w cudzysłowie', () => {
    expect(rel('A ||--o{ B : "ma wiele"').label).toBe('ma wiele');
  });

  it('każdy zapis liczebności wraca taki sam', () => {
    for (const line of ['A |o--o| B : x', 'A ||--|| B : x', 'A }o--o{ B : x', 'A }|--|{ B : x', 'A ||..o{ B : x']) {
      expect(roundTrip(`erDiagram\n  ${line}`), line).toContain(line);
    }
  });
});

describe('atrybuty encji', () => {
  const SOURCE = [
    'erDiagram',
    '  KLIENT {',
    '    string nazwa',
    '    string numer PK',
    '    int wiek',
    '    string email UK "unikalny"',
    '    string firmaId FK',
    '  }',
  ].join('\n');
  const atrybuty = parse(SOURCE).nodes[0].attributes!;

  it('czyta wszystkie', () => {
    expect(atrybuty).toHaveLength(5);
  });

  it('czyta typ i nazwę', () => {
    expect(atrybuty[0]).toMatchObject({ type: 'string', name: 'nazwa' });
  });

  it('czyta klucz główny', () => {
    expect(atrybuty[1].keys).toEqual(['PK']);
  });

  it('czyta klucz obcy', () => {
    expect(atrybuty[4].keys).toEqual(['FK']);
  });

  it('czyta komentarz', () => {
    expect(atrybuty[3]).toMatchObject({ keys: ['UK'], comment: 'unikalny' });
  });

  it('atrybut bez klucza nie ma pustej listy', () => {
    expect(atrybuty[0].keys).toBeUndefined();
  });

  it('kilka ról klucza naraz', () => {
    const doc = parse('erDiagram\n  A {\n    string id PK, FK\n  }');
    expect(doc.nodes[0].attributes![0].keys).toEqual(['PK', 'FK']);
  });

  it('wszystko wraca przy zapisie', () => {
    const out = roundTrip(SOURCE);
    for (const line of ['string nazwa', 'string numer PK', 'string email UK "unikalny"', 'string firmaId FK']) {
      expect(out).toContain(line);
    }
  });
});

describe('encja bez atrybutów', () => {
  it('sama deklaracja tworzy encję', () => {
    expect(parse('erDiagram\n  KLIENT {\n  }').nodes.map((n) => n.id)).toEqual(['KLIENT']);
  });

  it('samotna encja zachowuje pusty blok — inaczej zniknęłaby z diagramu', () => {
    // Bez relacji i bez atrybutów pusty blok jest JEDYNYM śladem tej encji.
    expect(roundTrip('erDiagram\n  KLIENT {\n  }')).toContain('KLIENT {');
  });

  it('encja występująca w relacji nie potrzebuje pustego bloku', () => {
    const out = roundTrip('erDiagram\n  KLIENT ||--o{ ZAMOWIENIE : sklada');
    expect(out).not.toContain('{\n  }');
    expect(out).toContain('KLIENT ||--o{ ZAMOWIENIE');
  });
});

describe('zachowanie treści', () => {
  const SOURCE = [
    'erDiagram',
    '  KLIENT ||--o{ ZAMOWIENIE : sklada',
    '  ZAMOWIENIE ||--|{ POZYCJA : zawiera',
    '  KLIENT }|..|{ ADRES : uzywa',
    '  KLIENT {',
    '    string numer PK',
    '    string nazwa',
    '  }',
    '  ZAMOWIENIE {',
    '    int nr PK',
    '    string klientNumer FK',
    '  }',
    '  %% komentarz',
  ].join('\n');

  it('drugi zapis jest identyczny z pierwszym', () => {
    const once = roundTrip(SOURCE);
    expect(serializeErDiagram(parseErDiagram(once).document)).toBe(once);
  });

  it('nie gubi żadnej encji', () => {
    expect(parse(SOURCE).nodes.map((n) => n.id).sort())
      .toEqual(['ADRES', 'KLIENT', 'POZYCJA', 'ZAMOWIENIE']);
  });

  it('nie gubi żadnej relacji', () => {
    expect(parse(SOURCE).edges).toHaveLength(3);
  });

  it('zachowuje komentarz', () => {
    expect(roundTrip(SOURCE)).toContain('%% komentarz');
  });

  it('relacja z atrybutami tej samej encji nie tworzy duplikatu', () => {
    expect(parse(SOURCE).nodes.filter((n) => n.id === 'KLIENT')).toHaveLength(1);
  });
});
