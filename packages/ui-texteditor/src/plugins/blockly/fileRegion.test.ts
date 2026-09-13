import { describe, it, expect } from 'vitest';
import { applyBlocklyRegion, findBlocklyRegion, readBlocklyState } from './fileRegion';
import { dialectById } from './dialects';

const ts = dialectById('typescript')!;
const py = dialectById('python')!;

describe('findBlocklyRegion', () => {
  it('plik bez znaczników nie ma obszaru', () => {
    expect(findBlocklyRegion('const a = 1;\n', ts)).toBeNull();
  });

  it('znajduje obszar razem ze znacznikami', () => {
    const text = 'przed\n// @blockly-begin\nkod\n// @blockly-end\npo\n';
    const region = findBlocklyRegion(text, ts)!;
    expect(text.slice(region.start, region.end)).toContain('@blockly-begin');
    expect(text.slice(region.start, region.end)).toContain('@blockly-end');
  });

  it('znaczniki w składni komentarza danego języka', () => {
    // `//` w Pythonie to dzielenie całkowite, a nie komentarz — plik przestałby
    // się parsować.
    const text = 'przed\n# @blockly-begin\nkod\n# @blockly-end\n';
    expect(findBlocklyRegion(text, py)).not.toBeNull();
    expect(findBlocklyRegion(text, ts)).toBeNull();
  });

  it('sam początek bez końca nie tworzy obszaru', () => {
    // Niedomknięty znacznik znaczy plik ruszany ręcznie. Uznanie „do końca
    // pliku" skasowałoby wszystko, co pod nim napisano.
    expect(findBlocklyRegion('// @blockly-begin\nkod\n', ts)).toBeNull();
  });
});

describe('applyBlocklyRegion', () => {
  it('plik bez znaczników dostaje obszar **na końcu**, nic nie ginie', () => {
    const out = applyBlocklyRegion('const a = 1;\n', 'f();', null, ts);
    expect(out).toContain('const a = 1;');
    expect(out.indexOf('const a = 1;')).toBeLessThan(out.indexOf('@blockly-begin'));
    expect(out).toContain('f();');
  });

  it('kolejny zapis podmienia obszar, a nie dokłada drugiego', () => {
    const first = applyBlocklyRegion('const a = 1;\n', 'f();', null, ts);
    const second = applyBlocklyRegion(first, 'g();', null, ts);
    expect(second.match(/@blockly-begin/g)).toHaveLength(1);
    expect(second).toContain('g();');
    expect(second).not.toContain('f();');
  });

  it('treść poza obszarem zostaje nietknięta', () => {
    // To jest cały powód istnienia znaczników: plik źródłowy zwykle zawiera
    // więcej niż to, co ułożono z bloczków.
    const before = 'nagłówek\n// @blockly-begin\nstare\n// @blockly-end\nstopka\n';
    const out = applyBlocklyRegion(before, 'nowe', null, ts);
    expect(out.startsWith('nagłówek\n')).toBe(true);
    expect(out.trimEnd().endsWith('stopka')).toBe(true);
    expect(out).toContain('nowe');
    expect(out).not.toContain('stare');
  });

  it('ostrzeżenie w pliku mówi, że obszar jest generowany', () => {
    // Bez tego ktoś dopisze coś w środku i straci to przy następnym zapisie,
    // nie mając skąd wiedzieć dlaczego.
    const out = applyBlocklyRegion('', 'f();', null, ts);
    expect(out).toMatch(/generowan|nie edytuj/i);
  });

  it('stan warsztatu wraca z pliku', () => {
    // Bez tego kod jest w pliku, a bloczki tylko w przeglądarce: kto otworzy
    // plik gdzie indziej, dostanie kod, którego nie da się już edytować
    // bloczkami.
    const state = { blocks: { languageVersion: 0, blocks: [{ type: 'text' }] } };
    const out = applyBlocklyRegion('', 'f();', state, ts);
    expect(readBlocklyState(out, ts)).toEqual(state);
  });

  it('brak stanu nie psuje odczytu', () => {
    const out = applyBlocklyRegion('', 'f();', null, ts);
    expect(readBlocklyState(out, ts)).toBeNull();
  });

  it('stan przetrwa polskie znaki w opisach', () => {
    // `btoa` samo dławi się znakami spoza latin-1 — nazwy bloczków i etykiety
    // z UML-a bywają po polsku.
    const state = { note: 'zażółć gęślą jaźń' };
    const out = applyBlocklyRegion('', '', state, ts);
    expect(readBlocklyState(out, ts)).toEqual(state);
  });

  it('uszkodzony stan czyta się jako brak, a nie jako wyjątek', () => {
    const broken = '// @blockly-begin\n// @blockly-state: to-nie-jest-base64!!\n// @blockly-end\n';
    expect(readBlocklyState(broken, ts)).toBeNull();
  });

  it('pusty warsztat czyści obszar, ale go nie usuwa', () => {
    // Zniknięcie znaczników znaczyłoby, że następny zapis dokłada obszar na
    // końcu pliku — czyli w innym miejscu niż poprzednio.
    const before = applyBlocklyRegion('x\n', 'f();', null, ts);
    const after = applyBlocklyRegion(before, '', null, ts);
    expect(after).toContain('@blockly-begin');
    expect(after).not.toContain('f();');
  });
});
