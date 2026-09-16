/**
 * Bloczek `emit`/`call` przebudowuje wejścia pod arność wybranego sygnału
 * albo slotu. Test pilnuje trzech rzeczy, które łatwo zepsuć: liczby wejść,
 * zachowania podłączonych bloków przy zmianie oraz zgodności z bloczkami
 * zapisanymi w czasach, gdy argument był dokładnie jeden.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';
import { defineDynArgsBlock, type DynArgsBlock } from './dynArgsBlock';
import type { SignalArg } from './classMembers';

const ARGS: Record<string, SignalArg[]> = {
  brak: [],
  jeden: [{ name: 'v', type: 'number' }],
  dwa: [
    { name: 'x', type: 'number' },
    { name: 'y', type: 'number' },
  ],
};

defineDynArgsBlock({
  type: 'test_emit',
  colour: 280,
  tooltip: 'test',
  prefix: 'this.',
  suffix: '.emit(',
  firstInput: 'VALUE',
  nameOpts: () => Object.keys(ARGS).map((k) => [k, k] as [string, string]),
  argsFor: (n) => ARGS[n] ?? [],
  code: (n, args) => `this.${n}.emit(${args.join(', ')});\n`,
});

let ws: Blockly.Workspace;
beforeEach(() => {
  ws = new Blockly.Workspace();
});

/** Pole dropdownu zmienia kształt bloczka poza walidacją — stąd oczekiwanie na tik. */
const tick = () => new Promise((r) => setTimeout(r, 0));

const inputNames = (b: Blockly.Block) => b.inputList.map((i) => i.name);

describe('bloczek o zmiennej liczbie wejść', () => {
  it('startuje z jednym wejściem o starej nazwie', () => {
    const b = ws.newBlock('test_emit') as DynArgsBlock;
    expect(b.argCount_).toBe(1);
    expect(inputNames(b)).toContain('VALUE');
  });

  it('dopasowuje liczbę wejść do arności wybranej nazwy', async () => {
    const b = ws.newBlock('test_emit') as DynArgsBlock;
    b.setFieldValue('dwa', 'NAME');
    await tick();
    expect(b.argCount_).toBe(2);
    expect(inputNames(b)).toEqual(expect.arrayContaining(['VALUE', 'ARG1']));

    b.setFieldValue('brak', 'NAME');
    await tick();
    expect(b.argCount_).toBe(0);
    expect(inputNames(b)).not.toContain('VALUE');
  });

  it('generuje wywołanie z wszystkimi argumentami', async () => {
    const b = ws.newBlock('test_emit') as DynArgsBlock;
    b.setFieldValue('dwa', 'NAME');
    await tick();
    for (const [input, value] of [
      ['VALUE', 1],
      ['ARG1', 2],
    ] as const) {
      const num = ws.newBlock('math_number');
      num.setFieldValue(String(value), 'NUM');
      b.getInput(input)!.connection!.connect(num.outputConnection!);
    }
    expect(javascriptGenerator.blockToCode(b)).toBe('this.dwa.emit(1, 2);\n');
  });

  it('brakujący argument wychodzi jako undefined, nie jako pusty nawias', async () => {
    const b = ws.newBlock('test_emit') as DynArgsBlock;
    b.setFieldValue('dwa', 'NAME');
    await tick();
    expect(javascriptGenerator.blockToCode(b)).toBe('this.dwa.emit(undefined, undefined);\n');
  });

  // Przebudowa usuwa i tworzy wejścia od nowa; bez ponownego podłączenia
  // wpięte wyrażenie zostawałoby luzem na kanwie po każdej zmianie sygnału.
  it('zachowuje podłączone bloki przy zmianie liczby wejść', async () => {
    const b = ws.newBlock('test_emit') as DynArgsBlock;
    b.setFieldValue('dwa', 'NAME');
    await tick();
    const num = ws.newBlock('math_number');
    num.setFieldValue('7', 'NUM');
    b.getInput('VALUE')!.connection!.connect(num.outputConnection!);

    b.setFieldValue('jeden', 'NAME');
    await tick();
    expect(num.isDisposed()).toBe(false);
    expect(b.getInput('VALUE')!.connection!.targetBlock()).toBe(num);
    expect(javascriptGenerator.blockToCode(b)).toBe('this.jeden.emit(7);\n');
  });

  it('round-trip przez serializację zachowuje liczbę wejść', async () => {
    const b = ws.newBlock('test_emit') as DynArgsBlock;
    b.setFieldValue('dwa', 'NAME');
    await tick();

    const state = (Blockly as any).serialization.workspaces.save(ws);
    const ws2 = new Blockly.Workspace();

    (Blockly as any).serialization.workspaces.load(state, ws2);
    const restored = ws2.getAllBlocks(false)[0] as DynArgsBlock;
    expect(restored.argCount_).toBe(2);
  });

  // Bloczki zapisane przed tą zmianą nie mają `extraState` ani `ARG1`.
  it('wczytuje zapis sprzed wielu argumentów z podłączoną wartością', () => {
    const state = {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'test_emit',
            id: 'stary',
            fields: { NAME: 'jeden' },
            inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: 5 } } } },
          },
        ],
      },
    };

    (Blockly as any).serialization.workspaces.load(state, ws);
    const b = ws.getBlockById('stary') as DynArgsBlock;
    expect(b.argCount_).toBe(1);
    expect(javascriptGenerator.blockToCode(b)).toBe('this.jeden.emit(5);\n');
  });
});
