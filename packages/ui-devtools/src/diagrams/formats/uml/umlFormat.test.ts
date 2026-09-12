/**
 * Projekt UML (`*.umlproj.json`) jako format diagramu.
 *
 * Spina blok w notatce ze stroną Programming → UML: blok kodu potrafi być
 * związany z plikiem w Drive, więc po dołożeniu adaptera ten sam projekt da się
 * oglądać i poprawiać w obu miejscach, bez kopiowania.
 *
 * Sedno jest w zapisie. Plik projektu niesie **historię commitów**, listę
 * diagramów i metadane, których model diagramu nie modeluje. Zapis z bloku musi
 * je oddać nietknięte — inaczej pierwsza poprawka w notatce kasowałaby całą
 * historię projektu, i to bez żadnego ostrzeżenia.
 */
import { describe, it, expect } from 'vitest';
import { umlProjectFormat } from './umlFormat';
import { diagramFormats } from '../../model/format';
// Import dla efektu ubocznego: formaty wbudowane rejestrują się w barrelu
// pakietu, więc bez niego rejestr byłby pusty.
import '../../index';

const PROJEKT = {
  type: 'uml-project',
  version: 2,
  name: 'Zwierzęta',
  linkedPath: 'mycastle-code/packages/core/src',
  diagrams: [
    {
      id: 'd1',
      name: 'Model',
      nodes: [
        {
          id: 'n1',
          type: 'umlClass',
          position: { x: 40, y: 20 },
          data: { kind: 'class', name: 'Pies', members: [{ id: 'm1', kind: 'method', text: '+ glos(): string' }] },
        },
        {
          id: 'n2',
          type: 'umlClass',
          position: { x: 40, y: 220 },
          data: { kind: 'abstract', name: 'Zwierze', members: [] },
        },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', type: 'uml', data: { relType: 'generalization' } }],
    },
  ],
  history: {
    commits: { c1: { id: 'c1', message: 'Wygenerowano z kodu', at: 1, parents: [], snapshot: { diagrams: [] } } },
    branches: { main: 'c1' },
    head: 'main',
  },
  updatedAt: 1234,
};

const TEKST = JSON.stringify(PROJEKT, null, 2);

describe('rozpoznawanie', () => {
  it('rozpoznaje projekt po znaczniku typu', () => {
    expect(umlProjectFormat.detect(TEKST)).toBeGreaterThan(0.9);
  });

  it('nie zgłasza się do diagramu Mermaida', () => {
    expect(umlProjectFormat.detect('flowchart TB\n  A --> B')).toBe(0);
    expect(umlProjectFormat.detect('classDiagram\n  class A')).toBe(0);
  });

  it('nie zgłasza się do dowolnego JSON-a', () => {
    expect(umlProjectFormat.detect('{"foo": 1}')).toBe(0);
    expect(umlProjectFormat.detect('[1, 2, 3]')).toBe(0);
  });

  it('rejestr wybiera go dla projektu, a Mermaida dla diagramu', () => {
    expect(diagramFormats.detect(TEKST)?.id).toBe('umlproj');
    expect(diagramFormats.detect('classDiagram\n  class A')?.id).toBe('mermaid');
  });
});

describe('odczyt', () => {
  const { document, issues } = umlProjectFormat.parse(TEKST);

  it('daje diagram klas z nazwami klas jako identyfikatorami', () => {
    expect(document.kind).toBe('class');
    expect(document.nodes.map((n) => n.id).sort()).toEqual(['Pies', 'Zwierze']);
    expect(issues).toEqual([]);
  });

  it('zachowuje układ zapisany w projekcie', () => {
    expect(document.nodes.find((n) => n.id === 'Pies')?.position).toEqual({ x: 40, y: 20 });
  });

  it('odwraca dziedziczenie tak jak most', () => {
    expect(document.edges[0].source).toBe('Zwierze');
    expect(document.edges[0].target).toBe('Pies');
  });

  it('uszkodzony plik daje uwagę, a nie wyjątek', () => {
    const wynik = umlProjectFormat.parse('{ to nie jest json');
    expect(wynik.issues.length).toBeGreaterThan(0);
    expect(wynik.document.nodes).toEqual([]);
  });

  it('projekt bez diagramów daje uwagę', () => {
    const wynik = umlProjectFormat.parse(JSON.stringify({ type: 'uml-project', diagrams: [] }));
    expect(wynik.issues.some((i) => /diagram/i.test(i.message))).toBe(true);
  });
});

describe('zapis', () => {
  it('oddaje historię i metadane nietknięte', () => {
    // Bez tego pierwsza poprawka w notatce kasowałaby historię projektu.
    const zapis = JSON.parse(umlProjectFormat.serialize(umlProjectFormat.parse(TEKST).document));

    expect(zapis.history).toEqual(PROJEKT.history);
    expect(zapis.name).toBe('Zwierzęta');
    expect(zapis.linkedPath).toBe(PROJEKT.linkedPath);
    expect(zapis.version).toBe(2);
  });

  it('zachowuje techniczne identyfikatory węzłów', () => {
    const zapis = JSON.parse(umlProjectFormat.serialize(umlProjectFormat.parse(TEKST).document));
    expect(zapis.diagrams[0].nodes.map((n: { id: string }) => n.id).sort()).toEqual(['n1', 'n2']);
  });

  it('round-trip nie zmienia znaczenia relacji', () => {
    const zapis = JSON.parse(umlProjectFormat.serialize(umlProjectFormat.parse(TEKST).document));
    const edge = zapis.diagrams[0].edges[0];
    expect(edge.data.relType).toBe('generalization');
    expect(edge.source).toBe('n1');
    expect(edge.target).toBe('n2');
  });

  it('dwa zapisy pod rząd dają ten sam tekst', () => {
    const raz = umlProjectFormat.serialize(umlProjectFormat.parse(TEKST).document);
    const dwa = umlProjectFormat.serialize(umlProjectFormat.parse(raz).document);
    expect(dwa).toBe(raz);
  });

  it('zapisuje zmiany wprowadzone w edytorze graficznym', () => {
    const doc = umlProjectFormat.parse(TEKST).document;
    doc.nodes.push({ id: 'Kot', label: 'Kot', shape: 'rectangle', members: [] });

    const zapis = JSON.parse(umlProjectFormat.serialize(doc));
    expect(zapis.diagrams[0].nodes.map((n: { data: { name: string } }) => n.data.name)).toContain('Kot');
  });

  it('zachowuje pozostałe diagramy projektu', () => {
    // Projekt bywa wielodiagramowy; blok pokazuje pierwszy, ale reszta ma zostać.
    const wieleDiagramow = {
      ...PROJEKT,
      diagrams: [PROJEKT.diagrams[0], { id: 'd2', name: 'Drugi', nodes: [], edges: [] }],
    };
    const doc = umlProjectFormat.parse(JSON.stringify(wieleDiagramow)).document;

    const zapis = JSON.parse(umlProjectFormat.serialize(doc));
    expect(zapis.diagrams).toHaveLength(2);
    expect(zapis.diagrams[1].name).toBe('Drugi');
  });

  it('dokument spoza projektu zapisuje się jako świeży projekt', () => {
    // Blok mógł zacząć życie jako pusty i dopiero potem dostać klasy.
    const { document } = umlProjectFormat.parse('{"type":"uml-project","diagrams":[]}');
    document.nodes.push({ id: 'A', label: 'A', shape: 'rectangle', members: [] });

    const zapis = JSON.parse(umlProjectFormat.serialize(document));
    expect(zapis.type).toBe('uml-project');
    expect(zapis.diagrams[0].nodes).toHaveLength(1);
  });
});
