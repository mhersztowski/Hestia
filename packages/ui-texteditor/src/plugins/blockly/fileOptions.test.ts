import { describe, it, expect, beforeEach } from 'vitest';
import {
  readFileOptions, writeFileOptions, defaultFileOptions,
  effectiveDialect, type BlocklyFileOptions,
} from './fileOptions';
import { dialectById } from './dialects';

/** Atrapa magazynu wtyczki — wierna hostowi: klucz w klucz, wartość w wartość. */
function makeStorage() {
  const map = new Map<string, unknown>();
  return {
    map,
    api: {
      get<T>(key: string): T | undefined { return map.get(key) as T | undefined; },
      set<T>(key: string, value: T): void { map.set(key, value); },
      delete(key: string): void { map.delete(key); },
    },
  };
}

let storage: ReturnType<typeof makeStorage>;
beforeEach(() => { storage = makeStorage(); });

describe('readFileOptions', () => {
  it('plik bez ustawień dostaje wartości domyślne, a nie undefined', () => {
    // Wywołujący nie ma czym odróżnić „nie ustawiono" od „ustawiono pusto",
    // a i tak w obu przypadkach zachowuje się tak samo.
    expect(readFileOptions(storage.api, '/a/b.ts')).toEqual(defaultFileOptions());
  });

  it('zapis i odczyt tego samego pliku', () => {
    const opts: BlocklyFileOptions = { projects: ['lib.umlproj.json'], dialectId: 'cpp' };
    writeFileOptions(storage.api, '/a/b.ts', opts);
    expect(readFileOptions(storage.api, '/a/b.ts')).toEqual(opts);
  });

  it('ustawienia są **per plik**, nie wspólne', () => {
    // Dwa pliki tego samego projektu bywają budowane z różnych diagramów;
    // jedno wspólne ustawienie znaczyłoby, że otwarcie drugiego pliku po cichu
    // zmienia paletę bloczków w pierwszym.
    writeFileOptions(storage.api, '/a/b.ts', { projects: ['x.umlproj.json'] });
    expect(readFileOptions(storage.api, '/a/c.ts').projects).toEqual([]);
  });

  it('adres zakładki wtyczki wskazuje ten sam plik co ścieżka', () => {
    // Zakładka Blockly ma własny schemat, żeby nie kolidować z zakładką
    // tekstową. Gdyby klucz szedł z adresu wprost, okno opcji otwarte z jednej
    // z nich nie widziałoby ustawień zrobionych w drugiej.
    writeFileOptions(storage.api, '/a/b.ts', { projects: ['x.umlproj.json'] });
    expect(readFileOptions(storage.api, 'blockly:///a/b.ts').projects).toEqual(['x.umlproj.json']);
  });

  it('uszkodzony wpis nie wywraca wtyczki', () => {
    storage.map.set('file:/a/b.ts', 'to nie jest obiekt');
    expect(readFileOptions(storage.api, '/a/b.ts')).toEqual(defaultFileOptions());
  });

  it('brakujące pola są uzupełniane, a nie przepuszczane dalej', () => {
    // Zapisy z wcześniejszej wersji wtyczki nie mają `dialectId`. Odczyt musi
    // je znieść, bo inaczej aktualizacja edytora kasuje cudzą konfigurację.
    storage.map.set('file:/a/b.ts', { projects: ['x.umlproj.json'] });
    const read = readFileOptions(storage.api, '/a/b.ts');
    expect(read.projects).toEqual(['x.umlproj.json']);
    expect(read.dialectId).toBeUndefined();
  });

  it('lista projektów jest odsiewana z wpisów, które nie są napisami', () => {
    storage.map.set('file:/a/b.ts', { projects: ['ok.umlproj.json', 42, null] });
    expect(readFileOptions(storage.api, '/a/b.ts').projects).toEqual(['ok.umlproj.json']);
  });
});

describe('effectiveDialect — czym jest ten plik', () => {
  it('bez wskazania w opcjach decyduje rozszerzenie', () => {
    expect(effectiveDialect('/a/b.py', defaultFileOptions())).toBe(dialectById('python'));
  });

  it('wskazanie w opcjach przebija rozszerzenie', () => {
    // Potrzebne dla plików bez rozszerzenia mówiącego prawdę — nagłówek `.h`
    // bywa czystym C, a `.ino` to C++ mimo własnego rozszerzenia.
    expect(effectiveDialect('/a/b.h', { projects: [], dialectId: 'cpp' })).toBe(dialectById('cpp'));
  });

  it('wskazanie nieznanego języka nie unieważnia rozpoznania po rozszerzeniu', () => {
    // Zapis mógł powstać w nowszej wersji wtyczki. Cofnięcie się do
    // rozszerzenia jest lepsze niż odmowa otwarcia pliku.
    expect(effectiveDialect('/a/b.py', { projects: [], dialectId: 'brainfuck' }))
      .toBe(dialectById('python'));
  });

  it('plik nieobsługiwany zostaje nieobsługiwany', () => {
    expect(effectiveDialect('/a/b.md', defaultFileOptions())).toBeUndefined();
  });
});
