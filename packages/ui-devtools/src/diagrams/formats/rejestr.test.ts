/**
 * Rejestr formatów z czterema adapterami.
 *
 * Rozpoznawanie oparte jest na ocenie pewności, a nie na pierwszym pasującym
 * adapterze — i dopiero przy czterech formatach naraz widać, czy ta ocena jest
 * ustawiona rozsądnie. Zawyżona pewność jednego odbiera tekst właściwemu, a to
 * kończy się cichym psuciem cudzej pracy: diagram wygląda inaczej, niż go
 * napisano, i nikt nie protestuje.
 *
 * Ten plik jest **jedną suitą uruchamianą na wszystkich formatach**, więc
 * rozjazd między nimi wychodzi natychmiast — ta sama zasada, co w
 * `core-cad-viewer/scene-api/kontrakt.ts`.
 */
import { describe, it, expect } from 'vitest';
import { diagramFormats } from '../model/format';
import '../index';

const PRZYKLADY: Array<[format: string, opis: string, źródło: string]> = [
  ['mermaid', 'flowchart', 'flowchart TB\n  A[Start] --> B[Koniec]'],
  ['mermaid', 'diagram klas', 'classDiagram\n  class A {\n    +x() int\n  }'],
  ['mermaid', 'diagram stanów', 'stateDiagram-v2\n  [*] --> Praca'],
  ['mermaid', 'sekwencja', 'sequenceDiagram\n  A ->> B: cześć'],
  ['dot', 'graf skierowany', 'digraph G {\n  A -> B;\n}'],
  ['dot', 'graf nieskierowany', 'graph G {\n  A -- B;\n}'],
  ['plantuml', 'diagram klas', '@startuml\nclass A\nA <|-- B\n@enduml'],
  ['umlproj', 'projekt UML', '{"type":"uml-project","version":2,"diagrams":[]}'],
];

describe('rozpoznawanie formatu', () => {
  for (const [format, opis, źródło] of PRZYKLADY) {
    it(`${opis} → ${format}`, () => {
      expect(diagramFormats.detect(źródło)?.id).toBe(format);
    });
  }

  it('każdy format zna swoją nazwę i obsługiwane rodzaje', () => {
    for (const format of diagramFormats.list()) {
      expect(format.label.length).toBeGreaterThan(0);
      expect(format.kinds.length).toBeGreaterThan(0);
    }
  });

  it('tekst, który nie jest żadnym diagramem, nie znajduje formatu', () => {
    for (const tekst of ['', 'zwykły akapit tekstu', '# Nagłówek markdown', 'SELECT * FROM t']) {
      expect(diagramFormats.detect(tekst)).toBeUndefined();
    }
  });
});

describe('każdy format zapisuje to, co przeczytał', () => {
  for (const [id, opis, źródło] of PRZYKLADY) {
    it(`${id}: ${opis} — drugi zapis jest identyczny z pierwszym`, () => {
      // Stabilność zapisu jest warunkiem tego, żeby edycja graficzna nie
      // produkowała różnicy w repozytorium przy każdym otwarciu bloku.
      const format = diagramFormats.get(id)!;
      const raz = format.serialize(format.parse(źródło).document);
      const dwa = format.serialize(format.parse(raz).document);
      expect(dwa).toBe(raz);
    });
  }
});

describe('przenoszenie diagramu klas między formatami', () => {
  /** Ten sam diagram klas zapisany w trzech składniach. */
  const MERMAID = ['classDiagram', '  class Zwierze', '  class Pies', '  Zwierze <|-- Pies'].join('\n');

  it('Mermaid → PlantUML → Mermaid zachowuje klasy i dziedziczenie', () => {
    const mermaid = diagramFormats.get('mermaid')!;
    const plantuml = diagramFormats.get('plantuml')!;

    const przez = plantuml.serialize(mermaid.parse(MERMAID).document);
    const wrocil = mermaid.parse(mermaid.serialize(plantuml.parse(przez).document)).document;

    expect(wrocil.nodes.map((n) => n.id).sort()).toEqual(['Pies', 'Zwierze']);
    const edge = wrocil.edges[0];
    expect(edge.relation).toBe('inheritance');
    expect(edge.source).toBe('Zwierze');
    expect(edge.target).toBe('Pies');
  });

  it('PlantUML → projekt UML zachowuje strony dziedziczenia', () => {
    const plantuml = diagramFormats.get('plantuml')!;
    const umlproj = diagramFormats.get('umlproj')!;

    const doc = plantuml.parse('@startuml\nclass Zwierze\nclass Pies\nZwierze <|-- Pies\n@enduml').document;
    const projekt = JSON.parse(umlproj.serialize(doc));

    const nazwy = new Map<string, string>(
      projekt.diagrams[0].nodes.map((n: { id: string; data: { name: string } }) => [n.id, n.data.name]),
    );
    const edge = projekt.diagrams[0].edges[0];
    // W projekcie UML dziedziczenie idzie od podklasy do nadklasy.
    expect(nazwy.get(edge.source)).toBe('Pies');
    expect(nazwy.get(edge.target)).toBe('Zwierze');
    expect(edge.data.relType).toBe('generalization');
  });
});

describe('graf przenosi się z DOT-a do Mermaida', () => {
  it('węzły, kształty i etykiety krawędzi przeżywają', () => {
    // To jest główny powód istnienia adaptera DOT: plik z narzędzia
    // zewnętrznego ma dać się obejrzeć i zapisać w formacie, który renderuje
    // GitHub.
    const dot = diagramFormats.get('dot')!;
    const mermaid = diagramFormats.get('mermaid')!;

    const źródło = 'digraph {\n  rankdir=LR;\n  A [label="Start", shape=diamond];\n  A -> B [label="tak"];\n}';
    const wMermaidzie = mermaid.serialize(dot.parse(źródło).document);
    const wrocil = mermaid.parse(wMermaidzie).document;

    expect(wrocil.direction).toBe('LR');
    expect(wrocil.nodes.find((n) => n.id === 'A')?.label).toBe('Start');
    expect(wrocil.nodes.find((n) => n.id === 'A')?.shape).toBe('rhombus');
    expect(wrocil.edges[0].label).toBe('tak');
  });
});
