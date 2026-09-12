import { describe, it, expect } from 'vitest';
import { parseC4Diagram, serializeC4Diagram, splitArgs } from './c4Diagram';
import type { DiagramDocument } from '../../model/diagram';

const docOf = (lines: string[]): DiagramDocument => parseC4Diagram(lines.join('\n')).document;
const roundTrip = (lines: string[]) => serializeC4Diagram(parseC4Diagram(lines.join('\n')).document);

describe('c4: rozbiór argumentów wywołania', () => {
  it('dzieli po przecinkach i zdejmuje cudzysłowy', () => {
    expect(splitArgs('a, "Klient banku", "Opis klienta"')).toEqual(['a', 'Klient banku', 'Opis klienta']);
  });

  it('przecinek w cudzysłowie nie dzieli', () => {
    expect(splitArgs('c, "API", "Java, Spring Boot", "Opis"')).toEqual(['c', 'API', 'Java, Spring Boot', 'Opis']);
  });

  it('puste argumenty zostają puste', () => {
    expect(splitArgs('a, "Nazwa", ""')).toEqual(['a', 'Nazwa', '']);
  });
});

describe('c4: elementy', () => {
  it('osoba z opisem', () => {
    const node = docOf(['C4Context', '    Person(klient, "Klient", "Posiada konto")']).nodes[0];
    expect(node.id).toBe('klient');
    expect(node.label).toBe('Klient');
    expect(node.c4).toMatchObject({ kind: 'person', variant: 'plain', external: false, description: 'Posiada konto' });
  });

  it('rodzaj, wariant i zewnętrzność to trzy niezależne rzeczy', () => {
    const nodes = docOf([
      'C4Context',
      '    System(a, "A")',
      '    SystemDb(b, "B")',
      '    SystemQueue(c, "C")',
      '    System_Ext(d, "D")',
      '    SystemDb_Ext(e, "E")',
      '    Person_Ext(f, "F")',
    ]).nodes;

    expect(nodes.map((n) => [n.c4!.kind, n.c4!.variant, n.c4!.external])).toEqual([
      ['system', 'plain', false],
      ['system', 'db', false],
      ['system', 'queue', false],
      ['system', 'plain', true],
      ['system', 'db', true],
      ['person', 'plain', true],
    ]);
  });

  it('kontener ma technologię jako trzeci argument, a opis jako czwarty', () => {
    const node = docOf(['C4Container', '    Container(api, "API", "Java, Spring", "Obsługa żądań")']).nodes[0];
    expect(node.c4).toMatchObject({ kind: 'container', technology: 'Java, Spring', description: 'Obsługa żądań' });
  });

  it('system NIE ma technologii — trzeci argument to opis', () => {
    // Ta różnica jest źródłem najczęstszej pomyłki przy zapisie: `System` ma
    // trzy argumenty, `Container` cztery.
    const node = docOf(['C4Context', '    System(s, "System", "Sam opis")']).nodes[0];
    expect(node.c4!.description).toBe('Sam opis');
    expect(node.c4!.technology).toBeUndefined();
  });

  it('element bez opisu', () => {
    const node = docOf(['C4Context', '    System(a, "Tylko nazwa")']).nodes[0];
    expect(node.label).toBe('Tylko nazwa');
    expect(node.c4!.description).toBeUndefined();
  });
});

describe('c4: granice', () => {
  it('granica staje się grupą, a jej zawartość dziećmi', () => {
    const doc = docOf([
      'C4Context',
      '    Enterprise_Boundary(b0, "Bank") {',
      '        Person(a, "Klient")',
      '        System(s, "System")',
      '    }',
    ]);

    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0]).toMatchObject({ id: 'b0', label: 'Bank' });
    expect(doc.groups[0].c4).toMatchObject({ kind: 'enterprise' });
    expect(doc.nodes.map((n) => n.parentId)).toEqual(['b0', 'b0']);
  });

  it('granice zagnieżdżone', () => {
    const doc = docOf([
      'C4Context',
      '    Enterprise_Boundary(b0, "Bank") {',
      '        System_Boundary(b1, "Wnętrze") {',
      '            System(s, "S")',
      '        }',
      '    }',
    ]);

    expect(doc.groups.map((g) => [g.id, g.parentId])).toEqual([['b0', undefined], ['b1', 'b0']]);
    expect(doc.nodes[0].parentId).toBe('b1');
  });

  it('węzeł wdrożenia bywa granicą', () => {
    const doc = docOf([
      'C4Deployment',
      '    Node(srv, "Serwer", "Ubuntu 22.04") {',
      '        Container(api, "API", "Java")',
      '    }',
    ]);

    expect(doc.groups[0]).toMatchObject({ id: 'srv', label: 'Serwer' });
    expect(doc.groups[0].c4).toMatchObject({ kind: 'node', technology: 'Ubuntu 22.04' });
    expect(doc.nodes[0].parentId).toBe('srv');
  });
});

describe('c4: relacje', () => {
  it('zwykła relacja z etykietą i technologią', () => {
    const edge = docOf(['C4Context', '    System(a,"A")', '    System(b,"B")', '    Rel(a, b, "Używa", "HTTPS")']).edges[0];
    expect(edge).toMatchObject({ source: 'a', target: 'b', label: 'Używa' });
    expect(edge.c4).toMatchObject({ technology: 'HTTPS' });
  });

  it('BiRel jest obustronna', () => {
    const edge = docOf(['C4Context', '    System(a,"A")', '    System(b,"B")', '    BiRel(a, b, "Wymiana")']).edges[0];
    expect(edge.c4!.bidirectional).toBe(true);
    // Obustronność rysuje się strzałką również przy źródle.
    expect(edge.meta?.startArrow).toBe('arrow');
  });

  it('kierunek zapamiętuje dokładny przyrostek', () => {
    // `Rel_U` i `Rel_Up` znaczą to samo; zapis ma oddać ten, który przyszedł.
    const doc = docOf([
      'C4Context', '    System(a,"A")', '    System(b,"B")',
      '    Rel_U(a, b, "w górę")', '    Rel_Down(a, b, "w dół")', '    Rel_Back(a, b, "wstecz")',
    ]);
    expect(doc.edges.map((e) => e.c4!.suffix)).toEqual(['U', 'Down', 'Back']);
  });

  it('relacja do elementu spoza dokumentu nie znika', () => {
    const doc = docOf(['C4Context', '    System(a,"A")', '    Rel(a, nieznany, "Woła")']);
    expect(doc.edges).toHaveLength(1);
    expect(doc.nodes.map((n) => n.id)).toContain('nieznany');
  });
});

describe('c4: zapis', () => {
  it('odtwarza dokument w tej samej postaci', () => {
    const source = [
      'C4Context',
      '    title Kontekst systemu bankowego',
      '    Enterprise_Boundary(b0, "Bank") {',
      '        Person(klientA, "Klient banku", "Posiada konto osobiste")',
      '        System(bankowosc, "Bankowość internetowa", "Pozwala obsłużyć konto")',
      '        SystemDb(rdzen, "System centralny", "Przechowuje dane kont")',
      '    }',
      '    System_Ext(poczta, "System pocztowy", "Wysyła powiadomienia")',
      '    Rel(klientA, bankowosc, "Używa")',
      '    Rel(bankowosc, rdzen, "Czyta i zapisuje", "JDBC")',
      '    Rel_Back(poczta, klientA, "Wysyła listy do")',
      '    BiRel(bankowosc, poczta, "Wymienia komunikaty")',
    ].join('\n');

    expect(serializeC4Diagram(parseC4Diagram(source).document)).toBe(source);
  });

  it('drugi zapis niczego nie zmienia', () => {
    const once = roundTrip(['C4Container', '    Container(api, "API", "Java, Spring", "Opis")', '    ContainerDb(db, "Baza", "PostgreSQL")']);
    expect(serializeC4Diagram(parseC4Diagram(once).document)).toBe(once);
  });

  it('zachowuje rodzaj diagramu', () => {
    expect(roundTrip(['C4Deployment', '    Node(n, "Serwer", "Linux")'])).toMatch(/^C4Deployment/);
    expect(roundTrip(['C4Dynamic', '    System(a, "A")'])).toMatch(/^C4Dynamic/);
  });

  it('linie stylu i układu wracają nietknięte', () => {
    const written = roundTrip([
      'C4Context',
      '    System(a, "A")',
      '    UpdateElementStyle(a, $fontColor="red", $bgColor="grey")',
      '    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")',
    ]);
    expect(written).toContain('UpdateElementStyle(a, $fontColor="red", $bgColor="grey")');
    expect(written).toContain('UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")');
  });

  it('pusta granica zostaje w zapisie', () => {
    const written = roundTrip(['C4Context', '    System_Boundary(b1, "Pusta") {', '    }']);
    expect(written).toContain('System_Boundary(b1, "Pusta") {');
    expect(written).toContain('}');
  });
});
