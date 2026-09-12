/**
 * Edycja przebiegu.
 *
 * Wszystko kręci się wokół ścieżki kroku: w sekwencji krok bywa zagnieżdżony w
 * sekcji `else` bloku, który sam leży w `loop`, więc sam indeks nie wskazuje go
 * jednoznacznie. Testy sprawdzają zwłaszcza to, że operacje trafiają w głąb, a
 * nie tylko w kroki najwyższego poziomu.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from '../formats/mermaid';
import {
  insertStep, insertIntoSection, removeStep, updateStep, moveStep, newBlock, addSection,
  addParticipant, updateParticipant, renameParticipant, removeParticipant, setAutonumber,
} from './sequenceOps';
import { isBlock, type SequenceBlock, type SequenceMessage } from './sequence';
import type { DiagramDocument } from './diagram';

const parse = (text: string) => mermaidFormat.parse(text).document;
const zapis = (doc: DiagramDocument) => mermaidFormat.serialize(doc);
const kroki = (doc: DiagramDocument) => doc.sequence!.steps;
const wiadomosc = (from: string, to: string, text: string): SequenceMessage =>
  ({ kind: 'message', from, to, arrow: 'solidArrow', text });

const PROSTY = 'sequenceDiagram\n    A->>B: raz\n    B->>A: dwa';
const ZAGNIEZDZONY = [
  'sequenceDiagram',
  '    loop Powtarzaj',
  '        alt Tak',
  '            A->>B: tak',
  '        else Nie',
  '            A->>B: nie',
  '        end',
  '    end',
].join('\n');

describe('dodawanie kroków', () => {
  it('wstawia za wskazanym krokiem', () => {
    const after = insertStep(parse(PROSTY), [0], wiadomosc('A', 'B', 'nowa'));
    expect(kroki(after).map((s) => (s as SequenceMessage).text)).toEqual(['raz', 'nowa', 'dwa']);
  });

  it('pusta ścieżka dopisuje na koniec', () => {
    const after = insertStep(parse(PROSTY), [], wiadomosc('A', 'B', 'ostatnia'));
    expect((kroki(after)[2] as SequenceMessage).text).toBe('ostatnia');
  });

  it('wstawia do wnętrza bloku', () => {
    // Ścieżka [0, 0] = pierwszy blok, jego pierwsza sekcja.
    const after = insertIntoSection(parse(ZAGNIEZDZONY), [0, 0], wiadomosc('A', 'B', 'w petli'));
    const loop = kroki(after)[0] as SequenceBlock;
    expect(loop.sections[0].steps).toHaveLength(2);
  });

  it('nowy krok wychodzi do Mermaida', () => {
    const after = insertStep(parse(PROSTY), [0], wiadomosc('A', 'B', 'nowa'));
    expect(zapis(after)).toContain('A->>B: nowa');
  });
});

describe('operacje sięgają w głąb zagnieżdżenia', () => {
  // [0,0,0,1,0] = blok loop → sekcja 0 → blok alt → sekcja 1 (`else`) → krok 0
  const SCIEZKA_W_ELSE = [0, 0, 0, 1, 0];

  it('zmienia treść kroku w sekcji `else`', () => {
    const after = updateStep(parse(ZAGNIEZDZONY), SCIEZKA_W_ELSE, { text: 'zmienione' } as Partial<SequenceMessage>);
    expect(zapis(after)).toContain('A->>B: zmienione');
    expect(zapis(after)).toContain('A->>B: tak');
  });

  it('usuwa krok z sekcji `else`', () => {
    const after = removeStep(parse(ZAGNIEZDZONY), SCIEZKA_W_ELSE);
    const alt = (kroki(after)[0] as SequenceBlock).sections[0].steps[0] as SequenceBlock;
    expect(alt.sections[1].steps).toHaveLength(0);
    expect(alt.sections[0].steps).toHaveLength(1);
  });

  it('zagnieżdżenie przeżywa operację', () => {
    const after = updateStep(parse(ZAGNIEZDZONY), SCIEZKA_W_ELSE, { text: 'x' } as Partial<SequenceMessage>);
    const loop = kroki(after)[0] as SequenceBlock;
    expect(isBlock(loop.sections[0].steps[0])).toBe(true);
  });
});

describe('kolejność', () => {
  it('przesuwa krok w górę', () => {
    const after = moveStep(parse(PROSTY), [1], -1);
    expect(kroki(after).map((s) => (s as SequenceMessage).text)).toEqual(['dwa', 'raz']);
  });

  it('poza zakres nic nie robi', () => {
    const after = moveStep(parse(PROSTY), [0], -1);
    expect(kroki(after).map((s) => (s as SequenceMessage).text)).toEqual(['raz', 'dwa']);
  });

  it('kolejność w zapisie odpowiada kolejności kroków', () => {
    const lines = zapis(moveStep(parse(PROSTY), [1], -1)).split('\n').map((l) => l.trim());
    expect(lines.indexOf('B->>A: dwa')).toBeLessThan(lines.indexOf('A->>B: raz'));
  });
});

describe('bloki', () => {
  it('`alt` powstaje z dwiema sekcjami', () => {
    const block = newBlock('alt', 'Warunek') as SequenceBlock;
    expect(block.sections).toHaveLength(2);
  });

  it('`loop` z jedną', () => {
    expect((newBlock('loop', 'Powtarzaj') as SequenceBlock).sections).toHaveLength(1);
  });

  it('nowy blok zapisuje się poprawnie', () => {
    const after = insertStep(parse(PROSTY), [], newBlock('opt', 'Może'));
    const out = zapis(after);
    expect(out).toContain('opt Może');
    expect(out.split('\n').filter((l) => l.trim() === 'end')).toHaveLength(1);
  });

  it('dokłada sekcję do istniejącego bloku', () => {
    const doc = insertStep(parse(PROSTY), [], newBlock('par', 'Równolegle'));
    const after = addSection(doc, [2], 'trzecia');
    expect((kroki(after)[2] as SequenceBlock).sections).toHaveLength(3);
  });
});

describe('uczestnicy', () => {
  it('dodaje nowego', () => {
    const after = addParticipant(parse(PROSTY), 'C');
    expect(after.sequence!.participants.map((p) => p.id)).toContain('C');
  });

  it('nie powiela istniejącego', () => {
    const after = addParticipant(parse(PROSTY), 'A');
    expect(after.sequence!.participants.filter((p) => p.id === 'A')).toHaveLength(1);
  });

  it('ustawia opis i rolę aktora', () => {
    const after = updateParticipant(parse(PROSTY), 'A', { label: 'Alicja', isActor: true });
    expect(zapis(after)).toContain('actor A as Alicja');
  });

  it('zmiana nazwy przepisuje wszystkie odwołania', () => {
    const after = renameParticipant(parse(PROSTY), 'A', 'Alice');
    const out = zapis(after);
    expect(out).toContain('Alice->>B: raz');
    expect(out).toContain('B->>Alice: dwa');
    expect(out).not.toContain('A->>B');
  });

  it('zmiana nazwy działa też w zagnieżdżonych blokach', () => {
    const after = renameParticipant(parse(ZAGNIEZDZONY), 'B', 'Serwer');
    expect(zapis(after)).toContain('A->>Serwer: nie');
  });

  it('zmiana nazwy na zajętą jest odrzucana', () => {
    const after = renameParticipant(parse(PROSTY), 'A', 'B');
    expect(after.sequence!.participants.map((p) => p.id).sort()).toEqual(['A', 'B']);
  });

  it('usunięcie zabiera jego wiadomości', () => {
    const after = removeParticipant(parse(PROSTY), 'A');
    expect(kroki(after)).toHaveLength(0);
    expect(after.sequence!.participants.map((p) => p.id)).toEqual(['B']);
  });

  it('usunięcie czyści też notatki i aktywacje', () => {
    const doc = parse('sequenceDiagram\n    Note over A,B: x\n    activate A\n    A->>B: y');
    const after = removeParticipant(doc, 'A');
    expect(kroki(after).map((s) => s.kind)).toEqual(['note']);
  });
});

describe('autonumber', () => {
  it('włącza i wyłącza', () => {
    const on = setAutonumber(parse(PROSTY), true);
    expect(zapis(on)).toContain('autonumber');
    expect(zapis(setAutonumber(on, false))).not.toContain('autonumber');
  });
});
