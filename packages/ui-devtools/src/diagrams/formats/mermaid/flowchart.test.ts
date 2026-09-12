/**
 * Testy adaptera Mermaid → model → Mermaid dla diagramów `flowchart`.
 *
 * Dwie rzeczy są tu ważniejsze od kompletności składni:
 *  • **nic nie ginie** — czego adapter nie rozumie (style, `click`, komentarze),
 *    wraca przy zapisie na swoje miejsce. Edytor graficzny, który kasuje
 *    nierozpoznane linie, zjada pracę użytkownika;
 *  • **round-trip jest stabilny** — zapis tego, co sparsowane, daje tekst, który
 *    parsuje się do identycznego modelu.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from './index';

const parse = (text: string) => mermaidFormat.parse(text);
const serialize = mermaidFormat.serialize;

describe('nagłówek i kierunek', () => {
  it('czyta rodzaj i kierunek', () => {
    const doc = parse('flowchart LR\n  A --> B').document;
    expect(doc.kind).toBe('flowchart');
    expect(doc.direction).toBe('LR');
  });

  it('rozumie starą nazwę `graph`', () => {
    expect(parse('graph TD\n  A --> B').document.kind).toBe('flowchart');
  });

  it('brak kierunku daje domyślne TB', () => {
    expect(parse('flowchart\n  A --> B').document.direction).toBe('TB');
  });
});

describe('węzły i kształty', () => {
  it('wyciąga etykietę i kształt z deklaracji', () => {
    const doc = parse('flowchart TD\n  A[Start]\n  B{Decyzja}\n  C((Koniec))').document;
    expect(doc.nodes.map((n) => [n.id, n.label, n.shape])).toEqual([
      ['A', 'Start', 'rectangle'],
      ['B', 'Decyzja', 'rhombus'],
      ['C', 'Koniec', 'circle'],
    ]);
  });

  it('rozpoznaje pozostałe kształty Mermaida', () => {
    const doc = parse([
      'flowchart TD',
      '  a(zaokrąglony)',
      '  b([stadium])',
      '  c[[podprogram]]',
      '  d[(baza)]',
      '  e{{sześciokąt}}',
      '  f[/równoległobok/]',
    ].join('\n')).document;
    expect(doc.nodes.map((n) => n.shape)).toEqual([
      'rounded', 'stadium', 'subroutine', 'cylinder', 'hexagon', 'parallelogram',
    ]);
  });

  it('węzeł bez deklaracji, użyty tylko w krawędzi, też trafia do modelu', () => {
    const doc = parse('flowchart TD\n  A --> B').document;
    expect(doc.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    // Brak etykiety = rysuj samo id; nie wymyślamy tekstu za użytkownika.
    expect(doc.nodes[0].label).toBe('');
  });

  it('etykieta w cudzysłowie zachowuje znaki specjalne', () => {
    const doc = parse('flowchart TD\n  A["Tekst z [nawiasem]"]').document;
    expect(doc.nodes[0].label).toBe('Tekst z [nawiasem]');
  });
});

describe('krawędzie', () => {
  it('czyta strzałkę, styl i etykietę w pionowych kreskach', () => {
    const doc = parse('flowchart TD\n  A -->|tak| B').document;
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0]).toMatchObject({ source: 'A', target: 'B', label: 'tak', lineStyle: 'solid', arrow: 'arrow' });
  });

  it('czyta etykietę w formie `-- tekst -->`', () => {
    const doc = parse('flowchart TD\n  A -- nie --> B').document;
    expect(doc.edges[0]).toMatchObject({ label: 'nie', arrow: 'arrow' });
  });

  it('rozróżnia styl linii i zakończenie', () => {
    const doc = parse([
      'flowchart TD',
      '  A --- B',
      '  B -.-> C',
      '  C ==> D',
      '  D --o E',
      '  E --x F',
    ].join('\n')).document;
    expect(doc.edges.map((e) => [e.lineStyle, e.arrow])).toEqual([
      ['solid', 'none'],
      ['dotted', 'arrow'],
      ['thick', 'arrow'],
      ['solid', 'circle'],
      ['solid', 'cross'],
    ]);
  });

  it('deklaracja kształtu w linii krawędzi jest uwzględniana', () => {
    const doc = parse('flowchart TD\n  A[Start] --> B{Pytanie}').document;
    expect(doc.nodes.map((n) => [n.id, n.label, n.shape])).toEqual([
      ['A', 'Start', 'rectangle'],
      ['B', 'Pytanie', 'rhombus'],
    ]);
  });
});

describe('podgrafy', () => {
  it('tworzy grupę i przypisuje do niej węzły', () => {
    const doc = parse([
      'flowchart TD',
      '  subgraph proces [Proces główny]',
      '    A --> B',
      '  end',
      '  B --> C',
    ].join('\n')).document;

    expect(doc.groups).toEqual([{ id: 'proces', label: 'Proces główny' }]);
    expect(doc.nodes.find((n) => n.id === 'A')?.parentId).toBe('proces');
    expect(doc.nodes.find((n) => n.id === 'C')?.parentId).toBeUndefined();
  });
});

describe('zachowanie nierozpoznanych linii', () => {
  it('style, klik i komentarze trafiają do `unknown`', () => {
    const source = [
      'flowchart TD',
      '  %% komentarz',
      '  A --> B',
      '  classDef ważne fill:#f9f',
      '  click A "https://example.com"',
    ].join('\n');
    const doc = parse(source).document;

    expect(doc.unknown.map((u) => u.text.trim())).toEqual([
      '%% komentarz', 'classDef ważne fill:#f9f', 'click A "https://example.com"',
    ]);
  });

  it('zapis przywraca je w tej samej kolejności', () => {
    const source = [
      'flowchart TD',
      '  A[Start] --> B[Koniec]',
      '  classDef ważne fill:#f9f',
      '  click A "https://example.com"',
    ].join('\n');
    const out = serialize(parse(source).document);

    expect(out).toContain('classDef ważne fill:#f9f');
    expect(out).toContain('click A "https://example.com"');
    expect(out.indexOf('classDef')).toBeLessThan(out.indexOf('click A'));
  });
});

describe('serializacja i round-trip', () => {
  it('składa poprawny Mermaid z modelu', () => {
    const out = serialize(parse('flowchart LR\n  A[Start] -->|dalej| B{Czy?}').document);
    expect(out.split('\n')[0]).toBe('flowchart LR');
    expect(out).toContain('A[Start]');
    expect(out).toContain('B{Czy?}');
    expect(out).toContain('A -->|dalej| B');
  });

  const ROUND_TRIP_SOURCE = [
    'flowchart TD',
    '  A[Start] --> B{Decyzja}',
    '  B -->|tak| C([Gotowe])',
    '  B -.->|nie| D[(Zapis)]',
    '  subgraph g [Grupa]',
    '    C --> E',
    '  end',
  ].join('\n');

  it('round-trip zachowuje węzły, krawędzie i grupy', () => {
    const first = parse(ROUND_TRIP_SOURCE).document;
    const second = parse(serialize(first)).document;

    const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
    // Kolejność deklaracji w pliku nie niesie znaczenia (serializer grupuje
    // podgrafy na początku), więc porównujemy zawartość, nie ustawienie linii.
    expect(byId(second.nodes)).toEqual(byId(first.nodes));
    expect(byId(second.edges)).toEqual(byId(first.edges));
    expect(second.groups).toEqual(first.groups);
    expect(second.direction).toBe(first.direction);
  });

  it('zapis jest idempotentny — drugi zapis nie przestawia już ani jednej linii', () => {
    // To jest właściwa gwarancja dla użytkownika: otwarcie i zapisanie diagramu
    // bez zmian nie może produkować diffa.
    const once = serialize(parse(ROUND_TRIP_SOURCE).document);
    const twice = serialize(parse(once).document);
    expect(twice).toBe(once);
  });

  it('etykieta ze znakami specjalnymi jest cytowana przy zapisie', () => {
    const doc = parse('flowchart TD\n  A').document;
    doc.nodes[0].label = 'Tekst z [nawiasem]';
    const out = serialize(doc);
    expect(out).toContain('A["Tekst z [nawiasem]"]');
    expect(parse(out).document.nodes[0].label).toBe('Tekst z [nawiasem]');
  });
});

describe('detect', () => {
  it('rozpoznaje flowchart z dużą pewnością', () => {
    expect(mermaidFormat.detect('flowchart TD\n A-->B')).toBeGreaterThan(0.8);
    expect(mermaidFormat.detect('graph LR\n A-->B')).toBeGreaterThan(0.8);
  });

  it('obcy tekst dostaje zero', () => {
    expect(mermaidFormat.detect('@startuml\nA -> B\n@enduml')).toBe(0);
    expect(mermaidFormat.detect('{ "nodes": [] }')).toBe(0);
  });
});

describe('front matter we flowcharcie', () => {
  const WITH_FM = ['---', 'title: Algorytm', '---', 'flowchart TD', '  A[Start] --> B[Koniec]'].join('\n');

  it('wraca na początek pliku, przed nagłówkiem diagramu', () => {
    const lines = serialize(parse(WITH_FM).document).split('\n');
    expect(lines.slice(0, 3)).toEqual(['---', 'title: Algorytm', '---']);
    // `TD` i `TB` to synonimy — zapisujemy jedną, kanoniczną postać.
    expect(lines[3]).toMatch(/^flowchart (TB|TD)$/);
  });

  it('kierunek i węzły są czytane mimo front mattera', () => {
    const doc = parse(WITH_FM).document;
    expect(doc.direction).toBe('TB');
    expect(doc.nodes.map((n) => n.id)).toEqual(['A', 'B']);
  });
});

/**
 * Łączenie wielu węzłów naraz: `A & B --> C & D`.
 *
 * Mermaid rozwija taki zapis w iloczyn — każdy węzeł z lewej łączy się z każdym
 * z prawej. Parser, który tego nie zna, bierze całą stronę za jedną nazwę i
 * tworzy węzeł o identyfikatorze w rodzaju „Ra] & R2[Rb".
 */
describe('krawędzie z `&`', () => {
  it('rozwija obie strony w iloczyn', () => {
    const doc = parse('flowchart TD\n  A & B --> C & D').document;

    expect(doc.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(doc.edges.map((e) => `${e.source}->${e.target}`).sort())
      .toEqual(['A->C', 'A->D', 'B->C', 'B->D']);
  });

  it('czyta kształty i etykiety po obu stronach', () => {
    const doc = parse('flowchart TD\n  R1[Ra] & R2[Rb] --> R3[Rc] & R4[Rd]').document;

    expect(doc.nodes.map((n) => [n.id, n.label])).toEqual([
      ['R1', 'Ra'], ['R2', 'Rb'], ['R3', 'Rc'], ['R4', 'Rd'],
    ]);
    expect(doc.edges).toHaveLength(4);
  });

  it('etykieta przejścia trafia na każdą z rozwiniętych krawędzi', () => {
    const doc = parse('flowchart TD\n  A & B -->|dalej| C').document;
    expect(doc.edges.map((e) => e.label)).toEqual(['dalej', 'dalej']);
  });

  it('działa też z jedną stroną pojedynczą', () => {
    expect(parse('flowchart TD\n  A --> C & D').document.edges).toHaveLength(2);
  });

  it('zapis rozwija je na osobne linie — treść zostaje ta sama', () => {
    const out = serialize(parse('flowchart TD\n  A & B --> C').document);
    expect(out).toContain('A --> C');
    expect(out).toContain('B --> C');
    expect(parse(out).document.edges).toHaveLength(2);
  });

  it('pojedynczy `&` w etykiecie nie rozbija węzła', () => {
    const doc = parse('flowchart TD\n  A["Kawa & herbata"] --> B').document;
    expect(doc.nodes[0].label).toBe('Kawa & herbata');
    expect(doc.edges).toHaveLength(1);
  });
});

/**
 * Pełna tabela kształtów Mermaida.
 *
 * Zrzut porównawczy pokazał, że część zapisów trafia u nas na zły kształt:
 * chorągiewka (`>tekst]`) rysowała się jak równoległobok, a warianty
 * `[\…\]` / `[/…\]` mieszały się ze sobą. To nie jest kosmetyka — kształt
 * niesie znaczenie (decyzja, dane, wejście/wyjście).
 */
describe('kształty — zgodność z Mermaidem', () => {
  const CASES: Array<[string, string]> = [
    ['A[Prostokąt]', 'rectangle'],
    ['A(Zaokrąglony)', 'rounded'],
    ['A([Stadion])', 'stadium'],
    ['A[[Podprogram]]', 'subroutine'],
    ['A[(Baza)]', 'cylinder'],
    ['A((Okrąg))', 'circle'],
    ['A>Chorągiewka]', 'asymmetric'],
    ['A{Romb}', 'rhombus'],
    ['A{{Sześciokąt}}', 'hexagon'],
    ['A[/Równoległobok/]', 'parallelogram'],
    ['A[\\Odwrotny\\]', 'parallelogramAlt'],
    ['A[/Trapez\\]', 'trapezoid'],
    ['A[\\Trapez odwrotny/]', 'trapezoidAlt'],
  ];

  it.each(CASES)('%s → %s', (source, shape) => {
    const doc = parse(`flowchart TD\n  ${source}`).document;
    expect(doc.nodes[0]?.shape).toBe(shape);
  });

  it.each(CASES)('%s przeżywa round-trip', (source) => {
    const first = parse(`flowchart TD\n  ${source}`).document;
    const second = parse(serialize(first)).document;
    expect(second.nodes[0]).toEqual(first.nodes[0]);
  });
});
