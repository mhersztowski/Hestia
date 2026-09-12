/**
 * Mermaid `sequenceDiagram` ⇄ model.
 *
 * Tu nie chodzi o graf, tylko o przebieg: kolejność wiadomości i zagnieżdżenie
 * bloków niosą znaczenie. Test pilnuje więc trzech rzeczy — że kolejność
 * przetrwa, że bloki się nie spłaszczą i że linia niezrozumiana wraca na swoje
 * miejsce, a nie na koniec pliku.
 */
import { describe, it, expect } from 'vitest';
import { parseSequenceDiagram, serializeSequenceDiagram } from './sequenceDiagram';
import { isBlock, type SequenceBlock, type SequenceMessage } from '../../model/sequence';

const parse = (text: string) => parseSequenceDiagram(text).document;
const script = (text: string) => parse(text).sequence!;
const roundTrip = (text: string) => serializeSequenceDiagram(parse(text));

describe('uczestnicy', () => {
  const SOURCE = [
    'sequenceDiagram',
    '    participant A as Alicja',
    '    participant B',
    '    actor C as Klient',
  ].join('\n');

  it('czyta wszystkich', () => {
    expect(script(SOURCE).participants.map((p) => p.id)).toEqual(['A', 'B', 'C']);
  });

  it('czyta opis z aliasu', () => {
    expect(script(SOURCE).participants[0].label).toBe('Alicja');
  });

  it('rozpoznaje aktora', () => {
    expect(script(SOURCE).participants[2].isActor).toBe(true);
  });

  it('uczestnik bez deklaracji powstaje z wiadomości', () => {
    const s = script('sequenceDiagram\n    X->>Y: cześć');
    expect(s.participants.map((p) => p.id)).toEqual(['X', 'Y']);
  });

  it('kolejność deklaracji wyznacza kolejność na osi', () => {
    const s = script('sequenceDiagram\n    participant B\n    participant A\n    A->>B: x');
    expect(s.participants.map((p) => p.id)).toEqual(['B', 'A']);
  });

  it('wraca przy zapisie razem z aliasem i aktorem', () => {
    const out = roundTrip(SOURCE);
    expect(out).toContain('participant A as Alicja');
    expect(out).toContain('actor C as Klient');
  });
});

describe('wiadomości', () => {
  it.each([
    ['A->B: x', 'solid'],
    ['A-->B: x', 'dotted'],
    ['A->>B: x', 'solidArrow'],
    ['A-->>B: x', 'dottedArrow'],
    ['A-xB: x', 'solidCross'],
    ['A--xB: x', 'dottedCross'],
    ['A-)B: x', 'solidOpen'],
    ['A--)B: x', 'dottedOpen'],
  ])('%s → %s', (line, arrow) => {
    const step = script(`sequenceDiagram\n    ${line}`).steps[0] as SequenceMessage;
    expect(step).toMatchObject({ kind: 'message', from: 'A', to: 'B', arrow, text: 'x' });
  });

  it('kolejność wiadomości jest zachowana', () => {
    const s = script('sequenceDiagram\n    A->>B: raz\n    B->>A: dwa\n    A->>B: trzy');
    expect(s.steps.map((st) => (st as SequenceMessage).text)).toEqual(['raz', 'dwa', 'trzy']);
  });

  it('ta sama para uczestników daje dwa osobne kroki', () => {
    // W grafie byłaby to jedna krawędź — tu każde zdarzenie jest osobne.
    expect(script('sequenceDiagram\n    A->>B: raz\n    A->>B: dwa').steps).toHaveLength(2);
  });

  it('aktywacja przy wiadomości (`->>+`)', () => {
    const step = script('sequenceDiagram\n    A->>+B: start').steps[0] as SequenceMessage;
    expect(step.activate).toBe(true);
  });

  it('dezaktywacja przy wiadomości (`-->>-`)', () => {
    const step = script('sequenceDiagram\n    B-->>-A: koniec').steps[0] as SequenceMessage;
    expect(step.deactivate).toBe(true);
  });

  it('jawne `activate` i `deactivate`', () => {
    const s = script('sequenceDiagram\n    activate B\n    deactivate B');
    expect(s.steps.map((st) => st.kind)).toEqual(['activate', 'deactivate']);
  });

  it('wiadomość bez treści jest dopuszczalna', () => {
    expect((script('sequenceDiagram\n    A->>B:').steps[0] as SequenceMessage).text).toBe('');
  });
});

describe('odstępy w zapisie wiadomości', () => {
  /**
   * Mermaid pozwala rozstrzelić wiadomość spacjami, a znacznik aktywacji
   * postawić przy operatorze albo przy uczestniku. Nierozpoznana linia nie
   * wywołuje błędu — po prostu znika z diagramu, więc brak takiego wariantu
   * objawia się jako „część diagramu się nie narysowała".
   */
  it.each([
    'A->>B: bez spacji',
    'A ->> B: spacje wokół operatora',
    'A->>+B: aktywacja',
    'A ->>+ B: aktywacja rozstrzelona',
    'A->> +B: znacznik przy uczestniku',
    'A->>+ B: znacznik przy operatorze',
    'A -->>- B: dezaktywacja rozstrzelona',
    'A -x B: utracona',
    'A --) B: asynchroniczna',
    'A <<->> B: dwustronna',
    'A->>B: treść z nawiasami zaloguj()',
    'A->>B: treść: z dwukropkiem',
  ])('%s', (line) => {
    expect(script(`sequenceDiagram\n    ${line}`).steps[0].kind, line).toBe('message');
  });

  it('znacznik aktywacji jest czytany niezależnie od odstępów', () => {
    for (const line of ['A->>+B: x', 'A ->>+ B: x', 'A->> +B: x', 'A->>+ B: x']) {
      const step = script(`sequenceDiagram\n    ${line}`).steps[0] as SequenceMessage;
      expect(step.activate, line).toBe(true);
    }
  });
});

describe('bloki', () => {
  it('`loop` obejmuje swoje kroki', () => {
    const s = script('sequenceDiagram\n    loop Co minutę\n        A->>B: ping\n    end');
    const block = s.steps[0] as SequenceBlock;
    expect(block).toMatchObject({ kind: 'block', block: 'loop', title: 'Co minutę' });
    expect(block.sections[0].steps).toHaveLength(1);
  });

  it('`alt` z `else` daje dwie sekcje', () => {
    const s = script([
      'sequenceDiagram',
      '    alt Sukces',
      '        B->>A: ok',
      '    else Błąd',
      '        B->>A: nie',
      '    end',
    ].join('\n'));
    const block = s.steps[0] as SequenceBlock;
    expect(block.sections).toHaveLength(2);
    expect(block.sections[0].title).toBe('Sukces');
    expect(block.sections[1].title).toBe('Błąd');
  });

  it('`par` z `and`', () => {
    const s = script([
      'sequenceDiagram',
      '    par Równolegle',
      '        A->>B: 1',
      '    and',
      '        A->>C: 2',
      '    end',
    ].join('\n'));
    expect((s.steps[0] as SequenceBlock).sections).toHaveLength(2);
  });

  it('bloki zagnieżdżają się', () => {
    const s = script([
      'sequenceDiagram',
      '    loop Powtarzaj',
      '        alt Jest',
      '            A->>B: tak',
      '        else Nie ma',
      '            A->>B: nie',
      '        end',
      '    end',
    ].join('\n'));
    const outer = s.steps[0] as SequenceBlock;
    const inner = outer.sections[0].steps[0];
    expect(isBlock(inner)).toBe(true);
    expect((inner as SequenceBlock).block).toBe('alt');
  });

  it.each(['loop', 'opt', 'critical', 'break', 'rect'])('rozpoznaje `%s`', (kind) => {
    const s = script(`sequenceDiagram\n    ${kind} tytuł\n        A->>B: x\n    end`);
    expect((s.steps[0] as SequenceBlock).block).toBe(kind);
  });

  it('zagnieżdżenie przeżywa zapis', () => {
    const SOURCE = [
      'sequenceDiagram',
      '    loop Powtarzaj',
      '        alt Jest',
      '            A->>B: tak',
      '        else Nie ma',
      '            A->>B: nie',
      '        end',
      '    end',
    ].join('\n');
    const again = parseSequenceDiagram(roundTrip(SOURCE)).document.sequence!;
    const outer = again.steps[0] as SequenceBlock;
    expect((outer.sections[0].steps[0] as SequenceBlock).block).toBe('alt');
  });
});

describe('notatki', () => {
  it.each([
    ['Note left of A: uwaga', 'left of', ['A']],
    ['Note right of B: uwaga', 'right of', ['B']],
    ['Note over A,B: uwaga', 'over', ['A', 'B']],
  ] as const)('%s', (line, placement, targets) => {
    const step = script(`sequenceDiagram\n    ${line}`).steps[0];
    expect(step).toMatchObject({ kind: 'note', placement, targets, text: 'uwaga' });
  });

  it('wraca przy zapisie', () => {
    expect(roundTrip('sequenceDiagram\n    Note over A,B: uwaga')).toContain('Note over A,B: uwaga');
  });
});

describe('autonumber', () => {
  it('jest czytany', () => {
    expect(script('sequenceDiagram\n    autonumber\n    A->>B: x').autonumber).toBe(true);
  });

  it('wraca przy zapisie tuż po nagłówku', () => {
    const lines = roundTrip('sequenceDiagram\n    autonumber\n    A->>B: x').split('\n');
    expect(lines[1].trim()).toBe('autonumber');
  });
});

describe('zachowanie treści', () => {
  const SOURCE = [
    'sequenceDiagram',
    '    autonumber',
    '    participant A as Alicja',
    '    actor B',
    '    %% komentarz',
    '    A->>+B: pytanie',
    '    B-->>-A: odpowiedź',
    '    loop Co minutę',
    '        A->>B: ping',
    '        Note right of B: żyje',
    '    end',
    '    alt Sukces',
    '        B->>A: ok',
    '    else Błąd',
    '        B->>A: nie',
    '    end',
  ].join('\n');

  it('drugi zapis jest identyczny z pierwszym', () => {
    const once = roundTrip(SOURCE);
    const twice = serializeSequenceDiagram(parseSequenceDiagram(once).document);
    expect(twice).toBe(once);
  });

  it('komentarz zostaje w swoim miejscu', () => {
    const lines = roundTrip(SOURCE).split('\n').map((l) => l.trim());
    const komentarz = lines.indexOf('%% komentarz');
    expect(komentarz).toBeGreaterThan(0);
    expect(komentarz).toBeLessThan(lines.indexOf('A->>+B: pytanie'));
  });

  it('nierozpoznana linia wewnątrz bloku zostaje w bloku', () => {
    const out = roundTrip('sequenceDiagram\n    loop X\n        link A: Panel @ https://x\n    end');
    const lines = out.split('\n').map((l) => l.trim());
    expect(lines.indexOf('link A: Panel @ https://x')).toBeLessThan(lines.indexOf('end'));
  });

  it('liczba kroków się nie zmienia po round-tripie', () => {
    const przed = script(SOURCE).steps.length;
    const po = parseSequenceDiagram(roundTrip(SOURCE)).document.sequence!.steps.length;
    expect(po).toBe(przed);
  });
});

/**
 * Cykl życia uczestnika.
 *
 * `create participant X as Opis` powołuje byt w konkretnym miejscu przebiegu, a
 * `destroy X` go kończy. Nierozpoznanie tych linii kosztowało podwójnie: nie
 * dość, że znikał sam fakt utworzenia, to uczestnik tracił opis i na diagramie
 * widniał surowy identyfikator zamiast nazwy.
 */
describe('create i destroy', () => {
  const SOURCE = [
    'sequenceDiagram',
    '    participant VM as Lua VM',
    '    create participant S2 as Nowy lua_State',
    '    VM->>S2: lua_newstate()',
    '    create actor Tmp as Task tymczasowy',
    '    VM->>Tmp: spawn',
    '    destroy Tmp',
    '    Tmp-->>VM: koniec',
  ].join('\n');
  const s = script(SOURCE);

  it('uczestnik z `create` dostaje swój opis', () => {
    expect(s.participants.find((p) => p.id === 'S2')?.label).toBe('Nowy lua_State');
  });

  it('`create actor` zostaje aktorem', () => {
    expect(s.participants.find((p) => p.id === 'Tmp')).toMatchObject({ isActor: true, label: 'Task tymczasowy' });
  });

  it('powstanie i zniszczenie są krokami przebiegu', () => {
    expect(s.steps.map((st) => st.kind)).toEqual(['create', 'message', 'create', 'message', 'destroy', 'message']);
  });

  it('deklaracja wraca w swoim miejscu, nie w nagłówku', () => {
    const lines = roundTrip(SOURCE).split('\n').map((l) => l.trim());
    expect(lines.indexOf('create participant S2 as Nowy lua_State'))
      .toBeGreaterThan(lines.indexOf('participant VM as Lua VM'));
  });

  it('uczestnik z `create` nie jest deklarowany dwa razy', () => {
    const out = roundTrip(SOURCE);
    expect(out.split('\n').filter((l) => l.includes('S2') && l.includes('participant'))).toHaveLength(1);
  });

  it('round-trip jest stabilny', () => {
    const once = roundTrip(SOURCE);
    expect(serializeSequenceDiagram(parseSequenceDiagram(once).document)).toBe(once);
  });
});

describe('autonumber z parametrami', () => {
  it('czyta numer początkowy i krok', () => {
    const s = script('sequenceDiagram\n    autonumber 10 10\n    A->>B: x');
    expect(s).toMatchObject({ autonumber: true, autonumberStart: 10, autonumberStep: 10 });
  });

  it('sam numer początkowy', () => {
    expect(script('sequenceDiagram\n    autonumber 5\n    A->>B: x').autonumberStart).toBe(5);
  });

  it('parametry wracają przy zapisie', () => {
    expect(roundTrip('sequenceDiagram\n    autonumber 10 10\n    A->>B: x')).toContain('autonumber 10 10');
  });
});
