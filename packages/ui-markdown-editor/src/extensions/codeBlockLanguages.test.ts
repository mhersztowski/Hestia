/**
 * Selektor typu bloku kodu.
 *
 * Testy pilnują dwóch rzeczy, które okazały się mylące w praktyce: że blok
 * wczytany z pliku pokazuje swój prawdziwy typ (a nie „plain"), i że bloki
 * bazy wiedzy da się w ogóle założyć z interfejsu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'CodeBlockWithLang.tsx'), 'utf8');
const SLASH = readFileSync(resolve(__dirname, 'SlashCommands.tsx'), 'utf8');

describe('lista typów bloku', () => {
  it('zawiera bloki bazy wiedzy', () => {
    for (const prefix of ['formula', 'sim', 'simscript', 'exercise']) {
      expect(SOURCE, prefix).toMatch(new RegExp(`prefix: '${prefix}'`));
    }
  });

  it('wzór i zadanie dostają identyfikator, symulacja i skrypt nie', () => {
    // `formula` bez identyfikatora nie jest poprawnym infostringiem — widok
    // by się nie pojawił, a autor nie miałby jak tego zauważyć.
    expect(SOURCE).toMatch(/prefix: 'formula', needsId: true/);
    expect(SOURCE).toMatch(/prefix: 'exercise', needsId: true/);
    expect(SOURCE).toMatch(/prefix: 'sim', needsId: false/);
    expect(SOURCE).toMatch(/prefix: 'simscript', needsId: false/);
  });

  it('lista zawiera typ, nie pełny infostring — nazwa wzoru to parametr', () => {
    // `formula:orbita-okres` na liście typów znaczyłoby, że każdy nowy wzór
    // w dokumencie dokłada pozycję do rozwijanego menu.
    expect(SOURCE).toMatch(/value=\{selectedType\}/);
    expect(SOURCE).toMatch(/splitInfostring/);
  });

  it('nazwa bloku ma własne pole obok selektora', () => {
    expect(SOURCE).toMatch(/namedBlock\?\.needsId && \(/);
    expect(SOURCE).toContain('placeholder="nazwa wzoru"');
  });

  it('typ spoza listy pokazuje się wprost, żeby select nie kłamał', () => {
    expect(SOURCE).toMatch(/!LANGS\.some\(\(l\) => l\.value === selectedType\)/);
  });
});

describe('nazwa bloku', () => {
  it('spacje i polskie znaki zamieniają się na dopuszczalne', () => {
    // Reguła sanityzacji jest w kodzie; test pilnuje, że w ogóle istnieje —
    // bez niej „okres wahadła" rozbiłby parsowanie infostringu.
    expect(SOURCE).toMatch(/function sanitizeId/);
    expect(SOURCE).toMatch(/replace\(\/\\s\+\/g, '-'\)/);
  });

  it('pusta nazwa nie kasuje typu bloku', () => {
    expect(SOURCE).toMatch(/if \(czysta\) updateAttributes/);
  });
});

describe('polecenia slash', () => {
  it('wstawiają wszystkie bloki bazy wiedzy', () => {
    for (const title of ['Wzór (baza wiedzy)', 'Układ równań (baza wiedzy)',
      'Symulacja (baza wiedzy)', 'Model w skrypcie (baza wiedzy)', 'Zadanie (baza wiedzy)']) {
      expect(SLASH, title).toContain(title);
    }
  });

  it('wstawiana treść jest gotowa do uruchomienia, nie pusta', () => {
    // Pusty blok `formula` renderuje się komunikatem o błędzie, co wygląda jak
    // usterka edytora zamiast zaproszenia do pisania.
    expect(SLASH).toContain('@vars T: s, L: m, g: m/s^2');
    expect(SLASH).toContain('@state x, v');
    expect(SLASH).toContain('return defineModel({');
    expect(SLASH).toContain('@answer T');
  });
});

describe('tryby bloków', () => {
  const REGISTER = readFileSync(
    resolve(__dirname, '../../../ui-sci-blocks/src/register.ts'), 'utf8',
  );
  const SHELL = readFileSync(
    resolve(__dirname, '../../../ui-sci-blocks/src/BlockShell.tsx'), 'utf8',
  );

  it('każdy blok bazy wiedzy dostaje ramkę z przełącznikiem', () => {
    // Bez przełącznika autor mógłby poprawić wzór wyłącznie w pliku — a pętla
    // „edytuję i widzę" jest powodem, dla którego całość mieszka w MdEditorze.
    for (const renderer of ['FormulaRenderer', 'SimRenderer', 'ScriptRenderer', 'ExerciseRenderer']) {
      const fragment = REGISTER.slice(REGISTER.indexOf(`function ${renderer}`));
      expect(fragment.slice(0, 700), renderer).toContain('BlockShell');
      expect(fragment.slice(0, 700), renderer).toContain('children');
    }
  });

  it('domyślnym trybem jest widok, a błąd otwiera kod', () => {
    expect(SHELL).toMatch(/useState<'view' \| 'code'>\(issues\.length \? 'code' : 'view'\)/);
  });

  it('blok w ramce hosta nie rysuje drugiej ramki', () => {
    for (const name of ['SimBlock', 'ScriptBlock', 'ExerciseBlock', 'FormulaBlockView']) {
      const source = readFileSync(
        resolve(__dirname, `../../../ui-sci-blocks/src/${name}.tsx`), 'utf8',
      );
      expect(source, name).toMatch(/bare\?: boolean/);
      expect(source, name).toMatch(/bare\s*$|bare[,}]|bare\s*\?/m);
    }
  });
});
