import { describe, it, expect } from 'vitest';
import { isNodeBuiltin, needsNodeTypes, extractReferencePaths, resolveReference } from './nodeTypes';

describe('rozpoznanie modułów Node', () => {
  it('moduły wbudowane, także z prefiksem', () => {
    for (const s of ['fs', 'path', 'node:fs', 'node:test', 'fs/promises', 'stream/web']) {
      expect(isNodeBuiltin(s), s).toBe(true);
    }
  });

  it('pakiety z npm to nie moduły wbudowane', () => {
    for (const s of ['phaser', '@types/node', './lokalny', 'fs-extra', 'path-browserify']) {
      expect(isNodeBuiltin(s), s).toBe(false);
    }
  });
});

describe('czy plik potrzebuje typów Node', () => {
  it('import modułu wbudowanego wystarczy', () => {
    expect(needsNodeTypes('', ['node:path'])).toBe(true);
  });

  it('globale Node bez importu też', () => {
    expect(needsNodeTypes('const p = process.env.PORT;', [])).toBe(true);
    expect(needsNodeTypes('const b = Buffer.from("x");', [])).toBe(true);
    expect(needsNodeTypes('console.log(__dirname);', [])).toBe(true);
  });

  // Bez tego każdy plik z `fetch` czy `console` ściągałby kilkadziesiąt
  // deklaracji, których nigdy nie użyje.
  it('plik przeglądarkowy nie potrzebuje', () => {
    const kod = 'const r = await fetch("/api"); console.log(document.title); setTimeout(() => {}, 10);';
    expect(needsNodeTypes(kod, ['phaser'])).toBe(false);
  });

  it('nazwa w środku innego słowa nie liczy się', () => {
    expect(needsNodeTypes('const processData = 1; const preprocess = 2;', [])).toBe(false);
  });

  it('wzmianka w komentarzu ani w napisie nie liczy się', () => {
    expect(needsNodeTypes('// używa process.env\nconst a = 1;', [])).toBe(false);
    expect(needsNodeTypes('const s = "process.env.HOME";', [])).toBe(false);
    expect(needsNodeTypes('/* Buffer i __dirname */ const a = 1;', [])).toBe(false);
  });
});

describe('dyrektywy referencji', () => {
  it('czyta ścieżki, którymi spięte są typy Node', () => {
    const kod = '/// <reference path="fs.d.ts" />\n/// <reference path="./globals.d.ts" />\n/// <reference types="undici" />';
    expect(extractReferencePaths(kod)).toEqual(['fs.d.ts', './globals.d.ts']);
  });

  it('powtórzenia znikają', () => {
    expect(extractReferencePaths('/// <reference path="a.d.ts" />\n/// <reference path="a.d.ts" />')).toEqual(['a.d.ts']);
  });

  it('skleja ścieżkę względem pliku, w którym stała', () => {
    expect(resolveReference('/node_modules/@types/node/index.d.ts', 'fs.d.ts'))
      .toBe('/node_modules/@types/node/fs.d.ts');
    expect(resolveReference('/node_modules/@types/node/ts5.6/index.d.ts', '../globals.d.ts'))
      .toBe('/node_modules/@types/node/globals.d.ts');
  });
});
