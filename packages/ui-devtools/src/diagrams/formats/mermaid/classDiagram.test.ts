/**
 * Mermaid `classDiagram` ⇄ model.
 *
 * Diagram klas różni się od pozostałych dwiema rzeczami, które decydują o
 * kształcie parsera:
 *   • węzeł ma ciało — listę pól i metod, a nie samą etykietę;
 *   • relacja niesie zakończenia po OBU stronach (`Rodzic <|-- Dziecko`) i
 *     krotności („1", „0..*"), więc sam „grot" nie wystarcza.
 *
 * Obowiązuje ta sama zasada, co w pozostałych adapterach: linia zrozumiana w
 * całości albo nietknięta.
 */
import { describe, it, expect } from 'vitest';
import { parseClassDiagram, serializeClassDiagram } from './classDiagram';

const parse = (text: string) => parseClassDiagram(text).document;
const roundTrip = (text: string) => serializeClassDiagram(parse(text));

describe('rozpoznanie diagramu', () => {
  it('nagłówek daje dokument rodzaju `class`', () => {
    expect(parse('classDiagram\n  class Pies').kind).toBe('class');
  });

  it('klasa bez ciała staje się węzłem', () => {
    expect(parse('classDiagram\n  class Pies').nodes).toHaveLength(1);
    expect(parse('classDiagram\n  class Pies').nodes[0].id).toBe('Pies');
  });
});

describe('ciało klasy', () => {
  const SOURCE = [
    'classDiagram',
    '  class Zwierze {',
    '    +String imie',
    '    -int wiek',
    '    #chronione()',
    '    +czySsak() bool',
    '    +policz()$ int',
    '    +opis()* String',
    '  }',
  ].join('\n');

  it('czyta wszystkie składowe', () => {
    expect(parse(SOURCE).nodes[0].members).toHaveLength(6);
  });

  it('rozróżnia pole od metody', () => {
    const members = parse(SOURCE).nodes[0].members!;
    expect(members[0].kind).toBe('field');
    expect(members[2].kind).toBe('method');
  });

  it('czyta widoczność', () => {
    const members = parse(SOURCE).nodes[0].members!;
    expect(members[0].visibility).toBe('public');
    expect(members[1].visibility).toBe('private');
    expect(members[2].visibility).toBe('protected');
  });

  it('czyta nazwę i typ pola', () => {
    expect(parse(SOURCE).nodes[0].members![0]).toMatchObject({ name: 'imie', type: 'String' });
  });

  it('czyta typ zwracany metody', () => {
    expect(parse(SOURCE).nodes[0].members![3]).toMatchObject({ name: 'czySsak', type: 'bool' });
  });

  it('rozpoznaje składową statyczną i abstrakcyjną', () => {
    const members = parse(SOURCE).nodes[0].members!;
    expect(members[4].isStatic).toBe(true);
    expect(members[5].isAbstract).toBe(true);
  });

  it('ciało wraca przy zapisie w tej samej postaci', () => {
    const written = roundTrip(SOURCE);
    for (const line of ['+String imie', '-int wiek', '#chronione()', '+czySsak() bool']) {
      expect(written).toContain(line);
    }
  });
});

describe('składowe zapisane po kropce', () => {
  // Mermaid pozwala dopisać składową bez otwierania bloku.
  const SOURCE = 'classDiagram\n  class Pies\n  Pies : +String imie\n  Pies : +szczekaj()';

  it('trafiają do tej samej klasy', () => {
    expect(parse(SOURCE).nodes).toHaveLength(1);
    expect(parse(SOURCE).nodes[0].members).toHaveLength(2);
  });

  it('nie tworzą osobnego węzła', () => {
    expect(parse(SOURCE).nodes.map((n) => n.id)).toEqual(['Pies']);
  });
});

describe('adnotacje', () => {
  it('`<<interface>>` w ciele klasy', () => {
    const doc = parse('classDiagram\n  class Lot {\n    <<interface>>\n    +lec()\n  }');
    expect(doc.nodes[0].stereotype).toBe('interface');
    expect(doc.nodes[0].members).toHaveLength(1);
  });

  it('adnotacja zapisana osobno', () => {
    const doc = parse('classDiagram\n  class Ksztalt\n  <<abstract>> Ksztalt');
    expect(doc.nodes[0].stereotype).toBe('abstract');
  });

  it('adnotacja wraca przy zapisie', () => {
    expect(roundTrip('classDiagram\n  class Lot {\n    <<interface>>\n  }')).toContain('<<interface>>');
  });
});

describe('relacje', () => {
  /**
   * Strony modelu odpowiadają stronom zapisu: lewa nazwa to `source`, prawa
   * `target`, a zakończenia zostają tam, gdzie stały. Normalizowanie kierunku
   * („grot zawsze przy celu") przepisywałoby `<|--` użytkownika na `--|>` i —
   * co gorsza — odwracało układ: Mermaid rysuje nadklasę NAD podklasą, bo stoi
   * po lewej stronie relacji.
   */
  it.each([
    ['Rodzic <|-- Dziecko', 'none', 'triangle', 'solid'],
    ['Calosc *-- Czesc', 'none', 'diamondFilled', 'solid'],
    ['Calosc o-- Czesc', 'none', 'diamond', 'solid'],
    ['A --> B', 'arrow', 'none', 'solid'],
    ['A -- B', 'none', 'none', 'solid'],
    ['A ..> B', 'arrow', 'none', 'dotted'],
    ['A ..|> B', 'triangle', 'none', 'dotted'],
    ['A .. B', 'none', 'none', 'dotted'],
  ])('%s', (line, arrow, startArrow, lineStyle) => {
    const edge = parse(`classDiagram\n  ${line}`).edges[0];
    expect(edge).toMatchObject({ arrow, lineStyle });
    expect(edge.meta?.startArrow ?? 'none').toBe(startArrow);
  });

  it('zakończenie po obu stronach (`<|--|>`)', () => {
    const edge = parse('classDiagram\n  A <|--|> B').edges[0];
    expect(edge.arrow).toBe('triangle');
    expect(edge.meta?.startArrow).toBe('triangle');
  });

  it('strony zgadzają się z zapisem', () => {
    const edge = parse('classDiagram\n  Rodzic <|-- Dziecko').edges[0];
    expect(edge.source).toBe('Rodzic');
    expect(edge.target).toBe('Dziecko');
  });

  it('opis relacji', () => {
    expect(parse('classDiagram\n  A --> B : używa').edges[0].label).toBe('używa');
  });

  it('krotności po obu stronach', () => {
    const edge = parse('classDiagram\n  Zamowienie "1" --> "0..*" Pozycja : zawiera').edges[0];
    expect(edge.sourceLabel).toBe('1');
    expect(edge.targetLabel).toBe('0..*');
    expect(edge.label).toBe('zawiera');
  });

  it('relacja tworzy brakujące klasy', () => {
    expect(parse('classDiagram\n  A --> B').nodes.map((n) => n.id).sort()).toEqual(['A', 'B']);
  });
});

describe('zapis', () => {
  const SOURCE = [
    'classDiagram',
    '  direction LR',
    '  class Zwierze {',
    '    <<abstract>>',
    '    +String imie',
    '    +opis()* String',
    '  }',
    '  class Pies {',
    '    +szczekaj() void',
    '  }',
    '  Zwierze <|-- Pies',
    '  Zamowienie "1" --> "0..*" Pozycja : zawiera',
    '  %% komentarz',
  ].join('\n');

  it('drugi odczyt daje ten sam model', () => {
    const once = serializeClassDiagram(parse(SOURCE));
    const twice = serializeClassDiagram(parseClassDiagram(once).document);
    expect(twice).toBe(once);
  });

  it('zachowuje kierunek', () => {
    expect(roundTrip(SOURCE)).toContain('direction LR');
  });

  it('zachowuje relacje razem z krotnościami', () => {
    const written = roundTrip(SOURCE);
    expect(written).toContain('Zwierze <|-- Pies');
    expect(written).toContain('Zamowienie "1" --> "0..*" Pozycja : zawiera');
  });

  it('zachowuje komentarz', () => {
    expect(roundTrip(SOURCE)).toContain('%% komentarz');
  });

  it('nie gubi żadnej klasy', () => {
    const doc = parse(SOURCE);
    expect(doc.nodes.map((n) => n.id).sort()).toEqual(['Pies', 'Pozycja', 'Zamowienie', 'Zwierze']);
  });
});
