/**
 * PlantUML ⇄ model diagramu klas.
 *
 * Po co: PlantUML dominuje tam, gdzie Mermaida nie ma — Confluence, IntelliJ,
 * dokumentacja firmowa. Diagram klas z takiego źródła da się dziś wkleić do
 * notatki wyłącznie jako tekst; po tym adapterze da się go obejrzeć, poprawić
 * graficznie i zapisać z powrotem w PlantUML-u.
 *
 * Obsługujemy **diagram klas i nic więcej**. PlantUML ma kilkanaście rodzajów
 * diagramów o zupełnie różnych składniach (activity, komponentów, stanów,
 * przypadków użycia); udawanie, że rozumiemy je wszystkie, skończyłoby się tym
 * samym, co domyślanie się flowchartu w Mermaidzie — cichym psuciem cudzej
 * pracy. Reszta dostaje jawną odmowę.
 */
import { describe, it, expect } from 'vitest';
import { plantUmlFormat } from './index';
import { diagramFormats } from '../../model/format';
import '../../index';

const KLASY = [
  '@startuml',
  'abstract class Zwierze {',
  '  #imie: String',
  '  +{abstract} glos(): String',
  '}',
  'class Pies {',
  '  +glos(): String',
  '  -{static} licznik: int',
  '}',
  'interface Karmiciel',
  'Zwierze <|-- Pies',
  'Karmiciel <|.. Pies',
  'Pies "1" --> "0..*" Miska : ma',
  '@enduml',
].join('\n');

describe('rozpoznawanie', () => {
  it('rozpoznaje diagram klas', () => {
    expect(plantUmlFormat.detect(KLASY)).toBeGreaterThan(0.8);
  });

  it('rozpoznaje też zapis bez @startuml', () => {
    // Fragment wklejony ze środka dokumentu bywa bez obudowy.
    expect(plantUmlFormat.detect('class A {\n  +x: int\n}\nA <|-- B')).toBeGreaterThan(0.5);
  });

  it('nie zgłasza się do Mermaida', () => {
    expect(plantUmlFormat.detect('classDiagram\n  class A')).toBe(0);
    expect(plantUmlFormat.detect('flowchart TB\n  A --> B')).toBe(0);
  });

  it('rejestr wybiera go dla PlantUML-a, a Mermaida dla Mermaida', () => {
    expect(diagramFormats.detect(KLASY)?.id).toBe('plantuml');
    expect(diagramFormats.detect('classDiagram\n  class A')?.id).toBe('mermaid');
  });
});

describe('odczyt diagramu klas', () => {
  const { document } = plantUmlFormat.parse(KLASY);

  it('czyta klasy i interfejsy', () => {
    expect(document.kind).toBe('class');
    expect(document.nodes.map((n) => n.id).sort()).toEqual(['Karmiciel', 'Miska', 'Pies', 'Zwierze']);
  });

  it('czyta stereotypy z rodzaju deklaracji', () => {
    expect(document.nodes.find((n) => n.id === 'Zwierze')?.stereotype).toBe('abstract');
    expect(document.nodes.find((n) => n.id === 'Karmiciel')?.stereotype).toBe('interface');
    expect(document.nodes.find((n) => n.id === 'Pies')?.stereotype).toBeUndefined();
  });

  it('czyta składowe z widocznością i typem', () => {
    const zwierze = document.nodes.find((n) => n.id === 'Zwierze');
    const pole = zwierze?.members?.find((m) => m.name === 'imie');
    expect(pole?.visibility).toBe('protected');
    expect(pole?.type).toBe('String');
    expect(pole?.kind).toBe('field');
  });

  it('czyta modyfikatory `{static}` i `{abstract}`', () => {
    const metoda = document.nodes.find((n) => n.id === 'Zwierze')?.members?.find((m) => m.name === 'glos');
    expect(metoda?.isAbstract).toBe(true);
    expect(metoda?.kind).toBe('method');

    const licznik = document.nodes.find((n) => n.id === 'Pies')?.members?.find((m) => m.name === 'licznik');
    expect(licznik?.isStatic).toBe(true);
    expect(licznik?.visibility).toBe('private');
  });

  it('czyta rodzaje relacji', () => {
    const dziedziczenie = document.edges.find((e) => e.source === 'Zwierze' && e.target === 'Pies');
    expect(dziedziczenie?.relation).toBe('inheritance');

    const realizacja = document.edges.find((e) => e.source === 'Karmiciel' && e.target === 'Pies');
    expect(realizacja?.relation).toBe('realization');

    const asocjacja = document.edges.find((e) => e.source === 'Pies' && e.target === 'Miska');
    expect(asocjacja?.relation).toBe('association');
    expect(asocjacja?.label).toBe('ma');
  });

  it('czyta krotności po obu stronach', () => {
    const edge = document.edges.find((e) => e.target === 'Miska');
    expect(edge?.sourceLabel).toBe('1');
    expect(edge?.targetLabel).toBe('0..*');
  });

  it('czyta kompozycję i agregację', () => {
    const { document: doc } = plantUmlFormat.parse('@startuml\nAuto *-- Silnik\nZespol o-- Osoba\n@enduml');
    expect(doc.edges[0].relation).toBe('composition');
    expect(doc.edges[1].relation).toBe('aggregation');
  });

  it('czyta zależność', () => {
    const { document: doc } = plantUmlFormat.parse('@startuml\nA ..> B\n@enduml');
    expect(doc.edges[0].relation).toBe('dependency');
  });

  it('czyta pakiet jako grupę', () => {
    const zPakietem = [
      '@startuml',
      'package "Warstwa danych" {',
      '  class Baza',
      '}',
      'class App',
      '@enduml',
    ].join('\n');
    const { document: doc } = plantUmlFormat.parse(zPakietem);

    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0].label).toBe('Warstwa danych');
    expect(doc.nodes.find((n) => n.id === 'Baza')?.parentId).toBe(doc.groups[0].id);
    expect(doc.nodes.find((n) => n.id === 'App')?.parentId).toBeUndefined();
  });

  it('zachowuje nierozpoznane linie', () => {
    // `skinparam` i noty to rzeczy, których nie rysujemy, ale które muszą wrócić.
    const { document: doc } = plantUmlFormat.parse('@startuml\nskinparam monochrome true\nclass A\n@enduml');
    expect(doc.unknown.some((u) => u.text.includes('skinparam'))).toBe(true);
  });
});

describe('rodzaje diagramów, których nie obsługujemy', () => {
  const PRZYPADKI: Array<[string, string]> = [
    ['sekwencji', '@startuml\nAlice -> Bob: pytanie\nBob --> Alice: odpowiedź\n@enduml'],
    ['czynności', '@startuml\nstart\n:krok pierwszy;\n:krok drugi;\nstop\n@enduml'],
    ['stanów', '@startuml\n[*] --> Praca\nPraca --> [*]\n@enduml'],
    ['przypadków użycia', '@startuml\nactor Klient\nusecase "Złóż zamówienie" as UC1\nKlient --> UC1\n@enduml'],
  ];

  for (const [nazwa, źródło] of PRZYPADKI) {
    it(`diagram ${nazwa} dostaje jawną odmowę zamiast domysłu`, () => {
      const { document, issues } = plantUmlFormat.parse(źródło);
      expect(document.unsupported).toBeTruthy();
      expect(issues.length).toBeGreaterThan(0);
      expect(document.nodes).toHaveLength(0);
    });

    it(`zapis diagramu ${nazwa} oddaje źródło bez zmian`, () => {
      const { document } = plantUmlFormat.parse(źródło);
      expect(plantUmlFormat.serialize(document)).toBe(źródło);
    });
  }
});

describe('zapis', () => {
  it('round-trip zachowuje klasy, składowe i relacje', () => {
    const wrocil = plantUmlFormat.parse(plantUmlFormat.serialize(plantUmlFormat.parse(KLASY).document)).document;

    expect(wrocil.nodes.map((n) => n.id).sort()).toEqual(['Karmiciel', 'Miska', 'Pies', 'Zwierze']);
    expect(wrocil.nodes.find((n) => n.id === 'Zwierze')?.stereotype).toBe('abstract');
    expect(wrocil.edges.find((e) => e.source === 'Zwierze')?.relation).toBe('inheritance');
    expect(wrocil.nodes.find((n) => n.id === 'Pies')?.members?.map((m) => m.name).sort())
      .toEqual(['glos', 'licznik']);
  });

  it('dwa zapisy pod rząd dają ten sam tekst', () => {
    const raz = plantUmlFormat.serialize(plantUmlFormat.parse(KLASY).document);
    const dwa = plantUmlFormat.serialize(plantUmlFormat.parse(raz).document);
    expect(dwa).toBe(raz);
  });

  it('obudowuje zapis znacznikami', () => {
    const zapis = plantUmlFormat.serialize(plantUmlFormat.parse(KLASY).document);
    expect(zapis.startsWith('@startuml')).toBe(true);
    expect(zapis.trimEnd().endsWith('@enduml')).toBe(true);
  });

  it('krotności wracają na swoje strony', () => {
    const zapis = plantUmlFormat.serialize(plantUmlFormat.parse(KLASY).document);
    expect(zapis).toContain('Pies "1" --> "0..*" Miska : ma');
  });

  it('nierozpoznane linie wracają do zapisu', () => {
    const doc = plantUmlFormat.parse('@startuml\nskinparam monochrome true\nclass A\n@enduml').document;
    expect(plantUmlFormat.serialize(doc)).toContain('skinparam monochrome true');
  });

  it('diagram Mermaida da się zapisać jako PlantUML', () => {
    // To jest właściwy powód, dla którego adapter działa w obie strony:
    // przeniesienie diagramu tam, gdzie czyta go cudze narzędzie.
    const mermaid = ['classDiagram', '  class A {', '    +x() int', '  }', '  A <|-- B'].join('\n');
    const doc = diagramFormats.get('mermaid')!.parse(mermaid).document;

    const zapis = plantUmlFormat.serialize(doc);
    expect(zapis).toContain('class A');
    expect(zapis).toContain('A <|-- B');
  });
});
