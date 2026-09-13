/**
 * Funkcje (procedury) mają działać w **każdym** dialekcie edytora, nie tylko
 * w tych, dla których generator przychodzi z Blockly. Test przechodzi po
 * wszystkich dialektach i sprawdza, że z definicji i z wywołania rzeczywiście
 * wychodzi kod — bloczek, z którego nic nie wychodzi, jest gorszy niż jego brak,
 * bo problem widać dopiero po pustym miejscu w wyniku.
 */
import { describe, it, expect } from 'vitest';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { allDialects } from './dialects';
import { generatorFor } from './generators';

/** Definicja `podwoj(a)` z wynikiem oraz jej wywołanie z argumentem. */
function workspaceWithProcedure(): Blockly.Workspace {
  const ws = new Blockly.Workspace();
  ws.createVariable('a');
  Blockly.serialization.workspaces.load({
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'procedures_defreturn', id: 'def', x: 0, y: 0,
          fields: { NAME: 'podwoj' },
          extraState: { params: [{ name: 'a' }] },
          inputs: { RETURN: { block: { type: 'math_number', id: 'n', fields: { NUM: 2 } } } },
        },
        {
          type: 'procedures_callnoreturn', id: 'call', x: 0, y: 300,
          extraState: { name: 'podwoj', params: ['a'] },
          inputs: { ARG0: { block: { type: 'math_number', id: 'm', fields: { NUM: 21 } } } },
        },
      ],
    },
  }, ws);
  return ws;
}

describe('funkcje w każdym dialekcie', () => {
  for (const dialect of allDialects()) {
    it(`${dialect.label}: definicja i wywołanie dają kod`, async () => {
      const generator = await generatorFor(dialect);
      const code = generator.workspaceToCode(workspaceWithProcedure());
      expect(code).toContain('podwoj');
      // Wywołanie musi nieść argument — sama nazwa funkcji pojawiłaby się
      // także wtedy, gdyby generator znał definicję, ale nie wywołanie.
      expect(code).toContain('21');
    });
  }
});

describe('wcześniejsze wyjście z funkcji (C++)', () => {
  const build = (defType: string) => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: defType, id: 'd', fields: { NAME: 'f' },
          inputs: {
            STACK: { block: {
              type: 'procedures_ifreturn', id: 'r',
              inputs: {
                CONDITION: { block: { type: 'logic_boolean', id: 'b', fields: { BOOL: 'TRUE' } } },
                VALUE: { block: { type: 'math_number', id: 'v', fields: { NUM: 7 } } },
              },
            } },
            ...(defType === 'procedures_defreturn'
              ? { RETURN: { block: { type: 'math_number', id: 'n', fields: { NUM: 0 } } } }
              : {}),
          },
        }],
      },
    }, ws);
    return ws;
  };

  it('funkcja bez wyniku wraca bez wartości', async () => {
    const { createCppGenerator } = await import('./cppGenerator');
    expect(createCppGenerator().workspaceToCode(build('procedures_defnoreturn')))
      .toMatch(/if \(true\) \{\s*return;/);
  });

  it('funkcja z wynikiem wraca z wartością', async () => {
    const { createCppGenerator } = await import('./cppGenerator');
    expect(createCppGenerator().workspaceToCode(build('procedures_defreturn')))
      .toMatch(/if \(true\) \{\s*return 7;/);
  });
});
