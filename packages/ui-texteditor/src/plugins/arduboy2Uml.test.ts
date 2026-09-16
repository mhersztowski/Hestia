/**
 * Diagram `arduboy2js` jest paletą bloczków, a nie obrazkiem: to z niego biorą
 * się nazwy, argumenty i typy w edytorze Blockly. Ten test sprawdza cały
 * łańcuch — wygenerowany plik projektu → `extractCallables` → gotowe wywołania
 * — żeby zmiana w bibliotece albo w generatorze nie wypisała z palety funkcji
 * po cichu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCallables, type UmlProjectLike } from './umlCallables';

const here = dirname(fileURLToPath(import.meta.url));
// The project file travels with the test rather than being read out of the
// library it describes: `arduboy2js` is MyCastle's, and what is tested here is
// `extractCallables` against a real, large UML project — not the library.
const projectPath = resolve(here, '__fixtures__/arduboy2js.umlproj.json');
const project = JSON.parse(readFileSync(projectPath, 'utf8')) as UmlProjectLike;
const callables = extractCallables(project, 'arduboy2js');
const byName = (owner: string, name: string) =>
  callables.find((c) => c.owner === owner && c.name === name);

describe('projekt UML arduboy2js', () => {
  it('wystawia cztery klasy biblioteki', () => {
    expect([...new Set(callables.map((c) => c.owner))].sort()).toEqual([
      'Arduboy2',
      'ArduboyAudio',
      'ArduboyTones',
      'Sprites',
    ]);
  });

  it('ma komplet metod, na których stoi pętla gry', () => {
    for (const name of [
      'begin',
      'nextFrame',
      'clear',
      'display',
      'pressed',
      'justPressed',
      'print',
      'setCursor',
    ]) {
      expect(byName('Arduboy2', name), name).toBeDefined();
    }
  });

  it('zna nazwy i typy argumentów — na nich stoi kontrola typów w bloczkach', () => {
    const fillRect = byName('Arduboy2', 'fillRect')!;
    expect(fillRect.params).toEqual(['x', 'y', 'width', 'height', 'color']);
    expect(fillRect.paramTypes.slice(0, 4)).toEqual(['number', 'number', 'number', 'number']);
    // Argument z wartością domyślną wolno pominąć — typ musi to nieść,
    // inaczej kontrola argumentów upomni się o wartość, która nie jest wymagana.
    expect(fillRect.paramTypes[4]).toContain('undefined');
  });

  it('nie gubi typu generycznego w argumencie', () => {
    // `ArrayLike<number>` ma przecinek… nie ma, ale nawiasy kątowe rozjeżdżają
    // naiwny podział listy parametrów — stąd ten przypadek.
    expect(byName('Arduboy2', 'drawBitmap')!.paramTypes[2]).toBe('ArrayLike<number>');
  });

  it('wywołania są kwalifikowane nazwą klasy', () => {
    expect(byName('Sprites', 'drawSelfMasked')!.callee).toBe('Sprites.drawSelfMasked');
    expect(byName('ArduboyTones', 'tone')!.importName).toBe('ArduboyTones');
  });

  it('każde wywołanie zna plik źródłowy, z którego pochodzi', () => {
    // Bez tego bloczek nie dopisze importu i wygenerowany kod się nie zbuduje.
    for (const callable of callables) {
      expect(callable.file, callable.label).toMatch(
        /^packages\/core\/browser\/arduboy2js\/\w+\.ts$/
      );
    }
  });

  it('opisy z kodu docierają do podpowiedzi bloczka', () => {
    expect(byName('Arduboy2', 'nextFrame')!.doc?.summary).toContain('klatk');
    expect(byName('Arduboy2', 'begin')!.doc?.params?.scene).toContain('scena Phasera');
  });

  // Metody instancyjne bloczki pomijają, więc gdyby generator je wypuścił,
  // diagram miałby pozycje nie do użycia.
  it('nie ma w nim niczego, czego bloczek nie zawoła', () => {
    expect(callables.every((c) => c.ownerKind === 'class')).toBe(true);
    expect(callables.length).toBeGreaterThan(60);
  });
});
