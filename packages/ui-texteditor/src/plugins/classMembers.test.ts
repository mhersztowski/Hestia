/**
 * Testy warstwy „члены klasy" — parsowania i przepisywania deklaracji
 * signal/property/variable w źródle TypeScript.
 *
 * Logika siedzi w osobnym module, bo `VisualMinisLibPlugin.tsx` ciągnie
 * Blockly i Monaco — nie da się go wczytać w teście jednostkowym.
 */
import { describe, it, expect } from 'vitest';
import {
  parseSignalArgs,
  formatSignalArgs,
  buildSignalMember,
  buildPropertyMember,
  buildVariableMember,
  findClassBody,
  replaceFieldInCode,
  removeFieldFromCode,
  renameMemberInCode,
  parseSignalPorts,
} from './classMembers';

describe('parseSignalArgs', () => {
  it('pusty typ i pusta tupla dają brak argumentów', () => {
    expect(parseSignalArgs('')).toEqual([]);
    expect(parseSignalArgs('[]')).toEqual([]);
    expect(parseSignalArgs('   ')).toEqual([]);
  });

  it('czyta nazwane elementy tupli', () => {
    expect(parseSignalArgs('[x: number, y: string]')).toEqual([
      { name: 'x', type: 'number' },
      { name: 'y', type: 'string' },
    ]);
  });

  it('czyta nienazwane elementy tupli', () => {
    expect(parseSignalArgs('[number]')).toEqual([{ name: '', type: 'number' }]);
    expect(parseSignalArgs('[number, string]')).toEqual([
      { name: '', type: 'number' },
      { name: '', type: 'string' },
    ]);
  });

  // Przecinek wewnątrz generyka nie rozdziela argumentów — inaczej
  // `Map<string, number>` rozpadłby się na dwa bezsensowne wpisy.
  it('nie rozcina przecinka wewnątrz generyka ani obiektu', () => {
    expect(parseSignalArgs('[data: Map<string, number>, ok: boolean]')).toEqual([
      { name: 'data', type: 'Map<string, number>' },
      { name: 'ok', type: 'boolean' },
    ]);
    expect(parseSignalArgs('[p: { x: number, y: number }]')).toEqual([
      { name: 'p', type: '{ x: number, y: number }' },
    ]);
  });

  // Starsze pliki mogły zapisać `Signal<number>` (bez tupli). Nie odrzucamy
  // ich — pokazujemy jako jeden argument, żeby dało się to naprawić w panelu.
  it('typ spoza tupli traktuje jako pojedynczy argument', () => {
    expect(parseSignalArgs('number')).toEqual([{ name: '', type: 'number' }]);
  });
});

describe('formatSignalArgs', () => {
  it('brak argumentów daje pustą tuplę', () => {
    expect(formatSignalArgs([])).toBe('[]');
  });

  it('zachowuje nazwy', () => {
    expect(formatSignalArgs([{ name: 'x', type: 'number' }])).toBe('[x: number]');
  });

  it('pomija nazwy, gdy żaden argument ich nie ma', () => {
    expect(
      formatSignalArgs([
        { name: '', type: 'number' },
        { name: '', type: 'string' },
      ])
    ).toBe('[number, string]');
  });

  // TS nie pozwala mieszać nazwanych i nienazwanych elementów tupli, więc
  // brakujące nazwy dostają zastępcze — inaczej powstałby kod, który się nie kompiluje.
  it('dopełnia brakujące nazwy, gdy choć jeden argument jest nazwany', () => {
    expect(
      formatSignalArgs([
        { name: 'x', type: 'number' },
        { name: '', type: 'string' },
      ])
    ).toBe('[x: number, arg2: string]');
  });

  it('argument bez typu dostaje unknown', () => {
    expect(formatSignalArgs([{ name: 'x', type: '' }])).toBe('[x: unknown]');
  });

  it('round-trip przez parse', () => {
    const src = '[x: number, data: Map<string, number>]';
    expect(formatSignalArgs(parseSignalArgs(src))).toBe(src);
  });
});

describe('generatory deklaracji', () => {
  it('signal', () => {
    expect(buildSignalMember('clicked', [{ name: 'x', type: 'number' }])).toBe(
      'readonly clicked = new Signal<[x: number]>();'
    );
    expect(buildSignalMember('done', [])).toBe('readonly done = new Signal<[]>();');
  });

  it('property', () => {
    expect(buildPropertyMember('count', 'number', '0')).toBe(
      'readonly count = new MProperty<number>(0);'
    );
    expect(buildPropertyMember('count', '', '')).toBe(
      'readonly count = new MProperty<unknown>(undefined);'
    );
  });

  it('variable', () => {
    expect(buildVariableMember('hits', 'number', '0')).toBe('hits: number = 0;');
    expect(buildVariableMember('hits', '', '')).toBe('hits: unknown = undefined;');
  });
});

const SRC = `import { MObject, Signal, MProperty } from '@mhersztowski/minislib';

class Licznik extends MObject {
  readonly zmieniony = new Signal<[wartosc: number]>();
  readonly stan = new MProperty<number>(0);
  krok: number = 1;

  dodaj(v: number): void {
    this.stan.value = this.stan.value + v;
    this.zmieniony.emit(this.stan.value);
  }
}

const licznik = new Licznik();
licznik.zmieniony.connect((v) => console.log(v));
`;

describe('findClassBody', () => {
  it('zwraca zakres ciała klasy', () => {
    const r = findClassBody(SRC, 'Licznik');
    expect(r).not.toBeNull();
    expect(SRC.slice(r!.start, r!.end)).toContain('readonly zmieniony');
    expect(SRC.slice(r!.start, r!.end)).not.toContain('const licznik');
  });

  it('null dla nieznanej klasy', () => {
    expect(findClassBody(SRC, 'Brak')).toBeNull();
  });
});

describe('replaceFieldInCode', () => {
  it('podmienia deklarację sygnału', () => {
    const out = replaceFieldInCode(
      SRC,
      'Licznik',
      'zmieniony',
      'readonly zmieniony = new Signal<[wartosc: number, delta: number]>();'
    );
    expect(out).not.toBeNull();
    expect(out).toContain('new Signal<[wartosc: number, delta: number]>();');
    expect(out).not.toContain('new Signal<[wartosc: number]>();');
    // Reszta klasy nietknięta
    expect(out).toContain('readonly stan = new MProperty<number>(0);');
    expect(out).toContain('dodaj(v: number): void {');
  });

  it('podmienia deklarację property i zmiennej', () => {
    const a = replaceFieldInCode(
      SRC,
      'Licznik',
      'stan',
      'readonly stan = new MProperty<string>("x");'
    )!;
    expect(a).toContain('new MProperty<string>("x");');
    const b = replaceFieldInCode(SRC, 'Licznik', 'krok', 'krok: number = 5;')!;
    expect(b).toContain('krok: number = 5;');
    expect(b).not.toContain('krok: number = 1;');
  });

  // Nazwa pola pojawia się też w ciele metody (`this.stan.value`). Podmiana
  // musi trafić w deklarację, nie w pierwsze lepsze wystąpienie nazwy.
  it('nie rusza wystąpień nazwy w ciele metody', () => {
    const out = replaceFieldInCode(
      SRC,
      'Licznik',
      'stan',
      'readonly stan = new MProperty<number>(7);'
    )!;
    expect(out).toContain('this.stan.value = this.stan.value + v;');
  });

  it('null gdy pola nie ma', () => {
    expect(replaceFieldInCode(SRC, 'Licznik', 'brak', 'brak: number = 0;')).toBeNull();
  });

  it('nie myli pola z metodą o tej samej nazwie', () => {
    const src = `class A extends MObject {\n  dodaj(v: number): void {}\n}`;
    expect(replaceFieldInCode(src, 'A', 'dodaj', 'dodaj: number = 1;')).toBeNull();
  });
});

describe('removeFieldFromCode', () => {
  it('usuwa deklarację razem z jej wierszem', () => {
    const out = removeFieldFromCode(SRC, 'Licznik', 'krok')!;
    expect(out).not.toContain('krok: number = 1;');
    expect(out).toContain('readonly stan = new MProperty<number>(0);');
    expect(out).not.toMatch(/\n\s*\n\s*\n/);
  });
});

describe('renameMemberInCode', () => {
  it('zmienia nazwę w this.* i na instancjach klasy', () => {
    const out = renameMemberInCode(SRC, 'Licznik', ['licznik'], 'zmieniony', 'zmienionyEvent');
    expect(out).toContain('this.zmienionyEvent.emit(');
    expect(out).toContain('licznik.zmienionyEvent.connect(');
    expect(out).not.toContain('zmieniony.');
  });

  it('nie rusza pól o podobnych nazwach', () => {
    const src = `class A extends MObject {\n  readonly stan = new Signal<[]>();\n  readonly stanX = new Signal<[]>();\n  f(): void { this.stanX.emit(); this.stan.emit(); }\n}`;
    const out = renameMemberInCode(src, 'A', [], 'stan', 'stanY');
    expect(out).toContain('this.stanX.emit();');
    expect(out).toContain('this.stanY.emit();');
  });
});

describe('parseSignalPorts', () => {
  it('czyta sygnały i .changed z property', () => {
    const body = findClassBody(SRC, 'Licznik')!;
    const ports = parseSignalPorts(SRC.slice(body.start, body.end));
    expect(ports).toEqual([
      { name: 'zmieniony', type: '[wartosc: number]' },
      { name: 'stan.changed', type: 'number' },
    ]);
  });

  // Regex ograniczony do `[^>]*` gubił sygnał z zagnieżdżonym generykiem —
  // znikał z listy, choć w kodzie był.
  it('czyta sygnał z zagnieżdżonym generykiem', () => {
    const body = '  readonly gotowe = new Signal<[dane: Map<string, number>]>();\n';
    expect(parseSignalPorts(body)).toEqual([
      { name: 'gotowe', type: '[dane: Map<string, number>]' },
    ]);
  });
});

describe('hasFieldInCode', () => {
  it('rozróżnia pole klasy od metody i od nazwy nieistniejącej', async () => {
    const { hasFieldInCode } = await import('./classMembers');
    expect(hasFieldInCode(SRC, 'Licznik', 'zmieniony')).toBe(true);
    expect(hasFieldInCode(SRC, 'Licznik', 'krok')).toBe(true);
    expect(hasFieldInCode(SRC, 'Licznik', 'dodaj')).toBe(false);
    expect(hasFieldInCode(SRC, 'Licznik', 'childAdded')).toBe(false);
  });
});

describe('parseSignalPorts — zapisy bez generyka', () => {
  it('czyta sygnał zadeklarowany jako `new Signal()`', () => {
    expect(parseSignalPorts('  readonly gotowe = new Signal();\n')).toEqual([
      { name: 'gotowe', type: '' },
    ]);
  });

  it('nie myli klasy o nazwie zaczynającej się tak samo', () => {
    expect(parseSignalPorts('  readonly szyna = new SignalBus<[x: number]>();\n')).toEqual([]);
  });
});

describe('parametry metody', () => {
  it('czyta pustą listę', async () => {
    const { parseParamList } = await import('./classMembers');
    expect(parseParamList('')).toEqual([]);
    expect(parseParamList('  ')).toEqual([]);
  });

  it('czyta wiele parametrów, nie rozcinając generyków', async () => {
    const { parseParamList } = await import('./classMembers');
    expect(parseParamList('v: number, dane: Map<string, number>')).toEqual([
      { name: 'v', type: 'number' },
      { name: 'dane', type: 'Map<string, number>' },
    ]);
  });

  it('parametr bez typu dostaje unknown', async () => {
    const { parseParamList } = await import('./classMembers');
    expect(parseParamList('v')).toEqual([{ name: 'v', type: 'unknown' }]);
  });

  it('formatuje z powrotem', async () => {
    const { parseParamList, formatParamList } = await import('./classMembers');
    const src = 'v: number, opis: string';
    expect(formatParamList(parseParamList(src))).toBe(src);
    expect(formatParamList([])).toBe('');
    expect(formatParamList([{ name: '', type: '' }])).toBe('arg1: unknown');
  });
});

// Skan szedł po całym ciele klasy, więc deklaracja z wnętrza metody (parametr
// slotu, zmienna lokalna) lądowała na liście sygnałów klasy — slot pojawiał się
// w panelu jako sygnał.
describe('parseSignalPorts — tylko składowe klasy', () => {
  const body = (code: string) => {
    const r = findClassBody(code, 'A')!;
    return code.slice(r.start, r.end);
  };

  it('nie bierze parametru metody za sygnał', () => {
    expect(
      parseSignalPorts(
        body(`class A extends MObject {
  policz(s: Signal<[number]>): void {}
}`)
      )
    ).toEqual([]);
  });

  it('nie bierze parametru metody za property', () => {
    expect(
      parseSignalPorts(
        body(`class A extends MObject {
  policz(p: MProperty<number>): void {}
}`)
      )
    ).toEqual([]);
  });

  it('nie bierze zmiennej lokalnej za sygnał', () => {
    expect(
      parseSignalPorts(
        body(`class A extends MObject {
  policz(v: number): void {
    const lokalny = new Signal<[number]>();
    lokalny.emit(v);
  }
}`)
      )
    ).toEqual([]);
  });

  it('nadal czyta prawdziwe składowe obok metod', () => {
    expect(
      parseSignalPorts(
        body(`class A extends MObject {
  policz(s: Signal<[number]>): void {}
  readonly gotowe = new Signal<[x: number]>();
  readonly stan = new MProperty<number>(0);
}`)
      )
    ).toEqual([
      { name: 'gotowe', type: '[x: number]' },
      { name: 'stan.changed', type: 'number' },
    ]);
  });
});
