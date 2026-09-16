/**
 * Most między projektem UML a modelem diagramu.
 *
 * `@hestia/node-devtools` parsuje TypeScript, Python i C++ do `CodeModel`,
 * a backend wystawia to jako `POST /api/users/{u}/uml/sync` zwracające
 * `UmlProject`. Cała droga „wskaż pliki → dostań diagram klas" jest zbudowana
 * i przetestowana — brakowało wyłącznie tłumaczenia między dwoma kształtami
 * tego samego pojęcia.
 *
 * Najważniejsze w tym tłumaczeniu jest **kierunek relacji**. Oba modele mają
 * `source` i `target`, ale znaczą nimi co innego:
 *
 *   • UML: `generalization` idzie od podklasy do nadklasy (trójkąt na końcu),
 *   • model diagramu: `inheritance` ma nadklasę po stronie `from`.
 *
 * Pomylenie tego nie kończy się błędem, tylko diagramem, na którym dziedziczenie
 * jest odwrócone — a to widać dopiero, gdy ktoś go przeczyta.
 */
import { describe, it, expect } from 'vitest';
import { umlDiagramToDocument, documentToUmlDiagram, type UmlDiagramLike } from './umlProject';
import { emptyDiagram } from '../../model/diagram';

const DIAGRAM: UmlDiagramLike = {
  id: 'd1',
  name: 'Model',
  nodes: [
    {
      id: 'n:Zwierze',
      type: 'umlClass',
      position: { x: 40, y: 20 },
      data: {
        kind: 'abstract',
        name: 'Zwierze',
        members: [
          { id: 'm1', kind: 'field', text: '- imie: string' },
          { id: 'm2', kind: 'method', text: '+ glos(): string' },
        ],
        linkedFile: 'src/Zwierze.ts',
      },
    },
    {
      id: 'n:Pies',
      type: 'umlClass',
      position: { x: 40, y: 220 },
      data: {
        kind: 'class',
        name: 'Pies',
        members: [{ id: 'm3', kind: 'method', text: '+ glos(): string' }],
      },
    },
    {
      id: 'n:Karmiciel',
      type: 'umlClass',
      position: { x: 300, y: 220 },
      data: { kind: 'interface', name: 'Karmiciel', members: [] },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'n:Pies',
      target: 'n:Zwierze',
      type: 'uml',
      data: { relType: 'generalization' },
    },
    {
      id: 'e2',
      source: 'n:Pies',
      target: 'n:Karmiciel',
      type: 'uml',
      data: { relType: 'realization' },
    },
    {
      id: 'e3',
      source: 'n:Karmiciel',
      target: 'n:Pies',
      type: 'uml',
      data: { relType: 'directed', label: 'karmi' },
    },
  ],
};

describe('umlDiagramToDocument', () => {
  const doc = umlDiagramToDocument(DIAGRAM);

  it('robi diagram klas', () => {
    expect(doc.kind).toBe('class');
    expect(doc.title).toBe('Model');
  });

  it('identyfikatorem węzła jest nazwa klasy, nie techniczne id', () => {
    // W diagramie klas identyfikator jest tym, co widać i czym posługują się
    // krawędzie — `n:Pies` byłoby zapisem, którego nikt nie chce czytać.
    expect(doc.nodes.map((n) => n.id).sort()).toEqual(['Karmiciel', 'Pies', 'Zwierze']);
  });

  it('przenosi układ', () => {
    expect(doc.nodes.find((n) => n.id === 'Zwierze')?.position).toEqual({ x: 40, y: 20 });
  });

  it('zamienia rodzaj klasy na stereotyp', () => {
    expect(doc.nodes.find((n) => n.id === 'Karmiciel')?.stereotype).toBe('interface');
    expect(doc.nodes.find((n) => n.id === 'Zwierze')?.stereotype).toBe('abstract');
    // Zwykła klasa nie dostaje stereotypu — inaczej każdy diagram byłby nim
    // upstrzony bez powodu.
    expect(doc.nodes.find((n) => n.id === 'Pies')?.stereotype).toBeUndefined();
  });

  it('przenosi składowe razem z rozbiorem na widoczność i typ', () => {
    const zwierze = doc.nodes.find((n) => n.id === 'Zwierze');
    expect(zwierze?.members).toHaveLength(2);

    const pole = zwierze?.members?.[0];
    expect(pole?.kind).toBe('field');
    expect(pole?.visibility).toBe('private');
    expect(pole?.name).toBe('imie');
    expect(pole?.type).toBe('string');

    const metoda = zwierze?.members?.[1];
    expect(metoda?.kind).toBe('method');
    expect(metoda?.visibility).toBe('public');
    expect(metoda?.name).toBe('glos');
  });

  it('odwraca dziedziczenie: nadklasa staje się źródłem', () => {
    // UML: `Pies --▷ Zwierze`. Model diagramu: nadklasa po stronie `from`.
    const edge = doc.edges.find((e) => e.relation === 'inheritance');
    expect(edge?.source).toBe('Zwierze');
    expect(edge?.target).toBe('Pies');
  });

  it('odwraca implementację tak samo jak dziedziczenie', () => {
    const edge = doc.edges.find((e) => e.relation === 'realization');
    expect(edge?.source).toBe('Karmiciel');
    expect(edge?.target).toBe('Pies');
  });

  it('nie odwraca relacji, które w obu modelach znaczą to samo', () => {
    const edge = doc.edges.find((e) => e.relation === 'association');
    expect(edge?.source).toBe('Karmiciel');
    expect(edge?.target).toBe('Pies');
    expect(edge?.label).toBe('karmi');
  });

  it('zapamiętuje plik źródłowy klasy', () => {
    expect(doc.nodes.find((n) => n.id === 'Zwierze')?.meta?.file).toBe('src/Zwierze.ts');
  });

  it('krawędź do klasy spoza diagramu jest pomijana, a nie osierocona', () => {
    // Osierocona krawędź psuje każdy format zapisu i wywraca układ.
    const zObcym: UmlDiagramLike = {
      ...DIAGRAM,
      edges: [
        ...DIAGRAM.edges,
        {
          id: 'e9',
          source: 'n:Pies',
          target: 'n:Nieznany',
          type: 'uml',
          data: { relType: 'association' },
        },
      ],
    };
    const wynik = umlDiagramToDocument(zObcym);
    expect(wynik.edges).toHaveLength(3);
  });
});

describe('documentToUmlDiagram', () => {
  it('wraca do UML-a bez zmiany znaczenia', () => {
    const wrocil = documentToUmlDiagram(umlDiagramToDocument(DIAGRAM), DIAGRAM);

    const dziedziczenie = wrocil.edges.find((e) => e.data.relType === 'generalization');
    expect(dziedziczenie?.source).toBe('n:Pies');
    expect(dziedziczenie?.target).toBe('n:Zwierze');
  });

  it('round-trip zachowuje klasy, składowe i układ', () => {
    const wrocil = documentToUmlDiagram(umlDiagramToDocument(DIAGRAM), DIAGRAM);

    expect(wrocil.nodes.map((n) => n.data.name).sort()).toEqual(['Karmiciel', 'Pies', 'Zwierze']);
    const zwierze = wrocil.nodes.find((n) => n.data.name === 'Zwierze');
    expect(zwierze?.position).toEqual({ x: 40, y: 20 });
    // Zapis ze spacją po znaku widoczności — taki generuje `renderMember`
    // w `devtools`, więc odświeżenie z kodu nie pokaże różnicy tam, gdzie
    // niczego nie zmieniono.
    expect(zwierze?.data.members.map((m) => m.text)).toEqual([
      '- imie: string',
      '+ glos(): string',
    ]);
  });

  it('zachowuje techniczne identyfikatory z poprzedniej wersji', () => {
    // Bez tego każde odświeżenie z kodu zmieniałoby wszystkie id, więc historia
    // projektu UML pokazywałaby „usunięto wszystko, dodano wszystko".
    const wrocil = documentToUmlDiagram(umlDiagramToDocument(DIAGRAM), DIAGRAM);
    expect(wrocil.nodes.map((n) => n.id).sort()).toEqual(['n:Karmiciel', 'n:Pies', 'n:Zwierze']);
  });

  it('zachowuje dokumentację, której model diagramu nie niesie', () => {
    // `DocMeta` z TSDoc nie ma odpowiednika w składni diagramu klas. Zamiast ją
    // gubić przy każdej edycji graficznej, przepisujemy ją z poprzedniej wersji.
    const zDokumentacja: UmlDiagramLike = {
      ...DIAGRAM,
      nodes: DIAGRAM.nodes.map((n) =>
        n.data.name === 'Pies' ? { ...n, data: { ...n.data, doc: { summary: 'Pies domowy' } } } : n
      ),
    };
    const wrocil = documentToUmlDiagram(umlDiagramToDocument(zDokumentacja), zDokumentacja);
    expect(wrocil.nodes.find((n) => n.data.name === 'Pies')?.data.doc?.summary).toBe('Pies domowy');
  });

  it('nowa klasa dorysowana w edytorze dostaje własne id', () => {
    const doc = umlDiagramToDocument(DIAGRAM);
    doc.nodes.push({ id: 'Kot', label: 'Kot', shape: 'rectangle', members: [] });

    const wrocil = documentToUmlDiagram(doc, DIAGRAM);
    const kot = wrocil.nodes.find((n) => n.data.name === 'Kot');
    expect(kot).toBeTruthy();
    expect(kot?.id).not.toBe('');
    expect(wrocil.nodes.map((n) => n.id)).toHaveLength(4);
  });

  it('działa bez poprzedniej wersji', () => {
    const doc = emptyDiagram('class');
    doc.nodes.push({ id: 'Sam', label: 'Sam', shape: 'rectangle', members: [] });

    const wrocil = documentToUmlDiagram(doc);
    expect(wrocil.nodes).toHaveLength(1);
    expect(wrocil.nodes[0].data.name).toBe('Sam');
  });
});

describe('rodzaje relacji w obie strony', () => {
  const PARY: Array<[uml: string, model: string]> = [
    ['generalization', 'inheritance'],
    ['realization', 'realization'],
    ['composition', 'composition'],
    ['aggregation', 'aggregation'],
    ['directed', 'association'],
    ['association', 'link'],
    ['dependency', 'dependency'],
  ];

  for (const [uml, model] of PARY) {
    it(`${uml} ⇄ ${model}`, () => {
      const wejscie: UmlDiagramLike = {
        id: 'd',
        name: 'T',
        nodes: [
          {
            id: 'a',
            type: 'umlClass',
            position: { x: 0, y: 0 },
            data: { kind: 'class', name: 'A', members: [] },
          },
          {
            id: 'b',
            type: 'umlClass',
            position: { x: 0, y: 0 },
            data: { kind: 'class', name: 'B', members: [] },
          },
        ],
        edges: [
          { id: 'e', source: 'a', target: 'b', type: 'uml', data: { relType: uml as never } },
        ],
      };

      const doc = umlDiagramToDocument(wejscie);
      expect(doc.edges[0].relation).toBe(model);

      // Round-trip nie może zmienić ani rodzaju, ani stron.
      const wrocil = documentToUmlDiagram(doc, wejscie);
      expect(wrocil.edges[0].data.relType).toBe(uml);
      expect(wrocil.edges[0].source).toBe('a');
      expect(wrocil.edges[0].target).toBe('b');
    });
  }
});
