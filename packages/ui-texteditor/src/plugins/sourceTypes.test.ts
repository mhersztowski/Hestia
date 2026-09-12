/**
 * Testy listy typów podpowiadanych przy deklaracji zmiennej w bloczkach.
 * Źródłem jest sama treść pliku (plugin nie ma kompilatora), więc sprawdzamy
 * rozpoznawanie deklaracji i importów w kształtach, jakie realnie występują.
 */
import { describe, it, expect } from 'vitest';
import { collectDeclaredTypes, collectImportedTypes, buildTypeOptions, BUILTIN_TS_TYPES, lastImportEnd, insertImportLine } from './sourceTypes';

const CODE = `
import { MObject, Signal as Sig } from '@mhersztowski/minislib';
import type { Config } from './config';
import Logger from './logger';
import * as Utils from './utils';
import { helper } from './helpers';

export class Sensor extends MObject {}
class Internal {}
export interface Reading { value: number }
export type Mode = 'auto' | 'manual';
type Internal2 = { a: string };
export enum Level { Low, High }
`;

describe('collectDeclaredTypes', () => {
  it('znajduje klasy, interfejsy, aliasy i enumy — także nieeksportowane', () => {
    expect(collectDeclaredTypes(CODE)).toEqual(['Internal', 'Internal2', 'Level', 'Mode', 'Reading', 'Sensor']);
  });

  it('radzi sobie z klasą abstrakcyjną i default export', () => {
    expect(collectDeclaredTypes('export default abstract class Base {}')).toEqual(['Base']);
  });

  it('pusty plik daje pustą listę', () => {
    expect(collectDeclaredTypes('')).toEqual([]);
  });
});

describe('collectImportedTypes', () => {
  const found = collectImportedTypes(CODE);
  const names = found.map((f) => f.name);

  it('bierze nazwy z klamer, aliasy w postaci użytecznej w kodzie', () => {
    expect(names).toContain('MObject');
    expect(names).toContain('Sig');        // `Signal as Sig`
    expect(names).not.toContain('Signal');
  });

  it('obsługuje import typu, domyślny i przestrzeń nazw', () => {
    expect(names).toContain('Config');     // import type { Config }
    expect(names).toContain('Logger');     // import Logger from
    expect(names).toContain('Utils');      // import * as Utils
  });

  it('pomija symbole zaczynające się małą literą — to nie typy', () => {
    expect(names).not.toContain('helper');
  });

  it('zapamiętuje moduł źródłowy', () => {
    expect(found.find((f) => f.name === 'Config')?.from).toBe('./config');
  });
});

describe('buildTypeOptions', () => {
  const opts = buildTypeOptions(CODE);

  it('zaczyna od typów wbudowanych', () => {
    expect(opts[0]).toEqual({ label: BUILTIN_TS_TYPES[0], group: 'TypeScript' });
    expect(opts.filter((o) => o.group === 'TypeScript').length).toBe(BUILTIN_TS_TYPES.length);
  });

  it('grupuje typy z pliku i z importów', () => {
    expect(opts.find((o) => o.label === 'Sensor')?.group).toBe('Ten plik');
    expect(opts.find((o) => o.label === 'Config')?.group).toBe('import: ./config');
  });

  it('nie duplikuje pozycji', () => {
    const labels = opts.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('dokłada dodatkowe źródła na końcu', () => {
    const withExtra = buildTypeOptions(CODE, [{ label: 'MTimer', group: '@mhersztowski/minislib' }]);
    expect(withExtra.find((o) => o.label === 'MTimer')?.group).toBe('@mhersztowski/minislib');
  });
});

describe('wstawianie importu', () => {
  const MULTI = `import { A } from './a';
import {
  QtLabelNode,
  QtButtonNode,
} from 'mycastle/qt';

export class X {}
`;

  it('znajduje koniec importu wieloliniowego, nie jego pierwszej linii', () => {
    const end = lastImportEnd(MULTI);
    expect(MULTI.slice(0, end).trimEnd().endsWith("from 'mycastle/qt';")).toBe(true);
  });

  it('nowy import ląduje ZA wieloliniowym, nie w jego środku', () => {
    const out = insertImportLine(MULTI, "import { conn_http_connect } from '../api';");
    const lines = out.split('\n');
    const idxMulti = lines.findIndex((l) => l.includes("from 'mycastle/qt'"));
    const idxNew = lines.findIndex((l) => l.includes('conn_http_connect'));
    expect(idxNew).toBeGreaterThan(idxMulti);
    // Lista nazw pozostaje nienaruszona
    expect(out).toContain('  QtLabelNode,\n  QtButtonNode,\n}');
  });

  it('radzi sobie z importem side-effect i `import type`', () => {
    const code = "import './styles.css';\nimport type { Cfg } from './cfg';\nconst x = 1;\n";
    const out = insertImportLine(code, "import { A } from './a';");
    expect(out.indexOf("from './a'")).toBeGreaterThan(out.indexOf("from './cfg'"));
    expect(out.indexOf("from './a'")).toBeLessThan(out.indexOf('const x'));
  });

  it('plik bez importów dostaje import na początku', () => {
    const out = insertImportLine('const a = 1;\n', "import { A } from './a';");
    expect(out.startsWith("import { A } from './a';\n")).toBe(true);
  });

  it('nie gubi kodu ani nie duplikuje pustych linii', () => {
    const out = insertImportLine(MULTI, "import { B } from './b';");
    expect(out).toContain('export class X {}');
    expect(out).not.toMatch(/\n{3,}/);
  });
});
