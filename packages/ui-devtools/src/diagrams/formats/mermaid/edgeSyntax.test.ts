/**
 * Pełna składnia krawędzi Mermaida.
 *
 * Realny plik użytkownika ujawnił, że parser radzi sobie tylko z podstawowymi
 * strzałkami. Reszta trafiała do „nierozpoznanych", a przy zapisie wracała na
 * koniec pliku — diagram przestawał się renderować. Gorzej: `A5 -...-> A6`
 * tworzyło węzeł o identyfikatorze `..-`, czyli parser wymyślał treść, której
 * w źródle nie było.
 *
 * Zasada: albo rozumiemy linię w całości, albo zostawiamy ją nietkniętą.
 * Nigdy pomiędzy.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from './index';

const parse = (text: string) => mermaidFormat.parse(`flowchart TB\n  ${text}`).document;
const edgesOf = (text: string) => parse(text).edges;
const idsOf = (text: string) => parse(text).nodes.map((n) => n.id);

describe('zakończenia i style linii', () => {
  it.each([
    ['A --> B', 'solid', 'arrow'],
    ['A --- B', 'solid', 'none'],
    ['A -.-> B', 'dotted', 'arrow'],
    ['A -.- B', 'dotted', 'none'],
    ['A ==> B', 'thick', 'arrow'],
    ['A --o B', 'solid', 'circle'],
    ['A --x B', 'solid', 'cross'],
  ])('%s', (source, lineStyle, arrow) => {
    expect(edgesOf(source)[0]).toMatchObject({ lineStyle, arrow });
  });

  it('dłuższa strzałka (`---->`) to nadal jedna krawędź', () => {
    const edges = edgesOf('A ----> B');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ arrow: 'arrow' });
  });

  it('dłuższe kropki (`-...->`) nie tworzą węzła-potwora', () => {
    expect(idsOf('A -...-> B')).toEqual(['A', 'B']);
    expect(edgesOf('A -...-> B')[0]).toMatchObject({ lineStyle: 'dotted', arrow: 'arrow' });
  });

  it('link niewidzialny (`~~~`) jest krawędzią bez linii', () => {
    const edges = edgesOf('A ~~~ B');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ arrow: 'none' });
  });
});

describe('etykiety w operatorze', () => {
  it('`--tekst-->` czyta etykietę', () => {
    expect(edgesOf('A --Etykieta--> B')[0]).toMatchObject({ label: 'Etykieta', arrow: 'arrow' });
  });

  it('`-. tekst .->` czyta etykietę i styl kropkowany', () => {
    expect(edgesOf('A -. kropki z tekstem .-> B')[0])
      .toMatchObject({ label: 'kropki z tekstem', lineStyle: 'dotted' });
  });

  it('`== tekst ==>` czyta etykietę i grubą linię', () => {
    expect(edgesOf('A == grube ==> B')[0]).toMatchObject({ label: 'grube', lineStyle: 'thick' });
  });

  it('etykieta w pionowych kreskach nadal działa', () => {
    expect(edgesOf('A -->|Etykieta inaczej| B')[0]).toMatchObject({ label: 'Etykieta inaczej' });
  });
});

describe('zakończenia po obu stronach', () => {
  it.each([
    ['A <--> B', 'arrow'],
    ['A o--o B', 'circle'],
    ['A x--x B', 'cross'],
  ])('%s ma zakończenie także u źródła', (source, arrow) => {
    const edge = edgesOf(source)[0];
    expect(edge).toMatchObject({ arrow });
    expect(edge.meta?.startArrow).toBe(arrow);
  });

  it('węzły z obu stron powstają normalnie', () => {
    expect(idsOf('N <--> A2[Dwukierunkowa]')).toEqual(['N', 'A2']);
  });
});

describe('łańcuchy', () => {
  it('`A --> B --> C` daje dwie krawędzie i trzy węzły', () => {
    expect(idsOf('Q1[Start] --> Q2[Krok] --> Q3[Koniec]')).toEqual(['Q1', 'Q2', 'Q3']);
    expect(edgesOf('Q1[Start] --> Q2[Krok] --> Q3[Koniec]').map((e) => `${e.source}->${e.target}`))
      .toEqual(['Q1->Q2', 'Q2->Q3']);
  });

  it('etykiety w łańcuchu trafiają na właściwe odcinki', () => {
    const edges = edgesOf('A --pierwsza--> B --druga--> C');
    expect(edges.map((e) => e.label)).toEqual(['pierwsza', 'druga']);
  });
});

describe('kształty pominięte wcześniej', () => {
  it('potrójne nawiasy to podwójny okrąg', () => {
    expect(parse('N(((Podwójny okrąg)))').nodes[0])
      .toMatchObject({ shape: 'doubleCircle', label: 'Podwójny okrąg' });
  });
});
