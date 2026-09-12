/**
 * Geometria przebiegu.
 *
 * Sekwencja układa się inaczej niż graf: uczestnicy w rzędzie, czas w dół.
 * Testy sprawdzają relacje, nie konkretne piksele — układ wolno stroić, ale
 * kolejność w pionie i objęcie zawartości przez ramkę bloku to kontrakt.
 */
import { describe, it, expect } from 'vitest';
import { parseSequenceDiagram } from '../formats/mermaid/sequenceDiagram';
import { layoutSequence, shouldPinHeads } from './sequenceLayout';

const ulóż = (text: string) => layoutSequence(parseSequenceDiagram(text).document.sequence!);

describe('oś uczestników', () => {
  const l = ulóż('sequenceDiagram\n  participant A\n  participant B\n  participant C\n  A->>B: x');

  it('każdy uczestnik ma własną kolumnę', () => {
    const xs = l.participants.map((p) => p.x);
    expect(new Set(xs).size).toBe(3);
  });

  it('kolejność deklaracji wyznacza kolejność kolumn', () => {
    expect(l.participants.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    expect(l.participants[0].x).toBeLessThan(l.participants[1].x);
  });
});

describe('czas płynie w dół', () => {
  const l = ulóż('sequenceDiagram\n  A->>B: raz\n  B->>A: dwa\n  A->>B: trzy');

  it('kolejne wiadomości leżą coraz niżej', () => {
    const ys = l.messages.map((m) => m.y);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });

  it('pierwsza wiadomość jest poniżej nagłówków', () => {
    expect(l.messages[0].y).toBeGreaterThan(l.headHeight);
  });

  it('wiadomość do siebie jest oznaczona', () => {
    const self = ulóż('sequenceDiagram\n  A->>A: sam do siebie');
    expect(self.messages[0].selfCall).toBe(true);
  });
});

describe('bloki obejmują zawartość', () => {
  const l = ulóż([
    'sequenceDiagram',
    '  loop Powtarzaj',
    '    A->>B: ping',
    '    B->>A: pong',
    '  end',
  ].join('\n'));

  it('ramka zaczyna się nad pierwszą wiadomością', () => {
    expect(l.blocks[0].y).toBeLessThan(l.messages[0].y);
  });

  it('ramka kończy się pod ostatnią', () => {
    const b = l.blocks[0];
    expect(b.y + b.height).toBeGreaterThan(l.messages[l.messages.length - 1].y);
  });

  it('`alt` ma linię rozdzielającą sekcje', () => {
    const alt = ulóż([
      'sequenceDiagram',
      '  alt Tak',
      '    A->>B: tak',
      '  else Nie',
      '    A->>B: nie',
      '  end',
    ].join('\n'));
    expect(alt.blocks[0].dividers).toHaveLength(1);
    expect(alt.blocks[0].dividers[0].title).toBe('Nie');
  });

  it('blok wewnętrzny mieści się w zewnętrznym', () => {
    const zagniezdzone = ulóż([
      'sequenceDiagram',
      '  loop Zewnetrzny',
      '    alt Wewnetrzny',
      '      A->>B: x',
      '    end',
      '  end',
    ].join('\n'));
    const outer = zagniezdzone.blocks.find((b) => b.block === 'loop')!;
    const inner = zagniezdzone.blocks.find((b) => b.block === 'alt')!;
    expect(inner.y).toBeGreaterThan(outer.y);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    expect(inner.x).toBeGreaterThan(outer.x);
  });
});

describe('paski aktywności', () => {
  it('`->>+` otwiera, `-->>-` zamyka', () => {
    const l = ulóż('sequenceDiagram\n  A->>+B: start\n  B-->>-A: koniec');
    expect(l.activations).toHaveLength(1);
    expect(l.activations[0].participant).toBe('B');
    expect(l.activations[0].bottom).toBeGreaterThan(l.activations[0].top);
  });

  it('jawne `activate`/`deactivate` też działa', () => {
    const l = ulóż('sequenceDiagram\n  activate B\n  A->>B: x\n  deactivate B');
    expect(l.activations).toHaveLength(1);
  });

  it('aktywacja bez zamknięcia ciągnie się do końca', () => {
    const l = ulóż('sequenceDiagram\n  activate B\n  A->>B: x');
    expect(l.activations[0].bottom).toBeGreaterThan(l.messages[0].y);
  });
});

describe('numerowanie', () => {
  it('`autonumber` nadaje kolejne numery', () => {
    const l = ulóż('sequenceDiagram\n  autonumber\n  A->>B: raz\n  B->>A: dwa');
    expect(l.messages.map((m) => m.number)).toEqual([1, 2]);
  });

  it('bez `autonumber` numerów nie ma', () => {
    const l = ulóż('sequenceDiagram\n  A->>B: raz');
    expect(l.messages[0].number).toBeUndefined();
  });
});

describe('płótno', () => {
  it('rośnie z liczbą uczestników', () => {
    const male = ulóż('sequenceDiagram\n  A->>B: x');
    const duze = ulóż('sequenceDiagram\n  participant A\n  participant B\n  participant C\n  participant D\n  A->>B: x');
    expect(duze.width).toBeGreaterThan(male.width);
  });

  it('rośnie z liczbą kroków', () => {
    const krotkie = ulóż('sequenceDiagram\n  A->>B: x');
    const dlugie = ulóż('sequenceDiagram\n  A->>B: x\n  A->>B: y\n  A->>B: z');
    expect(dlugie.height).toBeGreaterThan(krotkie.height);
  });
});

/**
 * Powtórzone nagłówki na dole.
 *
 * Mermaid rysuje uczestników drugi raz pod przebiegiem: przy długim diagramie
 * inaczej trzeba przewijać w górę, żeby sprawdzić, czyja to linia życia.
 */
describe('stopka z uczestnikami', () => {
  const l = ulóż('sequenceDiagram\n  A->>B: raz\n  B->>A: dwa');

  it('stopka leży pod ostatnim krokiem', () => {
    expect(l.footerY).toBeGreaterThan(l.messages[l.messages.length - 1].y);
  });

  it('płótno obejmuje stopkę', () => {
    expect(l.height).toBeGreaterThan(l.footerY);
  });

  it('stopka jest poniżej nagłówków górnych', () => {
    expect(l.footerY).toBeGreaterThan(l.headHeight);
  });

  it('diagram bez kroków też ma miejsce na stopkę', () => {
    const pusty = ulóż('sequenceDiagram\n  participant A');
    expect(pusty.footerY).toBeGreaterThan(pusty.headHeight);
    expect(pusty.height).toBeGreaterThan(pusty.footerY);
  });
});

/**
 * Przypinanie nagłówków przy przewijaniu.
 *
 * Przy długim przebiegu oba pasy z nazwami uczestników wypadają poza kadr i
 * przestaje być wiadomo, czyja jest która linia życia.
 */
describe('przypięte nagłówki', () => {
  const layout = { headHeight: 52, footerY: 900 };

  it('na górze diagramu nie przypinamy — nagłówki widać', () => {
    expect(shouldPinHeads(layout, 0, 400)).toBe(false);
  });

  it('w środku przebiegu przypinamy', () => {
    expect(shouldPinHeads(layout, 300, 400)).toBe(true);
  });

  it('przy stopce nie przypinamy — dolne nagłówki weszły w kadr', () => {
    expect(shouldPinHeads(layout, 600, 400)).toBe(false);
  });

  it('krótki diagram mieszczący się w kadrze nie przypina', () => {
    expect(shouldPinHeads({ headHeight: 52, footerY: 200 }, 0, 400)).toBe(false);
  });
});

/**
 * Notatka `over` rozpięta na uczestnikach.
 *
 * Mermaid ogranicza ją do zakresu wskazanych osi. Rozciągnięta poza nie
 * sugeruje, że dotyczy też sąsiadów — a przy pierwszym uczestniku wychodziła
 * poza lewą krawędź diagramu.
 */
describe('szerokość notatki', () => {
  const l = ulóż([
    'sequenceDiagram',
    '  participant A',
    '  participant B',
    '  participant C',
    '  Note over A,B: nad dwoma',
    '  Note over C: nad jednym',
  ].join('\n'));
  const [nadDwoma, nadJednym] = l.notes;
  const x = (id: string) => l.participants.find((p) => p.id === id)!.x;

  it('notatka nad dwoma zaczyna się przy pierwszej osi', () => {
    expect(nadDwoma.x).toBeLessThan(x('A'));
    expect(nadDwoma.x).toBeGreaterThan(x('A') - 60);
  });

  it('notatka nad dwoma kończy się przy drugiej osi', () => {
    const prawa = nadDwoma.x + nadDwoma.width;
    expect(prawa).toBeGreaterThan(x('B'));
    expect(prawa).toBeLessThan(x('B') + 60);
  });

  it('nie wychodzi poza lewą krawędź płótna', () => {
    expect(nadDwoma.x).toBeGreaterThanOrEqual(0);
  });

  it('nie obejmuje uczestnika spoza zakresu', () => {
    expect(nadDwoma.x + nadDwoma.width).toBeLessThan(x('C'));
  });

  it('notatka nad jednym jest wyśrodkowana na jego osi', () => {
    expect(Math.abs((nadJednym.x + nadJednym.width / 2) - x('C'))).toBeLessThan(2);
  });
});

/**
 * Ramka bloku obejmuje uczestników, których blok FAKTYCZNIE dotyczy.
 *
 * Wcześniej sięgała do skrajnej osi diagramu, więc `break` rozmawiający z dwoma
 * osobami rozciągał się przez cały rysunek i sugerował, że obejmuje też tych,
 * których wcale nie tyka. Mermaid liczy to po zakresie użytych osi.
 */
describe('szerokość ramki bloku', () => {
  const l = ulóż([
    'sequenceDiagram',
    '  participant A',
    '  participant B',
    '  participant C',
    '  participant D',
    '  loop szeroki',
    '    A->>D: przez caly diagram',
    '    break waski',
    '      A->>B: tylko dwoje',
    '    end',
    '  end',
  ].join('\n'));
  const x = (id: string) => l.participants.find((p) => p.id === id)!.x;
  const szeroki = l.blocks.find((b) => b.block === 'loop')!;
  const waski = l.blocks.find((b) => b.block === 'break')!;

  it('blok sięgający do ostatniej osi kończy się przy niej', () => {
    const prawa = szeroki.x + szeroki.width;
    expect(prawa).toBeGreaterThan(x('D'));
    expect(prawa).toBeLessThan(x('D') + 60);
  });

  it('blok dotyczący dwóch uczestników nie sięga dalej niż do nich', () => {
    const prawa = waski.x + waski.width;
    expect(prawa).toBeLessThan(x('C'));
  });

  it('węższy blok mieści się w szerszym', () => {
    expect(waski.x).toBeGreaterThanOrEqual(szeroki.x);
    expect(waski.x + waski.width).toBeLessThanOrEqual(szeroki.x + szeroki.width);
  });

  it('ramka mieści się w płótnie', () => {
    for (const block of l.blocks) expect(block.x + block.width).toBeLessThanOrEqual(l.width);
  });

  it('zagnieżdżona ramka nie pokrywa się krawędzią z nadrzędną', () => {
    expect(waski.x).toBeGreaterThan(szeroki.x);
  });
});

/**
 * Zamknięty blok a linia sekcji bloku nadrzędnego.
 *
 * Bez odstępu za ramką linia `else` wypadała dokładnie na jej dolnej krawędzi
 * i obie kreski nakładały się na siebie.
 */
describe('odstęp za zamkniętym blokiem', () => {
  const l = ulóż([
    'sequenceDiagram',
    '  alt pierwszy',
    '    break awaria',
    '      A->>B: raport',
    '    end',
    '  else drugi',
    '    A->>B: dalej',
    '  end',
  ].join('\n'));

  it('linia sekcji nie leży na krawędzi zamkniętego bloku', () => {
    const zewnetrzny = l.blocks.find((b) => b.block === 'alt')!;
    const wewnetrzny = l.blocks.find((b) => b.block === 'break')!;
    const dolWewnetrznego = wewnetrzny.y + wewnetrzny.height;
    const linia = zewnetrzny.dividers[0].y;
    expect(Math.abs(linia - dolWewnetrznego)).toBeGreaterThan(8);
  });
});

/**
 * Uczestnik powołany w trakcie przebiegu.
 *
 * Jego pudełko stoi w miejscu `create`, a nie u góry — inaczej nie widać, że
 * byt pojawia się dopiero w środku.
 */
describe('cykl życia uczestnika', () => {
  const l = ulóż([
    'sequenceDiagram',
    '  participant A',
    '  A->>A: przygotowanie',
    '  create participant B as Nowy',
    '  A->>B: start',
    '  destroy B',
    '  A-xB: koniec',
  ].join('\n'));
  const b = l.participants.find((p) => p.id === 'B')!;

  it('powstaje poniżej pierwszej wiadomości', () => {
    expect(b.spawnY).toBeGreaterThan(l.messages[0].y);
  });

  it('kończy się poniżej swojego powstania', () => {
    expect(b.destroyY).toBeGreaterThan(b.spawnY!);
  });

  it('uczestnik istniejący od początku nie ma znaczników cyklu życia', () => {
    const a = l.participants.find((p) => p.id === 'A')!;
    expect(a.spawnY).toBeUndefined();
    expect(a.destroyY).toBeUndefined();
  });

  it('wiadomość po `create` nie nachodzi na jego pudełko', () => {
    const doB = l.messages.find((m) => m.to === 'B')!;
    expect(doB.y).toBeGreaterThan(b.spawnY! + 30);
  });
});

describe('autonumber z parametrami', () => {
  it('`autonumber 10 10` numeruje 10, 20, 30', () => {
    const l = ulóż('sequenceDiagram\n  autonumber 10 10\n  A->>B: raz\n  B->>A: dwa\n  A->>B: trzy');
    expect(l.messages.map((m) => m.number)).toEqual([10, 20, 30]);
  });

  it('sam `autonumber` numeruje od jedynki', () => {
    const l = ulóż('sequenceDiagram\n  autonumber\n  A->>B: raz\n  B->>A: dwa');
    expect(l.messages.map((m) => m.number)).toEqual([1, 2]);
  });
});
