import { describe, it, expect } from 'vitest';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { createCppGenerator } from './cppGenerator';

/** Buduje workspace z jednego bloczka opisanego stanem JSON i generuje kod. */
function generate(blocks: object): string {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [blocks] } }, ws);
  return createCppGenerator().workspaceToCode(ws).trim();
}

describe('liczby i arytmetyka', () => {
  it('liczba całkowita zostaje całkowita', () => {
    // `3` wypisane jako `3.0` sugerowałoby typ, którego użytkownik nie wybrał.
    expect(generate({ type: 'math_number', fields: { NUM: 3 } , id: 'a' })).toContain('3');
    expect(generate({ type: 'math_number', fields: { NUM: 3 }, id: 'a' })).not.toContain('3.0');
  });

  it('dodawanie', () => {
    const code = generate({
      type: 'math_arithmetic', id: 'a', fields: { OP: 'ADD' },
      inputs: {
        A: { block: { type: 'math_number', id: 'b', fields: { NUM: 1 } } },
        B: { block: { type: 'math_number', id: 'c', fields: { NUM: 2 } } },
      },
    });
    expect(code).toContain('1 + 2');
  });

  it('potęgowanie idzie przez funkcję, bo `^` w C++ to XOR', () => {
    // Najbardziej podstępna różnica: `2 ^ 3` kompiluje się i daje 1.
    const code = generate({
      type: 'math_arithmetic', id: 'a', fields: { OP: 'POWER' },
      inputs: {
        A: { block: { type: 'math_number', id: 'b', fields: { NUM: 2 } } },
        B: { block: { type: 'math_number', id: 'c', fields: { NUM: 3 } } },
      },
    });
    expect(code).toContain('std::pow(2, 3)');
    expect(code).not.toMatch(/2\s*\^\s*3/);
  });
});

describe('logika', () => {
  it('wartości logiczne po C++owemu', () => {
    expect(generate({ type: 'logic_boolean', id: 'a', fields: { BOOL: 'TRUE' } })).toContain('true');
  });

  it('porównanie równości', () => {
    const code = generate({
      type: 'logic_compare', id: 'a', fields: { OP: 'EQ' },
      inputs: {
        A: { block: { type: 'math_number', id: 'b', fields: { NUM: 1 } } },
        B: { block: { type: 'math_number', id: 'c', fields: { NUM: 1 } } },
      },
    });
    expect(code).toContain('1 == 1');
  });

  it('koniunkcja używa `&&`, nie `and`', () => {
    const code = generate({
      type: 'logic_operation', id: 'a', fields: { OP: 'AND' },
      inputs: {
        A: { block: { type: 'logic_boolean', id: 'b', fields: { BOOL: 'TRUE' } } },
        B: { block: { type: 'logic_boolean', id: 'c', fields: { BOOL: 'FALSE' } } },
      },
    });
    expect(code).toContain('true && false');
  });

  it('pustą wartość zapisujemy jako nullptr', () => {
    expect(generate({ type: 'logic_null', id: 'a' })).toContain('nullptr');
  });
});

describe('sterowanie', () => {
  it('warunek dostaje nawiasy klamrowe', () => {
    const code = generate({
      type: 'controls_if', id: 'a',
      inputs: { IF0: { block: { type: 'logic_boolean', id: 'b', fields: { BOOL: 'TRUE' } } } },
    });
    expect(code).toMatch(/if \(true\) \{/);
    expect(code).toContain('}');
  });

  it('powtórzenie n razy używa pętli licznikowej', () => {
    const code = generate({
      type: 'controls_repeat_ext', id: 'a',
      inputs: { TIMES: { block: { type: 'math_number', id: 'b', fields: { NUM: 5 } } } },
    });
    expect(code).toMatch(/for \(int \w+ = 0; \w+ < 5; \w+\+\+\)/);
  });

  it('„dopóki" i „aż" różnią się negacją, a nie słowem kluczowym', () => {
    const whileCode = generate({
      type: 'controls_whileUntil', id: 'a', fields: { MODE: 'WHILE' },
      inputs: { BOOL: { block: { type: 'logic_boolean', id: 'b', fields: { BOOL: 'TRUE' } } } },
    });
    const untilCode = generate({
      type: 'controls_whileUntil', id: 'a', fields: { MODE: 'UNTIL' },
      inputs: { BOOL: { block: { type: 'logic_boolean', id: 'b', fields: { BOOL: 'TRUE' } } } },
    });
    expect(whileCode).toContain('while (true)');
    expect(untilCode).toContain('while (!true)');
  });
});

describe('tekst', () => {
  it('napis w cudzysłowie podwójnym — pojedynczy to w C++ znak', () => {
    // `'abc'` w C++ jest stałą znakową o wartości zależnej od implementacji.
    const code = generate({ type: 'text', id: 'a', fields: { TEXT: 'abc' } });
    expect(code).toContain('"abc"');
  });

  it('cudzysłów w treści jest poprzedzany ukośnikiem', () => {
    const code = generate({ type: 'text', id: 'a', fields: { TEXT: 'a"b' } });
    expect(code).toContain('"a\\"b"');
  });

  it('wypisanie dokłada nagłówek iostream', () => {
    // Kod z `std::cout` bez `#include <iostream>` nie kompiluje się, a błąd
    // wskazuje na linię, której użytkownik nie pisał.
    const code = generate({
      type: 'text_print', id: 'a',
      inputs: { TEXT: { block: { type: 'text', id: 'b', fields: { TEXT: 'hej' } } } },
    });
    expect(code).toContain('#include <iostream>');
    expect(code).toContain('std::cout << "hej" << std::endl;');
  });
});

describe('zmienne', () => {
  it('pierwsze przypisanie deklaruje przez auto, kolejne już nie', () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({
      variables: [{ name: 'licznik', id: 'V1' }],
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: 'variables_set', id: 'a', fields: { VAR: { id: 'V1' } },
          inputs: { VALUE: { block: { type: 'math_number', id: 'b', fields: { NUM: 1 } } } },
          next: {
            block: {
              type: 'variables_set', id: 'c', fields: { VAR: { id: 'V1' } },
              inputs: { VALUE: { block: { type: 'math_number', id: 'd', fields: { NUM: 2 } } } },
            },
          },
        }],
      },
    }, ws);
    const code = createCppGenerator().workspaceToCode(ws);
    expect(code).toContain('auto licznik = 1;');
    expect(code).toContain('licznik = 2;');
    // Druga deklaracja byłaby błędem kompilacji „redefinition of 'licznik'".
    expect(code.match(/auto licznik/g)).toHaveLength(1);
  });

  it('nazwa niedozwolona w C++ jest poprawiana, nie przepuszczana', () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({
      variables: [{ name: 'mój licznik', id: 'V1' }],
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: 'variables_set', id: 'a', fields: { VAR: { id: 'V1' } },
          inputs: { VALUE: { block: { type: 'math_number', id: 'b', fields: { NUM: 1 } } } },
        }],
      },
    }, ws);
    const code = createCppGenerator().workspaceToCode(ws);
    expect(code).not.toContain('mój licznik');
    expect(code).toMatch(/auto \w+ = 1;/);
  });
});

describe('nagłówki', () => {
  it('każdy nagłówek pojawia się raz, choćby był potrzebny wielokrotnie', () => {
    const code = generate({
      type: 'text_print', id: 'a',
      inputs: { TEXT: { block: { type: 'text', id: 'b', fields: { TEXT: 'x' } } } },
      next: {
        block: {
          type: 'text_print', id: 'c',
          inputs: { TEXT: { block: { type: 'text', id: 'd', fields: { TEXT: 'y' } } } },
        },
      },
    });
    expect(code.match(/#include <iostream>/g)).toHaveLength(1);
  });
});

describe('funkcje', () => {
  /** Warsztat z definicją funkcji i (opcjonalnie) jej wywołaniem. */
  const withProcedure = (blocks: object[]): string => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks } }, ws);
    return createCppGenerator().workspaceToCode(ws).trim();
  };

  it('procedura bez wyniku wychodzi jako void', () => {
    const code = withProcedure([{
      type: 'procedures_defnoreturn', id: 'd', fields: { NAME: 'powitaj' },
      inputs: { STACK: { block: { type: 'text_print', id: 'p',
        inputs: { TEXT: { block: { type: 'text', id: 't', fields: { TEXT: 'hej' } } } } } } },
    }]);
    expect(code).toMatch(/void powitaj\(\)\s*\{/);
    expect(code).toContain('"hej"');
  });

  it('funkcja z wynikiem zwraca wartość', () => {
    const code = withProcedure([{
      type: 'procedures_defreturn', id: 'd', fields: { NAME: 'dwa' },
      inputs: { RETURN: { block: { type: 'math_number', id: 'n', fields: { NUM: 2 } } } },
    }]);
    expect(code).toMatch(/auto dwa\(\)\s*\{/);
    expect(code).toContain('return 2;');
  });

  // Bloczki nie mówią o typach parametrów, a C++ ich wymaga. Szablon jest
  // jedynym zapisem, który działa od C++11 — `auto` w parametrze to C++20.
  it('parametry idą przez szablon, bo bloczki nie znają typów', () => {
    const ws = new Blockly.Workspace();
    ws.createVariable('a');
    ws.createVariable('b');
    Blockly.serialization.workspaces.load({
      blocks: { languageVersion: 0, blocks: [{
        type: 'procedures_defreturn', id: 'd', fields: { NAME: 'suma' },
        extraState: { params: [{ name: 'a' }, { name: 'b' }] },
        inputs: { RETURN: { block: { type: 'math_number', id: 'n', fields: { NUM: 0 } } } },
      }] },
    }, ws);
    const code = createCppGenerator().workspaceToCode(ws).trim();
    expect(code).toMatch(/template\s*<typename T0, typename T1>/);
    expect(code).toMatch(/auto suma\(T0 a, T1 b\)/);
  });

  it('wywołanie funkcji z argumentami', () => {
    const ws = new Blockly.Workspace();
    ws.createVariable('a');
    Blockly.serialization.workspaces.load({
      blocks: { languageVersion: 0, blocks: [
        {
          type: 'procedures_defreturn', id: 'd', fields: { NAME: 'podwoj' },
          extraState: { params: [{ name: 'a' }] },
          inputs: { RETURN: { block: { type: 'math_number', id: 'n', fields: { NUM: 0 } } } },
        },
        {
          type: 'procedures_callreturn', id: 'c', extraState: { name: 'podwoj', params: ['a'] },
          inputs: { ARG0: { block: { type: 'math_number', id: 'm', fields: { NUM: 21 } } } },
        },
      ] },
    }, ws);
    expect(createCppGenerator().workspaceToCode(ws)).toContain('podwoj(21)');
  });

  // Definicja musi stać przed użyciem — C++ nie widzi funkcji zdefiniowanej niżej.
  it('definicje lądują przed resztą kodu', () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({
      blocks: { languageVersion: 0, blocks: [
        { type: 'procedures_callnoreturn', id: 'c', x: 0, y: 200, extraState: { name: 'powitaj', params: [] } },
        { type: 'procedures_defnoreturn', id: 'd', x: 0, y: 0, fields: { NAME: 'powitaj' } },
      ] },
    }, ws);
    const code = createCppGenerator().workspaceToCode(ws);
    expect(code.indexOf('void powitaj()')).toBeLessThan(code.indexOf('powitaj();'));
  });

  it('wcześniejszy return wewnątrz funkcji', () => {
    const code = withProcedure([{
      type: 'procedures_defnoreturn', id: 'd', fields: { NAME: 'sprawdz' },
      inputs: { STACK: { block: {
        type: 'procedures_ifreturn', id: 'r',
        inputs: { CONDITION: { block: { type: 'logic_boolean', id: 'b', fields: { BOOL: 'TRUE' } } } },
      } } },
    }]);
    expect(code).toMatch(/if \(true\) \{\s*return;/);
  });
});
