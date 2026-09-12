/**
 * Testy funkcji z UML wystawianych do bloczków slotów.
 *
 * Sens tej warstwy: z projektu UML mają wyjść WYŁĄCZNIE rzeczy, które da się
 * wywołać w slocie (funkcje globalne i metody statyczne), z poprawnym `await`
 * dla asynchronicznych i z importem policzonym względem edytowanego pliku.
 */
import { describe, it, expect } from 'vitest';
import {
  parseMemberLine, extractCallables, importSpecifierFor, callExpression,
  blockTypeFor, categoryFor, returnsValue, groupByCategory, extractTypes, hasDoc, docSections,
  type UmlProjectLike,
} from './umlCallables';

const PROJECT: UmlProjectLike = {
  name: 'Core',
  diagrams: [{
    nodes: [
      {
        data: {
          kind: 'module', name: 'helpers', linkedFile: 'drive/src/utils/helpers.ts',
          members: [
            { kind: 'method', text: '+ formatDate(d: Date): string' },
            { kind: 'method', text: '+ async loadConfig(path: string): Promise<Config>', category: 'async' },
            { kind: 'field', text: '+ VERSION: string' },
          ],
        },
      },
      {
        data: {
          kind: 'class', name: 'Api', linkedFile: 'drive/src/api/Api.ts',
          members: [
            { kind: 'method', text: '+ static async fetchOne(id: string): Promise<string>', category: 'async' },
            { kind: 'method', text: '+ static create(): Api' },
            { kind: 'method', text: '+ send(payload: Map<string, number>, retries: number): void' },
            { kind: 'method', text: '+ constructor(url: string)' },
          ],
        },
      },
    ],
  }],
};

describe('parseMemberLine', () => {
  it('rozkłada sygnaturę na części', () => {
    expect(parseMemberLine('+ static async fetchOne(id: string): Promise<string>')).toEqual({
      name: 'fetchOne', params: ['id'], paramTypes: ['string'],
      returnType: 'Promise<string>', isStatic: true, isAsync: true,
    });
  });

  it('przyjmuje modyfikatory w odwrotnej kolejności (ręcznie edytowany diagram)', () => {
    const parsed = parseMemberLine('- async static run()');
    expect(parsed).toMatchObject({ name: 'run', isStatic: true, isAsync: true, params: [] });
  });

  it('nie tnie parametrów po przecinku wewnątrz typu generycznego', () => {
    expect(parseMemberLine('+ send(payload: Map<string, number>, retries: number): void')?.params)
      .toEqual(['payload', 'retries']);
  });

  it('pola i śmieci odrzuca', () => {
    expect(parseMemberLine('+ VERSION: string')).toBeNull();
    expect(parseMemberLine('')).toBeNull();
  });
});

describe('extractCallables', () => {
  const found = extractCallables(PROJECT, 'core.umlproj.json');
  const byName = (n: string) => found.find((c) => c.name === n);

  it('bierze funkcje globalne z modułów i metody statyczne z klas', () => {
    expect(found.map((c) => c.callee).sort())
      .toEqual(['Api.create', 'Api.fetchOne', 'formatDate', 'loadConfig']);
  });

  it('pomija metody instancyjne i konstruktor — slot nie ma na czym ich wywołać', () => {
    expect(byName('send')).toBeUndefined();
    expect(byName('constructor')).toBeUndefined();
  });

  it('przenosi asynchroniczność (z kategorii albo ze słowa w sygnaturze)', () => {
    expect(byName('loadConfig')?.isAsync).toBe(true);
    expect(byName('fetchOne')?.isAsync).toBe(true);
    expect(byName('formatDate')?.isAsync).toBe(false);
  });

  it('importujemy klasę dla metody statycznej, a samą funkcję dla globalnej', () => {
    expect(byName('fetchOne')?.importName).toBe('Api');
    expect(byName('loadConfig')?.importName).toBe('loadConfig');
  });

  it('etykieta pokazuje pełne wywołanie z parametrami', () => {
    expect(byName('fetchOne')?.label).toBe('async Api.fetchOne(id)');
    expect(byName('formatDate')?.label).toBe('formatDate(d)');
  });

  it('pusty projekt nie wywraca się', () => {
    expect(extractCallables({}, 'x')).toEqual([]);
    expect(extractCallables({ diagrams: [{ nodes: [{}] }] }, 'x')).toEqual([]);
  });
});

describe('importSpecifierFor', () => {
  const found = extractCallables(PROJECT, 'core.umlproj.json');
  const api = found.find((c) => c.name === 'fetchOne')!;
  const helper = found.find((c) => c.name === 'formatDate')!;

  it('liczy ścieżkę względem edytowanego pliku', () => {
    expect(importSpecifierFor(api, 'drive/src/app/main.ts')).toBe('../api/Api');
    expect(importSpecifierFor(helper, 'drive/src/utils/other.ts')).toBe('./helpers');
  });

  it('schodzi w głąb, gdy cel leży niżej', () => {
    expect(importSpecifierFor(api, 'drive/src/main.ts')).toBe('./api/Api');
  });

  it('null, gdy symbol jest w tym samym pliku albo UML nie zna źródła', () => {
    expect(importSpecifierFor(api, 'drive/src/api/Api.ts')).toBeNull();
    expect(importSpecifierFor({ ...api, file: undefined }, 'drive/src/main.ts')).toBeNull();
  });
});

describe('callExpression', () => {
  const found = extractCallables(PROJECT, 'core.umlproj.json');

  it('asynchroniczne wywołanie dostaje await', () => {
    const api = found.find((c) => c.name === 'fetchOne')!;
    expect(callExpression(api, ["'42'"])).toBe("await Api.fetchOne('42')");
  });

  it('zwykłe wywołanie zostaje bez await', () => {
    const helper = found.find((c) => c.name === 'formatDate')!;
    expect(callExpression(helper, ['now'])).toBe('formatDate(now)');
  });
});

describe('bloczki i kategorie', () => {
  const found = extractCallables(PROJECT, 'core.umlproj.json');
  const byName = (n: string) => found.find((c) => c.name === n)!;

  it('typ bloczka jest stabilny i bezpieczny jako identyfikator', () => {
    expect(blockTypeFor(byName('fetchOne'))).toBe('uml_Api_fetchOne');
    expect(blockTypeFor(byName('formatDate'))).toBe('uml_helpers_formatDate');
    expect(blockTypeFor({ ...byName('fetchOne'), owner: 'My Class!', name: 'do-it' })).toBe('uml_My_Class__do_it');
  });

  it('kategoria to klasa dla statycznych, a plik dla globalnych', () => {
    expect(categoryFor(byName('fetchOne'))).toBe('Api');
    expect(categoryFor(byName('formatDate'))).toBe('helpers');
  });

  it('bloczek ma wyjście tylko dla funkcji zwracających wartość', () => {
    expect(returnsValue(byName('fetchOne'))).toBe(true);          // Promise<string>
    expect(returnsValue(byName('formatDate'))).toBe(true);        // string
    expect(returnsValue({ ...byName('formatDate'), returnType: 'void' })).toBe(false);
    expect(returnsValue({ ...byName('formatDate'), returnType: 'Promise<void>' })).toBe(false);
    expect(returnsValue({ ...byName('formatDate'), returnType: undefined })).toBe(false);
  });

  it('grupowanie daje kategorie posortowane po nazwie', () => {
    const groups = groupByCategory(found);
    expect(groups.map((g) => g.category)).toEqual(['Api', 'helpers']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['create', 'fetchOne']);
  });
});

describe('extractTypes', () => {
  it('bierze klasy i interfejsy, pomija moduły (to pliki, nie typy)', () => {
    const types = extractTypes(PROJECT, 'core.umlproj.json');
    expect(types.map((t) => t.name)).toEqual(['Api']);
    expect(types[0]).toMatchObject({ kind: 'class', project: 'Core', file: 'drive/src/api/Api.ts' });
  });

  it('nie duplikuje typu występującego na kilku diagramach', () => {
    const twice: UmlProjectLike = {
      name: 'X',
      diagrams: [
        { nodes: [{ data: { kind: 'class', name: 'Same' } }] },
        { nodes: [{ data: { kind: 'class', name: 'Same' } }, { data: { kind: 'interface', name: 'Other' } }] },
      ],
    };
    expect(extractTypes(twice, 'x').map((t) => t.name)).toEqual(['Other', 'Same']);
  });
});

describe('typy parametrów', () => {
  it('czyta typ każdego parametru, także generycznego', () => {
    const parsed = parseMemberLine('+ send(payload: Map<string, number>, retries: number): void')!;
    expect(parsed.params).toEqual(['payload', 'retries']);
    expect(parsed.paramTypes).toEqual(['Map<string, number>', 'number']);
  });

  it('parametr opcjonalny dopuszcza undefined', () => {
    expect(parseMemberLine('+ log(msg: string, level?: number)')!.paramTypes)
      .toEqual(['string', 'number | undefined']);
  });

  it('brak adnotacji zostawia typ nieznany', () => {
    expect(parseMemberLine('+ run(a, b)')!.paramTypes).toEqual([undefined, undefined]);
  });

  it('funkcje z projektu niosą typy do walidacji argumentów', () => {
    const api = extractCallables(PROJECT, 'p').find((c) => c.name === 'fetchOne')!;
    expect(api.paramTypes).toEqual(['string']);
  });
});

describe('dokumentacja funkcji', () => {
  const DOCUMENTED: UmlProjectLike = {
    name: 'Core',
    diagrams: [{
      nodes: [{
        data: {
          kind: 'class', name: 'Api', linkedFile: 'drive/src/Api.ts',
          doc: { summary: 'Klient REST backendu.' },
          members: [
            {
              kind: 'method',
              text: '+ static async fetchOne(id: string, retries: number): Promise<string>',
              category: 'async',
              doc: {
                summary: 'Pobiera zasób po identyfikatorze.',
                remarks: 'Wynik jest cache’owany.',
                params: { id: 'Identyfikator zasobu.' },
                returns: 'Treść zasobu.',
                examples: ["await Api.fetchOne('42');"],
                deprecated: 'Użyj fetchMany.',
                see: ['https://example.test'],
              },
            },
            { kind: 'method', text: '+ static plain(): void' },
          ],
        },
      }],
    }],
  };

  const found = extractCallables(DOCUMENTED, 'core');
  const documented = found.find((c) => c.name === 'fetchOne')!;
  const bare = found.find((c) => c.name === 'plain')!;

  it('przenosi dokumentację funkcji i klasy', () => {
    expect(documented.doc?.summary).toBe('Pobiera zasób po identyfikatorze.');
    expect(documented.ownerDoc?.summary).toBe('Klient REST backendu.');
  });

  it('funkcja bez opisu nie dostaje pustego obiektu', () => {
    expect(bare.doc).toBeUndefined();
    expect(hasDoc(bare.doc)).toBe(false);
    expect(hasDoc(documented.doc)).toBe(true);
  });

  it('sekcje idą w kolejności czytania dokumentacji', () => {
    const titles = docSections(documented).map((s) => s.title);
    expect(titles).toEqual(['⚠ Przestarzałe', '', 'Uwagi', 'Argumenty', 'Zwraca', 'Przykład', 'Zobacz']);
  });

  it('argument bez opisu też jest na liście — z samym typem', () => {
    const args = docSections(documented).find((s) => s.title === 'Argumenty')!.lines;
    expect(args[0]).toBe('id: string — Identyfikator zasobu.');
    // `retries` nie ma @param, ale musi być widoczny, żeby nie wyglądał na brak argumentu.
    expect(args[1]).toBe('retries: number');
  });

  it('sekcja „Zwraca" łączy typ z opisem, a przykład jest oznaczony jako kod', () => {
    const sections = docSections(documented);
    expect(sections.find((s) => s.title === 'Zwraca')!.lines[0]).toBe('Promise<string> — Treść zasobu.');
    expect(sections.find((s) => s.title === 'Przykład')!.code).toBe(true);
  });

  it('brak dokumentacji = brak sekcji (bloczek nie dostaje ikony)', () => {
    expect(docSections(bare)).toEqual([]);
  });
});
