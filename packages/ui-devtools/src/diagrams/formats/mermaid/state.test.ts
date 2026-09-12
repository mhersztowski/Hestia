/**
 * Testy adaptera Mermaid dla `stateDiagram-v2`.
 *
 * Diagram stanów ma dwie cechy, których flowchart nie ma i które łatwo zgubić:
 * pseudostan `[*]` (raz oznacza start, raz koniec — zależnie od strony
 * przejścia) oraz stany złożone (`state X { … }`), czyli grupy z własną
 * zawartością.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from './index';

const parse = (text: string) => mermaidFormat.parse(text);
const serialize = mermaidFormat.serialize;

describe('nagłówek', () => {
  it('rozpoznaje rodzaj i kierunek', () => {
    const doc = parse('stateDiagram-v2\n  direction LR\n  [*] --> Idle').document;
    expect(doc.kind).toBe('state');
    expect(doc.direction).toBe('LR');
  });

  it('działa też bez `-v2`', () => {
    expect(parse('stateDiagram\n  [*] --> A').document.kind).toBe('state');
  });
});

describe('pseudostany [*]', () => {
  it('po lewej stronie przejścia to start, po prawej koniec', () => {
    const doc = parse('stateDiagram-v2\n  [*] --> Praca\n  Praca --> [*]').document;

    const shapes = doc.nodes.map((n) => [n.id, n.shape]);
    expect(shapes).toContainEqual(['Praca', 'rectangle']);
    expect(doc.nodes.filter((n) => n.shape === 'start')).toHaveLength(1);
    expect(doc.nodes.filter((n) => n.shape === 'end')).toHaveLength(1);
  });

  it('każdy koniec jest osobnym węzłem — inaczej diagram scala niezależne wyjścia', () => {
    const doc = parse('stateDiagram-v2\n  A --> [*]\n  B --> [*]').document;
    expect(doc.nodes.filter((n) => n.shape === 'end')).toHaveLength(2);
  });

  it('zapis oddaje `[*]` z powrotem, a nie sztuczne identyfikatory', () => {
    const out = serialize(parse('stateDiagram-v2\n  [*] --> A\n  A --> [*]').document);
    expect(out).toContain('[*] --> A');
    expect(out).toContain('A --> [*]');
    expect(out).not.toMatch(/__start|__end/);
  });
});

describe('przejścia i opisy', () => {
  it('czyta etykietę po dwukropku', () => {
    const doc = parse('stateDiagram-v2\n  Idle --> Praca: start').document;
    expect(doc.edges[0]).toMatchObject({ source: 'Idle', target: 'Praca', label: 'start' });
  });

  it('czyta opis stanu (`state "opis" as id`)', () => {
    const doc = parse('stateDiagram-v2\n  state "Stan roboczy" as Praca\n  [*] --> Praca').document;
    expect(doc.nodes.find((n) => n.id === 'Praca')?.label).toBe('Stan roboczy');
  });

  it('czyta opis w formie `id : opis`', () => {
    const doc = parse('stateDiagram-v2\n  Praca : Stan roboczy\n  [*] --> Praca').document;
    expect(doc.nodes.find((n) => n.id === 'Praca')?.label).toBe('Stan roboczy');
  });
});

describe('stany specjalne i złożone', () => {
  it('rozpoznaje choice / fork / join', () => {
    const doc = parse([
      'stateDiagram-v2',
      '  state wybor <<choice>>',
      '  state rozgalezienie <<fork>>',
      '  state zlaczenie <<join>>',
    ].join('\n')).document;

    expect(doc.nodes.map((n) => [n.id, n.shape])).toEqual([
      ['wybor', 'choice'], ['rozgalezienie', 'fork'], ['zlaczenie', 'join'],
    ]);
  });

  it('stan złożony staje się grupą, a jego zawartość dostaje parentId', () => {
    const doc = parse([
      'stateDiagram-v2',
      '  [*] --> Aktywny',
      '  state Aktywny {',
      '    [*] --> Numer',
      '    Numer --> Pauza',
      '  }',
    ].join('\n')).document;

    expect(doc.groups.map((g) => g.id)).toEqual(['Aktywny']);
    expect(doc.nodes.find((n) => n.id === 'Numer')?.parentId).toBe('Aktywny');
    expect(doc.nodes.find((n) => n.id === 'Pauza')?.parentId).toBe('Aktywny');
  });
});

describe('zachowanie nierozpoznanych linii', () => {
  it('notatki i komentarze przetrwają round-trip', () => {
    const source = [
      'stateDiagram-v2',
      '  %% uwaga',
      '  [*] --> A',
      '  note right of A: coś ważnego',
    ].join('\n');
    const out = serialize(parse(source).document);

    expect(out).toContain('%% uwaga');
    expect(out).toContain('note right of A: coś ważnego');
  });
});

describe('kierunek układu', () => {
  /**
   * Stan złożony ma własny kierunek — `direction TB` w jego wnętrzu nie mówi
   * nic o diagramie na zewnątrz. Wcześniej nadpisywał kierunek całości, więc
   * `direction LR` z nagłówka znikało przy pierwszym zapisie.
   */
  const NESTED = [
    'stateDiagram-v2',
    '  direction LR',
    '  [*] --> Praca',
    '  state Praca {',
    '    direction TB',
    '    Pomiar --> Wysylka',
    '  }',
  ].join('\n');

  it('kierunek wnętrza grupy nie nadpisuje kierunku diagramu', () => {
    expect(parse(NESTED).document.direction).toBe('LR');
  });

  it('kierunek wnętrza trafia na grupę', () => {
    expect(parse(NESTED).document.groups[0].direction).toBe('TB');
  });

  it('oba kierunki wracają przy zapisie', () => {
    const out = serialize(parse(NESTED).document);
    expect(out).toContain('direction LR');
    expect(out).toContain('direction TB');
    // Kierunek wnętrza musi stać W ŚRODKU bloku, nie przed nim.
    const lines = out.split('\n');
    expect(lines.findIndex((l) => l.includes('direction TB')))
      .toBeGreaterThan(lines.findIndex((l) => l.includes('state Praca {')));
  });
});

describe('round-trip', () => {
  it('model po zapisie i ponownym odczycie jest identyczny', () => {
    const source = [
      'stateDiagram-v2',
      '  direction LR',
      '  [*] --> Idle',
      '  Idle --> Praca: start',
      '  Praca --> Idle: stop',
      '  Praca --> [*]',
    ].join('\n');

    const first = parse(source).document;
    const second = parse(serialize(first)).document;
    expect(second).toEqual(first);
  });

  it('stan złożony przeżywa round-trip razem z zawartością', () => {
    const source = [
      'stateDiagram-v2',
      '  state Aktywny {',
      '    [*] --> Numer',
      '    Numer --> Pauza',
      '  }',
      '  Aktywny --> [*]',
    ].join('\n');

    const first = parse(source).document;
    const second = parse(serialize(first)).document;
    expect(second.groups).toEqual(first.groups);
    expect(second.nodes.map((n) => [n.id, n.parentId])).toEqual(first.nodes.map((n) => [n.id, n.parentId]));
  });
});

describe('detect', () => {
  it('stateDiagram wygrywa z flowchartem', () => {
    expect(mermaidFormat.detect('stateDiagram-v2\n [*] --> A')).toBeGreaterThan(0.9);
  });
});

describe('nazwa stanu złożonego', () => {
  it('opis ramki trafia do kodu jako `state "Opis" as Id {`', () => {
    const doc = parse('stateDiagram-v2\n  state Praca {\n    [*] --> Krok\n  }').document;
    doc.groups[0].label = 'Praca w toku';

    const out = serialize(doc);
    expect(out).toContain('state "Praca w toku" as Praca {');
  });

  it('gdy opis równa się identyfikatorowi, nie dublujemy go w kodzie', () => {
    const doc = parse('stateDiagram-v2\n  state Praca {\n    [*] --> Krok\n  }').document;
    expect(serialize(doc)).toContain('state Praca {');
    expect(serialize(doc)).not.toContain('as Praca');
  });

  it('opis ramki przeżywa round-trip', () => {
    const doc = parse('stateDiagram-v2\n  state Praca {\n    [*] --> Krok\n  }').document;
    doc.groups[0].label = 'Praca w toku';

    const again = parse(serialize(doc)).document;
    expect(again.groups[0]).toMatchObject({ id: 'Praca', label: 'Praca w toku' });
  });

  it('znaki specjalne w opisie nie psują składni', () => {
    const doc = parse('stateDiagram-v2\n  state P {\n    [*] --> K\n  }').document;
    doc.groups[0].label = 'Praca: etap "2"';

    const again = parse(serialize(doc)).document;
    expect(again.groups[0].label).toBe('Praca: etap "2"');
  });
});

/**
 * Front matter (`---\ntitle: …\n---`) musi zostać NA POCZĄTKU pliku.
 *
 * Mermaid czyta go tylko wtedy, gdy jest pierwszy — a nierozpoznane linie
 * wracały dotąd na koniec diagramu. Zapis z edytora graficznego zamieniłby więc
 * poprawny diagram w taki, którego Mermaid nie potrafi sparsować.
 */
describe('front matter', () => {
  const WITH_FM = [
    '---',
    'title: Algorytm',
    '---',
    'stateDiagram-v2',
    '  [*] --> Idle',
    '  Idle --> Praca: start',
  ].join('\n');

  it('nie przeszkadza w rozpoznaniu diagramu', () => {
    const doc = parse(WITH_FM).document;
    expect(doc.kind).toBe('state');
    expect(doc.nodes.some((n) => n.id === 'Idle')).toBe(true);
  });

  it('wraca na początek, przed nagłówkiem diagramu', () => {
    const out = serialize(parse(WITH_FM).document);
    const lines = out.split('\n');
    expect(lines[0]).toBe('---');
    expect(lines[1]).toBe('title: Algorytm');
    expect(lines[2]).toBe('---');
    expect(lines[3]).toBe('stateDiagram-v2');
  });

  it('round-trip nie gubi ani nie dubluje bloku', () => {
    const once = serialize(parse(WITH_FM).document);
    const twice = serialize(parse(once).document);
    expect(twice).toBe(once);
    expect(once.match(/^---$/gm)?.length).toBe(2);
  });

  it('diagram bez front mattera nie dostaje go znikąd', () => {
    expect(serialize(parse('stateDiagram-v2\n  [*] --> A').document).startsWith('---')).toBe(false);
  });
});
