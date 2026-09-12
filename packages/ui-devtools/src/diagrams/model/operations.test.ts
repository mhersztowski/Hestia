/**
 * Testy operacji edycyjnych.
 *
 * Sprawdzają głównie przypadki, w których niedbała operacja psuje zapis:
 * pusty opis przejścia zostawiający wiszący dwukropek w Mermaidzie, kolizja
 * identyfikatorów sklejająca dwa węzły, osierocone krawędzie.
 */
import { describe, it, expect } from 'vitest';
import { emptyDiagram, type DiagramDocument } from './diagram';
import {
  addNode, addGroup, baseNameFor, connect, moveNodeToGroup, removeEdge, removeGroup, renameNode,
  setEdgeLabel, setGroupLabel, setGroupSize, setNodeLabel, resetLayout, mergeLayout, spotForNewNode,
} from './operations';
import { mermaidFormat } from '../formats/mermaid';
import { autoLayout } from './layout';

function stateDoc(): DiagramDocument {
  let doc = emptyDiagram('state');
  doc = addNode(doc, 'start');
  doc = addNode(doc, 'rectangle');
  doc = connect(doc, doc.nodes[0].id, doc.nodes[1].id);
  return doc;
}

describe('baseNameFor', () => {
  it('nazwy zależą od roli i rodzaju diagramu, nie od nazwy kształtu', () => {
    expect(baseNameFor('state', 'rectangle')).toBe('Stan');
    expect(baseNameFor('flowchart', 'rectangle')).toBe('Krok');
    expect(baseNameFor('flowchart', 'rhombus')).toBe('Decyzja');
    expect(baseNameFor('state', 'choice')).toBe('Wybor');
  });
});

describe('addNode', () => {
  it('nadaje wolny identyfikator i tę samą etykietę', () => {
    const doc = addNode(emptyDiagram('state'), 'rectangle');
    expect(doc.nodes[0]).toMatchObject({ id: 'Stan', label: 'Stan', shape: 'rectangle' });
  });

  it('kolejne węzły dostają numerowane identyfikatory', () => {
    let doc = addNode(emptyDiagram('state'), 'rectangle');
    doc = addNode(doc, 'rectangle');
    expect(doc.nodes.map((n) => n.id)).toEqual(['Stan', 'Stan1']);
  });

  it('pseudostan nie dostaje etykiety — kropka z podpisem „start1" tylko myli', () => {
    const doc = addNode(emptyDiagram('state'), 'start');
    expect(doc.nodes[0].label).toBe('');
  });
});

describe('setEdgeLabel', () => {
  it('ustawia opis przejścia', () => {
    const doc = setEdgeLabel(stateDoc(), 'start__Stan', 'uruchom');
    expect(doc.edges[0].label).toBe('uruchom');
  });

  it('pusty opis usuwa etykietę zamiast zapisywać pustą', () => {
    let doc = setEdgeLabel(stateDoc(), 'start__Stan', 'uruchom');
    doc = setEdgeLabel(doc, 'start__Stan', '   ');
    expect(doc.edges[0]).not.toHaveProperty('label');
    // Pusta etykieta dałaby w Mermaidzie wiszący dwukropek.
    expect(mermaidFormat.serialize(doc)).not.toMatch(/-->\s*:/);
  });

  it('opis trafia do zapisu Mermaida po dwukropku', () => {
    const doc = setEdgeLabel(stateDoc(), 'start__Stan', 'uruchom');
    expect(mermaidFormat.serialize(doc)).toContain('[*] --> Stan: uruchom');
  });
});

describe('renameNode', () => {
  it('przepina krawędzie na nowy identyfikator', () => {
    const doc = renameNode(stateDoc(), 'Stan', 'Praca');
    expect(doc.nodes.map((n) => n.id)).toContain('Praca');
    expect(doc.edges[0].target).toBe('Praca');
  });

  it('odmawia, gdy nazwa jest zajęta — inaczej dwa węzły skleiłyby się przy zapisie', () => {
    let doc = stateDoc();
    doc = addNode(doc, 'rectangle');           // Stan1
    const before = JSON.parse(JSON.stringify(doc));
    expect(renameNode(doc, 'Stan1', 'Stan')).toEqual(before);
  });

  it('czyści znaki niedozwolone w identyfikatorze', () => {
    const doc = renameNode(stateDoc(), 'Stan', 'Praca w toku!');
    expect(doc.nodes.some((n) => n.id === 'Pracawtoku')).toBe(true);
  });
});

describe('connect i removeEdge', () => {
  it('połączenie dostaje unikalny identyfikator nawet przy powtórzeniu pary', () => {
    let doc = stateDoc();
    doc = connect(doc, 'start', 'Stan');
    expect(doc.edges.map((e) => e.id)).toEqual(['start__Stan', 'start__Stan_1']);
  });

  it('usunięcie krawędzi nie rusza węzłów', () => {
    const doc = removeEdge(stateDoc(), 'start__Stan');
    expect(doc.edges).toHaveLength(0);
    expect(doc.nodes).toHaveLength(2);
  });
});

describe('setNodeLabel', () => {
  it('zmienia tylko etykietę, identyfikator zostaje', () => {
    const doc = setNodeLabel(stateDoc(), 'Stan', 'Stan roboczy');
    expect(doc.nodes[1]).toMatchObject({ id: 'Stan', label: 'Stan roboczy' });
    expect(mermaidFormat.serialize(doc)).toContain('state "Stan roboczy" as Stan');
  });
});

describe('operacje na grupach', () => {
  function withGroup(): DiagramDocument {
    let doc = emptyDiagram('state');
    doc = addNode(doc, 'rectangle');            // Stan
    doc = addNode(doc, 'rectangle');            // Stan1
    doc = addGroup(doc, { members: ['Stan'] });
    return doc;
  }

  it('nowa grupa dostaje wolny identyfikator i nazwę zależną od rodzaju diagramu', () => {
    expect(addGroup(emptyDiagram('state')).groups[0]).toMatchObject({ id: 'StanZlozony', label: 'StanZlozony' });
    expect(addGroup(emptyDiagram('flowchart')).groups[0].id).toBe('Grupa');
  });

  it('węzły wskazane jako zawartość wchodzą do grupy i tracą starą pozycję', () => {
    let doc = emptyDiagram('state');
    doc = addNode(doc, 'rectangle', { position: { x: 500, y: 500 } });
    doc = addGroup(doc, { members: ['Stan'] });

    const node = doc.nodes[0];
    expect(node.parentId).toBe('StanZlozony');
    // Stara pozycja była liczona od płótna — w grupie obowiązują lokalne.
    expect(node.position).toBeUndefined();
  });

  it('zmiana nazwy i rozmiaru trafia do modelu', () => {
    let doc = setGroupLabel(withGroup(), 'StanZlozony', 'Praca');
    doc = setGroupSize(doc, 'StanZlozony', { width: 420.6, height: 260.2 });
    expect(doc.groups[0]).toMatchObject({ label: 'Praca', size: { width: 421, height: 260 } });
  });

  it('nazwa ramki trafia do kodu w formie z aliasem', () => {
    const doc = setGroupLabel(withGroup(), 'StanZlozony', 'Praca');
    // Identyfikator zostaje (używają go przejścia), a opis idzie obok.
    expect(mermaidFormat.serialize(doc)).toContain('state "Praca" as StanZlozony {');
  });

  it('usunięcie grupy wypuszcza zawartość poziom wyżej, zamiast ją kasować', () => {
    const doc = removeGroup(withGroup(), 'StanZlozony');
    expect(doc.groups).toHaveLength(0);
    expect(doc.nodes.map((n) => n.id).sort()).toEqual(['Stan', 'Stan1']);
    expect(doc.nodes.find((n) => n.id === 'Stan')?.parentId).toBeUndefined();
  });

  it('usunięcie grupy zabiera przejścia prowadzące do niej samej', () => {
    let doc = withGroup();
    doc = connect(doc, 'Stan1', 'StanZlozony');
    expect(removeGroup(doc, 'StanZlozony').edges).toHaveLength(0);
  });

  it('grupa zagnieżdżona awansuje do rodzica usuwanej', () => {
    let doc = addGroup(emptyDiagram('state'));                       // StanZlozony
    doc = addGroup(doc, { parentId: 'StanZlozony' });                // StanZlozony1
    doc = removeGroup(doc, 'StanZlozony');
    expect(doc.groups.map((g) => [g.id, g.parentId])).toEqual([['StanZlozony1', undefined]]);
  });

  it('przenoszenie węzła między grupami i poza nie', () => {
    let doc = moveNodeToGroup(withGroup(), 'Stan1', 'StanZlozony');
    expect(doc.nodes.find((n) => n.id === 'Stan1')?.parentId).toBe('StanZlozony');

    doc = moveNodeToGroup(doc, 'Stan1');
    expect(doc.nodes.find((n) => n.id === 'Stan1')?.parentId).toBeUndefined();
  });

  it('przeniesienie do nieistniejącej grupy jest ignorowane', () => {
    const doc = withGroup();
    expect(moveNodeToGroup(doc, 'Stan1', 'brak')).toEqual(doc);
  });
});

describe('resetLayout', () => {
  it('czyści pozycje węzłów i ramek — inaczej „Ułóż" rozjeżdża zawartość względem ramki', () => {
    let doc = emptyDiagram('state');
    doc = addNode(doc, 'rectangle', { position: { x: 100, y: 100 } });
    doc = addGroup(doc, { position: { x: 5, y: 5 }, size: { width: 300, height: 200 } });

    const reset = resetLayout(doc);

    expect(reset.nodes[0].position).toBeUndefined();
    expect(reset.groups[0].position).toBeUndefined();
    expect(reset.groups[0].size).toBeUndefined();
  });

  it('nie rusza niczego poza układem', () => {
    let doc = emptyDiagram('state');
    doc = addNode(doc, 'rectangle');
    doc = addNode(doc, 'rectangle');
    doc = connect(doc, 'Stan', 'Stan1', 'zdarzenie');

    const reset = resetLayout(doc);
    expect(reset.edges).toEqual(doc.edges);
    expect(reset.nodes.map((n) => n.id)).toEqual(doc.nodes.map((n) => n.id));
  });
});

describe('mergeLayout', () => {
  it('przenosi pozycje węzłów o tych samych identyfikatorach', () => {
    const previous = autoLayout(mermaidFormat.parse('stateDiagram-v2\n  [*] --> A\n  A --> B').document);
    const reparsed = mermaidFormat.parse('stateDiagram-v2\n  [*] --> A\n  A --> B').document;

    const merged = mergeLayout(reparsed, previous);
    for (const node of merged.nodes.filter((n) => n.id === 'A' || n.id === 'B')) {
      expect(node.position, node.id).toEqual(previous.nodes.find((p) => p.id === node.id)!.position);
    }
  });

  it('nowe elementy zostają bez pozycji — dostaną ją z układu', () => {
    const previous = autoLayout(mermaidFormat.parse('stateDiagram-v2\n  A --> B').document);
    const reparsed = mermaidFormat.parse('stateDiagram-v2\n  A --> B\n  B --> C').document;

    expect(mergeLayout(reparsed, previous).nodes.find((n) => n.id === 'C')?.position).toBeUndefined();
  });

  it('przenosi pozycję i rozmiar ramek', () => {
    let previous = mermaidFormat.parse('stateDiagram-v2\n  state G {\n    A --> B\n  }').document;
    previous = setGroupSize(previous, 'G', { width: 400, height: 300 });
    previous = autoLayout(previous);
    const reparsed = mermaidFormat.parse('stateDiagram-v2\n  state G {\n    A --> B\n  }').document;

    const merged = mergeLayout(reparsed, previous);
    expect(merged.groups[0].size).toEqual({ width: 400, height: 300 });
    expect(merged.groups[0].position).toEqual(previous.groups[0].position);
  });

  it('nie nadpisuje układu, który nowy dokument już niesie', () => {
    const previous = autoLayout(mermaidFormat.parse('stateDiagram-v2\n  A --> B').document);
    const target = mermaidFormat.parse('stateDiagram-v2\n  A --> B').document;
    target.nodes[0].position = { x: 999, y: 999 };

    expect(mergeLayout(target, previous).nodes[0].position).toEqual({ x: 999, y: 999 });
  });
});

describe('spotForNewNode', () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };

  it('celuje w środek widocznego obszaru', () => {
    const spot = spotForNewNode(emptyDiagram('state'), area, { width: 150, height: 50 });
    expect(spot).toEqual({ x: 325, y: 275 });
  });

  it('uwzględnia przewinięcie widoku — liczy od jego lewego górnego rogu', () => {
    const spot = spotForNewNode(emptyDiagram('state'), { x: 1000, y: 500, width: 400, height: 200 }, { width: 100, height: 40 });
    expect(spot).toEqual({ x: 1150, y: 580 });
  });

  it('odsuwa się, gdy w środku już coś stoi', () => {
    let doc = emptyDiagram('state');
    doc = addNode(doc, 'rectangle', { position: { x: 325, y: 275 } });
    const spot = spotForNewNode(doc, area, { width: 150, height: 50 });
    expect(spot).not.toEqual({ x: 325, y: 275 });
    // Ale nadal blisko kadru, a nie na drugim końcu diagramu.
    expect(Math.abs(spot.x - 325)).toBeLessThan(500);
    expect(Math.abs(spot.y - 275)).toBeLessThan(500);
  });

  it('pomija elementy wewnątrz ramek — ich pozycje są lokalne', () => {
    let doc = emptyDiagram('state');
    doc = addGroup(doc);
    doc.nodes = [{ id: 'X', label: '', shape: 'rectangle', parentId: doc.groups[0].id, position: { x: 325, y: 275 } }];
    // Węzeł w ramce stoi „lokalnie" na 325/275, co nie koliduje ze środkiem płótna.
    expect(spotForNewNode(doc, area, { width: 150, height: 50 })).toEqual({ x: 325, y: 275 });
  });

  it('znajduje miejsce nawet przy gęstym zagęszczeniu', () => {
    let doc = emptyDiagram('state');
    for (let i = 0; i < 5; i++) doc = addNode(doc, 'rectangle', { position: { x: 325, y: 275 + i * 10 } });
    const spot = spotForNewNode(doc, area);
    expect(Number.isFinite(spot.x) && Number.isFinite(spot.y)).toBe(true);
  });
});
