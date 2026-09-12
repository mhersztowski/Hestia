/**
 * DOT (Graphviz) ⇄ model diagramu.
 *
 * Po co akurat ten format: **mnóstwo narzędzi go pluje**. Profilery, `pydeps`,
 * `cargo-depgraph`, `madge`, `dot` z kompilatorów — wszystkie zapisują graf
 * w DOT-cie i żadne nie zapisuje go w Mermaidzie. Bez tego adaptera taki plik
 * trzeba przepisywać ręcznie, żeby cokolwiek z nim zrobić w notatce.
 *
 * Zapis robimy również, choć w przeglądzie planowaliśmy „import tylko".
 * Uzasadnienie tamtej decyzji brzmiało: eksport do formatu, którego nie umiemy
 * zaimportować, jest ślepą uliczką. Tutaj umiemy — więc symetria jest darmowa,
 * a bez niej blok z DOT-em byłby jedynym, którego nie da się edytować graficznie.
 */
import { describe, it, expect } from 'vitest';
import { dotFormat } from './index';
import { diagramFormats } from '../../model/format';
import '../../index';

const PROSTY = [
  'digraph G {',
  '  rankdir=LR;',
  '  A [label="Start", shape=box];',
  '  B [shape=diamond, label="Decyzja"];',
  '  A -> B [label="dalej"];',
  '  B -> C;',
  '}',
].join('\n');

describe('rozpoznawanie', () => {
  it('rozpoznaje graf skierowany i nieskierowany', () => {
    expect(dotFormat.detect(PROSTY)).toBeGreaterThan(0.8);
    expect(dotFormat.detect('graph X { A -- B }')).toBeGreaterThan(0.8);
    expect(dotFormat.detect('strict digraph { A -> B }')).toBeGreaterThan(0.8);
  });

  it('nie zgłasza się do Mermaida ani do JSON-a', () => {
    expect(dotFormat.detect('flowchart TB\n  A --> B')).toBe(0);
    expect(dotFormat.detect('{"type":"uml-project"}')).toBe(0);
  });

  it('rejestr wybiera go dla DOT-a', () => {
    expect(diagramFormats.detect(PROSTY)?.id).toBe('dot');
  });
});

describe('odczyt', () => {
  const { document } = dotFormat.parse(PROSTY);

  it('czyta kierunek układu', () => {
    expect(document.direction).toBe('LR');
    expect(dotFormat.parse('digraph { rankdir=TB; A -> B }').document.direction).toBe('TB');
  });

  it('czyta węzły z etykietą i kształtem', () => {
    const a = document.nodes.find((n) => n.id === 'A');
    expect(a?.label).toBe('Start');
    expect(a?.shape).toBe('rectangle');
    expect(document.nodes.find((n) => n.id === 'B')?.shape).toBe('rhombus');
  });

  it('zakłada węzeł wspomniany tylko w krawędzi', () => {
    expect(document.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C']);
  });

  it('czyta krawędzie z etykietą', () => {
    const edge = document.edges.find((e) => e.source === 'A' && e.target === 'B');
    expect(edge?.label).toBe('dalej');
    expect(edge?.arrow).toBe('arrow');
  });

  it('graf nieskierowany daje krawędzie bez grotu', () => {
    const { document: doc } = dotFormat.parse('graph G {\n  A -- B;\n}');
    expect(doc.edges[0].arrow).toBe('none');
  });

  it('czyta styl linii', () => {
    const { document: doc } = dotFormat.parse('digraph { A -> B [style=dashed]; B -> C [style=bold]; }');
    expect(doc.edges[0].lineStyle).toBe('dotted');
    expect(doc.edges[1].lineStyle).toBe('thick');
  });

  it('czyta klaster jako grupę', () => {
    const zKlastrem = [
      'digraph {',
      '  subgraph cluster_dane {',
      '    label="Warstwa danych";',
      '    Baza; Cache;',
      '  }',
      '  App -> Baza;',
      '}',
    ].join('\n');
    const { document: doc } = dotFormat.parse(zKlastrem);

    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0].label).toBe('Warstwa danych');
    expect(doc.nodes.find((n) => n.id === 'Baza')?.parentId).toBe(doc.groups[0].id);
    expect(doc.nodes.find((n) => n.id === 'App')?.parentId).toBeUndefined();
  });

  it('etykieta w cudzysłowie może zawierać przecinki i nawiasy', () => {
    const { document: doc } = dotFormat.parse('digraph { A [label="Kawa, herbata (obie)"]; }');
    expect(doc.nodes[0].label).toBe('Kawa, herbata (obie)');
  });

  it('identyfikator w cudzysłowie działa jak zwykły', () => {
    const { document: doc } = dotFormat.parse('digraph { "Węzeł A" -> "Węzeł B"; }');
    expect(doc.nodes.map((n) => n.id)).toEqual(['Węzeł A', 'Węzeł B']);
  });

  it('pomija komentarze', () => {
    const zKomentarzem = [
      'digraph {',
      '  // to jest komentarz',
      '  # i to też',
      '  A -> B;',
      '}',
    ].join('\n');
    expect(dotFormat.parse(zKomentarzem).document.edges).toHaveLength(1);
  });

  it('nierozpoznane linie zachowuje zamiast je kasować', () => {
    // Ta sama zasada, co w Mermaidzie: czego nie rozumiemy, oddajemy nietknięte.
    const { document: doc } = dotFormat.parse('digraph {\n  node [fontname="Arial"];\n  A -> B;\n}');
    expect(doc.unknown.some((u) => u.text.includes('fontname'))).toBe(true);
  });
});

describe('zapis', () => {
  it('round-trip zachowuje węzły, kształty i krawędzie', () => {
    const wrocil = dotFormat.parse(dotFormat.serialize(dotFormat.parse(PROSTY).document)).document;

    expect(wrocil.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C']);
    expect(wrocil.nodes.find((n) => n.id === 'A')?.label).toBe('Start');
    expect(wrocil.nodes.find((n) => n.id === 'B')?.shape).toBe('rhombus');
    expect(wrocil.edges.find((e) => e.source === 'A')?.label).toBe('dalej');
    expect(wrocil.direction).toBe('LR');
  });

  it('dwa zapisy pod rząd dają ten sam tekst', () => {
    const raz = dotFormat.serialize(dotFormat.parse(PROSTY).document);
    const dwa = dotFormat.serialize(dotFormat.parse(raz).document);
    expect(dwa).toBe(raz);
  });

  it('nierozpoznane linie wracają do zapisu', () => {
    const zNieznanym = 'digraph {\n  node [fontname="Arial"];\n  A -> B;\n}';
    expect(dotFormat.serialize(dotFormat.parse(zNieznanym).document)).toContain('fontname');
  });

  it('cytuje identyfikatory, które tego wymagają', () => {
    const { document: doc } = dotFormat.parse('digraph { "Węzeł A" -> B; }');
    const zapis = dotFormat.serialize(doc);
    expect(zapis).toContain('"Węzeł A"');
  });

  it('zapisuje klaster razem z jego węzłami', () => {
    const zKlastrem = 'digraph {\n  subgraph cluster_a {\n    label="Grupa";\n    X;\n  }\n}';
    const zapis = dotFormat.serialize(dotFormat.parse(zKlastrem).document);

    expect(zapis).toContain('subgraph cluster_');
    expect(zapis).toContain('label="Grupa"');
    expect(zapis).toContain('X');
  });

  it('graf nieskierowany zapisuje się jako graph z `--`', () => {
    const doc = dotFormat.parse('graph { A -- B }').document;
    const zapis = dotFormat.serialize(doc);
    expect(zapis.startsWith('graph')).toBe(true);
    expect(zapis).toContain('A -- B');
  });
});

describe('DOT z narzędzi zewnętrznych', () => {
  it('czyta graf zależności w kształcie, jaki daje `madge`', () => {
    const madge = [
      'digraph G {',
      '  overlap=false;',
      '  "src/index.ts" -> "src/model.ts";',
      '  "src/index.ts" -> "src/view.ts";',
      '  "src/view.ts" -> "src/model.ts";',
      '}',
    ].join('\n');
    const { document: doc } = dotFormat.parse(madge);

    expect(doc.nodes).toHaveLength(3);
    expect(doc.edges).toHaveLength(3);
    // `overlap=false` to ustawienie układu — nie rozumiemy go, więc zostaje.
    expect(doc.unknown.some((u) => u.text.includes('overlap'))).toBe(true);
  });

  it('kilka krawędzi w jednej linii rozwija się na osobne', () => {
    // `A -> B -> C` znaczy dwa odcinki; Graphviz to dopuszcza.
    const { document: doc } = dotFormat.parse('digraph { A -> B -> C; }');
    expect(doc.edges.map((e) => `${e.source}->${e.target}`)).toEqual(['A->B', 'B->C']);
  });
});
