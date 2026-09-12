/**
 * Zmiana wyglądu połączenia.
 *
 * Po wczytaniu diagramu z Mermaida krawędzie miały już style (kropkowana,
 * gruba, kółko na końcu), ale w edytorze nie dało się ich ruszyć — dało się
 * tylko opisać połączenie albo je skasować.
 *
 * Zakończenie u źródła (`<-->`) i link niewidzialny (`~~~`) model trzyma w
 * `meta`, bo nie każdy format je zna. Ta warstwa ma tę różnicę ukryć: kto
 * zmienia styl, nie powinien wiedzieć, które pole gdzie leży.
 */
import { describe, it, expect } from 'vitest';
import { emptyDiagram, type DiagramDocument } from './diagram';
import { setEdgeStyle, reverseEdge, setNodeName } from './operations';

function withEdge(): DiagramDocument {
  const doc = emptyDiagram('flowchart');
  doc.nodes = [
    { id: 'A', label: 'A', shape: 'rectangle' },
    { id: 'B', label: 'B', shape: 'rectangle' },
  ];
  doc.edges = [{ id: 'A__B', source: 'A', target: 'B', lineStyle: 'solid', arrow: 'arrow' }];
  return doc;
}
const edgeOf = (doc: DiagramDocument) => doc.edges[0];

describe('styl linii i zakończenia', () => {
  it('zmienia styl linii', () => {
    expect(edgeOf(setEdgeStyle(withEdge(), 'A__B', { lineStyle: 'dotted' })).lineStyle).toBe('dotted');
  });

  it('zmienia zakończenie u celu', () => {
    expect(edgeOf(setEdgeStyle(withEdge(), 'A__B', { arrow: 'circle' })).arrow).toBe('circle');
  });

  it('dodaje zakończenie u źródła', () => {
    expect(edgeOf(setEdgeStyle(withEdge(), 'A__B', { startArrow: 'arrow' })).meta?.startArrow).toBe('arrow');
  });

  it('zdejmuje zakończenie u źródła bez zostawiania śmieci w `meta`', () => {
    const withStart = setEdgeStyle(withEdge(), 'A__B', { startArrow: 'arrow' });
    const cleared = setEdgeStyle(withStart, 'A__B', { startArrow: 'none' });
    expect(edgeOf(cleared).meta?.startArrow).toBeUndefined();
  });

  it('ustawia i zdejmuje link niewidzialny', () => {
    const invisible = setEdgeStyle(withEdge(), 'A__B', { invisible: true });
    expect(edgeOf(invisible).meta?.invisible).toBe('true');
    expect(edgeOf(setEdgeStyle(invisible, 'A__B', { invisible: false })).meta?.invisible).toBeUndefined();
  });

  it('puste `meta` znika zamiast zostawać pustym obiektem', () => {
    const withStart = setEdgeStyle(withEdge(), 'A__B', { startArrow: 'cross' });
    expect(edgeOf(setEdgeStyle(withStart, 'A__B', { startArrow: 'none' })).meta).toBeUndefined();
  });

  it('zmienia długość linii', () => {
    expect(edgeOf(setEdgeStyle(withEdge(), 'A__B', { length: 3 })).length).toBe(3);
  });

  it('nie rusza pól, których nie podano', () => {
    const styled = setEdgeStyle(withEdge(), 'A__B', { lineStyle: 'thick', arrow: 'cross' });
    const after = setEdgeStyle(styled, 'A__B', { length: 2 });
    expect(after.edges[0]).toMatchObject({ lineStyle: 'thick', arrow: 'cross', length: 2 });
  });

  it('nie rusza innych krawędzi', () => {
    const doc = withEdge();
    doc.edges.push({ id: 'B__A', source: 'B', target: 'A', lineStyle: 'solid', arrow: 'arrow' });
    const after = setEdgeStyle(doc, 'A__B', { lineStyle: 'dotted' });
    expect(after.edges[1].lineStyle).toBe('solid');
  });

  it('zachowuje inne wpisy w `meta`', () => {
    const doc = withEdge();
    doc.edges[0].meta = { zrodlo: 'import' };
    const after = setEdgeStyle(doc, 'A__B', { startArrow: 'none' });
    expect(after.edges[0].meta).toEqual({ zrodlo: 'import' });
  });
});

describe('odwrócenie kierunku', () => {
  it('zamienia końce miejscami', () => {
    const after = reverseEdge(withEdge(), 'A__B');
    expect(after.edges[0]).toMatchObject({ source: 'B', target: 'A' });
  });

  it('zamienia też zakończenia stron', () => {
    const doc = setEdgeStyle(withEdge(), 'A__B', { arrow: 'cross', startArrow: 'circle' });
    const after = reverseEdge(doc, 'A__B');
    expect(after.edges[0].arrow).toBe('circle');
    expect(after.edges[0].meta?.startArrow).toBe('cross');
  });

  it('zachowuje opis połączenia', () => {
    const doc = withEdge();
    doc.edges[0].label = 'gotowe';
    expect(reverseEdge(doc, 'A__B').edges[0].label).toBe('gotowe');
  });
});

/**
 * Zmiana nazwy widocznej na diagramie.
 *
 * W schemacie blokowym etykieta jest czymś innym niż identyfikator (`A[Start]`),
 * ale w diagramie klas nazwa klasy JEST identyfikatorem — `class Pies` nie ma
 * osobnego pola na opis. Ustawianie samej etykiety nie zmieniało tam niczego w
 * kodzie: użytkownik przepisywał nazwę, a zapis dalej pokazywał starą.
 */
describe('nazwa widoczna na diagramie', () => {
  function klasa(): DiagramDocument {
    const doc = emptyDiagram('class');
    doc.nodes = [
      { id: 'Pies', label: 'Pies', shape: 'rectangle', members: [] },
      { id: 'Kot', label: 'Kot', shape: 'rectangle', members: [] },
    ];
    doc.edges = [{ id: 'e', source: 'Pies', target: 'Kot', lineStyle: 'solid', arrow: 'arrow' }];
    return doc;
  }

  it('w diagramie klas zmienia identyfikator', () => {
    const after = setNodeName(klasa(), 'Pies', 'Owczarek');
    expect(after.nodes.map((n) => n.id)).toContain('Owczarek');
    expect(after.nodes.map((n) => n.id)).not.toContain('Pies');
  });

  it('przepina krawędzie po zmianie nazwy klasy', () => {
    expect(setNodeName(klasa(), 'Pies', 'Owczarek').edges[0].source).toBe('Owczarek');
  });

  it('etykieta idzie w ślad za identyfikatorem', () => {
    const node = setNodeName(klasa(), 'Pies', 'Owczarek').nodes.find((n) => n.id === 'Owczarek');
    expect(node!.label).toBe('Owczarek');
  });

  it('w schemacie blokowym zmienia tylko etykietę', () => {
    const doc = emptyDiagram('flowchart');
    doc.nodes = [{ id: 'A', label: 'Start', shape: 'stadium' }];
    const after = setNodeName(doc, 'A', 'Początek');
    expect(after.nodes[0].id).toBe('A');
    expect(after.nodes[0].label).toBe('Początek');
  });

  it('kolizja nazw klas nie scala dwóch klas w jedną', () => {
    const after = setNodeName(klasa(), 'Pies', 'Kot');
    expect(after.nodes).toHaveLength(2);
  });
});
