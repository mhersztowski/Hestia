import { describe, it, expect, beforeEach } from 'vitest';
import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';
import { defineUmlBlocks, umlBlockType, toolboxWithUml } from './umlToolbox';
import { dialectById, allDialects } from './dialects';
import type { UmlCallable } from '../umlCallables';

const call = (over: Partial<UmlCallable> = {}): UmlCallable => ({
  id: 'p::Api::load',
  project: 'p',
  owner: 'Api',
  ownerKind: 'class',
  name: 'load',
  params: [],
  paramTypes: [],
  isAsync: false,
  callee: 'Api.load',
  importName: 'Api',
  label: 'Api.load()',
  ...over,
});

const js = dialectById('javascript')!;
const cpp = dialectById('cpp')!;

beforeEach(() => {
  // Rejestracja bloczków jest globalna — czyścimy, żeby test nie oglądał
  // skutków poprzedniego.
  for (const key of Object.keys(Blockly.Blocks)) {
    if (key.startsWith('uml_')) delete Blockly.Blocks[key];
  }
});

describe('umlBlockType — tożsamość bloczka', () => {
  it('jest stabilna między wywołaniami', () => {
    expect(umlBlockType(call(), js)).toBe(umlBlockType(call(), js));
  });

  it('rozróżnia języki o innej składni wywołania', () => {
    // C++ pisze `Api::load`, JavaScript `Api.load`. Gdyby bloczek był jeden,
    // etykieta i wygenerowany kod rozjechałyby się z językiem pliku.
    expect(umlBlockType(call(), cpp)).not.toBe(umlBlockType(call(), js));
  });

  it('nie rozróżnia języków dzielących składnię i generator', () => {
    // TypeScript to ten sam generator i ta sama składnia co JavaScript —
    // osobne bloczki byłyby dwoma nazwami tej samej rzeczy.
    expect(umlBlockType(call(), dialectById('typescript')!)).toBe(umlBlockType(call(), js));
  });

  it('znaki spoza identyfikatora nie trafiają do typu', () => {
    const type = umlBlockType(call({ owner: 'My-Class', name: 'do it' }), js);
    expect(type).toMatch(/^[A-Za-z0-9_]+$/);
  });
});

describe('defineUmlBlocks', () => {
  it('funkcja zwracająca wartość dostaje bloczek z wyjściem', () => {
    defineUmlBlocks([call({ returnType: 'string' })], js, javascriptGenerator);
    const type = umlBlockType(call(), js);
    const block = new Blockly.Block(new Blockly.Workspace(), type);
    expect(block.outputConnection).not.toBeNull();
    expect(block.previousConnection).toBeNull();
  });

  it('funkcja bez zwracanej wartości jest instrukcją', () => {
    defineUmlBlocks([call({ returnType: 'void' })], js, javascriptGenerator);
    const block = new Blockly.Block(new Blockly.Workspace(), umlBlockType(call(), js));
    expect(block.outputConnection).toBeNull();
    expect(block.previousConnection).not.toBeNull();
    expect(block.nextConnection).not.toBeNull();
  });

  it('każdy argument dostaje własne wejście wartości', () => {
    defineUmlBlocks(
      [call({ params: ['a', 'b'], paramTypes: ['string', 'number'] })],
      js,
      javascriptGenerator
    );
    const block = new Blockly.Block(new Blockly.Workspace(), umlBlockType(call(), js));
    expect(block.getInput('ARG0')).not.toBeNull();
    expect(block.getInput('ARG1')).not.toBeNull();
    expect(block.getInput('ARG2')).toBeNull();
  });

  it('generator języka dostaje wywołanie w składni tego języka', () => {
    const c = call({ returnType: 'void' });
    defineUmlBlocks([c], cpp, javascriptGenerator);
    const gen = javascriptGenerator.forBlock[umlBlockType(c, cpp)];
    expect(gen).toBeTypeOf('function');
    const block = new Blockly.Block(new Blockly.Workspace(), umlBlockType(c, cpp));
    // Brak podłączonych argumentów — liczy się sama składnia wywołania.
    expect(String(gen(block, javascriptGenerator))).toContain('Api::load(');
  });

  it('ponowne zdefiniowanie tych samych bloczków nie jest błędem', () => {
    // Wtyczka woła to przy każdym otwarciu zakładki i po każdej zmianie
    // wyboru projektów — wyjątek przy drugim przebiegu zamykałby edytor.
    const c = call({ returnType: 'void' });
    defineUmlBlocks([c], js, javascriptGenerator);
    expect(() => defineUmlBlocks([c], js, javascriptGenerator)).not.toThrow();
  });

  it('zwraca kategorie zgrupowane po klasie, bez pustych', () => {
    const cats = defineUmlBlocks(
      [
        call({ owner: 'Api', name: 'load', returnType: 'void' }),
        call({
          id: 'p::Api::save',
          owner: 'Api',
          name: 'save',
          callee: 'Api.save',
          returnType: 'void',
        }),
        call({
          id: 'p::Fs::read',
          owner: 'Fs',
          name: 'read',
          callee: 'Fs.read',
          returnType: 'void',
        }),
      ],
      js,
      javascriptGenerator
    );
    expect(cats.map((c) => c.name)).toEqual(['Api', 'Fs']);
    expect(cats[0].contents).toHaveLength(2);
  });

  it('pusta lista funkcji daje pustą listę kategorii', () => {
    expect(defineUmlBlocks([], js, javascriptGenerator)).toEqual([]);
  });
});

describe('toolboxWithUml', () => {
  it('kategorie z UML-a idą po standardowych, oddzielone separatorem', () => {
    // Kolejność nie jest kosmetyką: bloczki standardowe są wspólne dla
    // wszystkich plików, a te z UML-a zmieniają się razem z wyborem diagramu.
    // Stałe miejsce na górze oznacza, że pamięć mięśniowa nie przestaje działać
    // po podmianie projektu.
    const toolbox = toolboxWithUml([{ kind: 'category', name: 'Api', colour: '10', contents: [] }]);
    const names = toolbox.contents.map((c) => ('name' in c ? c.name : '—'));
    expect(names[names.length - 1]).toBe('Api');
    expect(names).toContain('Logika');
  });

  it('bez projektów UML zostają same bloczki standardowe', () => {
    const toolbox = toolboxWithUml([]);
    expect(toolbox.contents.every((c) => c.kind === 'category')).toBe(true);
    expect(toolbox.contents.length).toBeGreaterThan(0);
  });

  it('zmienne są kategorią wypełnianą przez Blockly, nie listą stałą', () => {
    // Zmienne tworzy użytkownik w trakcie pracy — wypisanie ich z góry
    // znaczyłoby przybornik, który po dodaniu zmiennej jej nie pokazuje.
    const names = toolboxWithUml([]).contents;
    expect(names.some((c) => 'custom' in c && c.custom === 'VARIABLE')).toBe(true);
  });

  it('C++ nie dostaje kategorii list — generator ich nie obsługuje', () => {
    // Bloczek, z którego nie wychodzi kod, jest gorszy niż jego brak:
    // użytkownik układa z niego program i widzi problem dopiero po pustym
    // miejscu w wyniku.
    const cppNames = toolboxWithUml([], dialectById('cpp')).contents.map((c) =>
      'name' in c ? c.name : '—'
    );
    expect(cppNames).not.toContain('Listy');
    const jsNames = toolboxWithUml([], dialectById('javascript')).contents.map((c) =>
      'name' in c ? c.name : '—'
    );
    expect(jsNames).toContain('Listy');
  });

  it('każdy dialekt ma kategorię Funkcje wypełnianą przez Blockly', () => {
    // Lista funkcji zależy od tego, co użytkownik zdefiniuje w trakcie pracy —
    // stała lista bloczków pokazywałaby definicje, ale nigdy wywołań.
    for (const dialect of allDialects()) {
      const contents = toolboxWithUml([], dialect).contents;
      expect(
        contents.some((c) => 'custom' in c && c.custom === 'PROCEDURE'),
        `dialekt ${dialect.id}`
      ).toBe(true);
    }
  });
});
