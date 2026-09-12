/**
 * Podmiana wzoru w bloku.
 *
 * Raport (§3.4) chce edycji wzoru wprost w UI: kliknięcie otwiera wizualny
 * edytor matematyki, a wynik wraca do bloku. Cała trudność jest w słowie
 * „wraca" — blok to nie sam wzór, tylko wzór **plus dyrektywy** (`@vars`,
 * `@derivedFrom`, `@assume`). Podmiana, która je gubi, kasuje jednostki i
 * powiązania, a czytelnik zobaczy to dopiero, gdy symulacja przestanie liczyć.
 *
 * Stąd osobny moduł i testy: to jest miejsce, w którym łatwo o cichą stratę.
 */
import { describe, it, expect } from 'vitest';
import { editableExpressions, replaceExpression } from './editFormula';

const WZOR = [
  'T = 2\\pi\\sqrt{\\frac{L}{g}}',
  '@vars T: s, L: m, g: m/s^2',
  '@derivedFrom wahadlo-ode',
  '@assume small-angles',
].join('\n');

const ODE = [
  '@ode',
  '@state theta, omega',
  '@d theta = \\omega',
  '@d omega = -\\frac{g}{L}\\sin(\\theta)',
  '@init theta = \\theta_0, omega = 0',
  '@vars g: m/s^2, L: m, theta_0: rad, theta: rad, omega: rad/s',
].join('\n');

describe('editableExpressions', () => {
  it('wskazuje wzór definicji razem z lewą stroną', () => {
    const [wyrazenie] = editableExpressions(WZOR);
    expect(wyrazenie.latex).toBe('T = 2\\pi\\sqrt{\\frac{L}{g}}');
    expect(wyrazenie.line).toBe(0);
  });

  it('w układzie ODE każda pochodna jest osobnym wzorem', () => {
    // Edycja całego bloku naraz byłaby edycją tekstu, nie matematyki —
    // a każde równanie ma własną strukturę i własne miejsce w pliku.
    const wyrazenia = editableExpressions(ODE);
    expect(wyrazenia).toHaveLength(2);
    expect(wyrazenia[0].latex).toBe('\\theta'.replace('\\theta', '\\omega'));
    expect(wyrazenia[1].latex).toContain('\\sin');
    expect(wyrazenia[1].label).toBe('d omega / dt');
  });

  it('dyrektywy bez matematyki nie są do edycji', () => {
    // `@vars` to deklaracja jednostek, nie wzór — otwarcie jej w edytorze
    // matematyki dałoby bezsens, a zapis zniszczyłby zapis jednostek.
    const wyrazenia = editableExpressions(WZOR);
    expect(wyrazenia).toHaveLength(1);
  });

  it('pusty blok nie ma czego edytować', () => {
    expect(editableExpressions('')).toEqual([]);
  });
});

describe('replaceExpression', () => {
  it('podmienia wzór, zostawiając dyrektywy nietknięte', () => {
    const nowy = replaceExpression(WZOR, 0, 'T = 4\\pi\\sqrt{\\frac{L}{g}}');

    expect(nowy).toContain('T = 4\\pi');
    expect(nowy).toContain('@vars T: s, L: m, g: m/s^2');
    expect(nowy).toContain('@derivedFrom wahadlo-ode');
    expect(nowy).toContain('@assume small-angles');
  });

  it('nie rusza pozostałych wierszy układu ODE', () => {
    const nowy = replaceExpression(ODE, 3, '-\\frac{g}{L}\\theta');

    expect(nowy).toContain('@d omega = -\\frac{g}{L}\\theta');
    // Pozostałe równanie i cała reszta bloku zostaje.
    expect(nowy).toContain('@d theta = \\omega');
    expect(nowy).toContain('@init theta = \\theta_0, omega = 0');
    expect(nowy.split('\n')).toHaveLength(ODE.split('\n').length);
  });

  it('zachowuje przedrostek dyrektywy przy pochodnej', () => {
    // Edytor pokazuje samą prawą stronę, więc zapis musi odtworzyć `@d nazwa =`.
    // Bez tego blok przestałby być układem równań.
    const nowy = replaceExpression(ODE, 2, '2 \\cdot \\omega');
    expect(nowy).toContain('@d theta = 2 \\cdot \\omega');
  });

  it('numer wiersza spoza zakresu nie psuje bloku', () => {
    expect(replaceExpression(WZOR, 99, 'cokolwiek')).toBe(WZOR);
  });

  it('nie dopisuje pustego wiersza na końcu', () => {
    const nowy = replaceExpression(WZOR, 0, 'T = 1');
    expect(nowy.endsWith('\n')).toBe(false);
  });
});
