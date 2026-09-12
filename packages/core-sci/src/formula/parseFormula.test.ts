import { describe, it, expect } from 'vitest';
import { parseFormulaBlock, serializeFormulaBlock } from './parseFormula';

describe('blok formula: postać podstawowa', () => {
  it('czyta identyfikator, wyrażenie i zmienne z jednostkami', () => {
    const block = parseFormulaBlock('pendulum-period', [
      'T = 2\\pi\\sqrt{\\frac{L}{g}}',
      '@vars L: m, g: m/s^2',
    ].join('\n'));

    expect(block.id).toBe('pendulum-period');
    expect(block.kind).toBe('definition');
    expect(block.target).toBe('T');
    expect(block.expression).toBe('2\\pi\\sqrt{\\frac{L}{g}}');
    expect(block.vars).toEqual({ L: 'm', g: 'm/s^2' });
  });

  it('czyta relacje do innych wzorów i założenia', () => {
    const block = parseFormulaBlock('x', [
      'T = 2\\pi\\sqrt{\\frac{L}{g}}',
      '@derivedFrom pendulum-eq',
      '@assume small-angles',
      '@assume no-damping',
    ].join('\n'));

    expect(block.derivedFrom).toEqual(['pendulum-eq']);
    expect(block.assume).toEqual(['small-angles', 'no-damping']);
  });

  it('wzór bez przypisania jest błędem — graf potrzebuje nazwy wyniku', () => {
    expect(parseFormulaBlock('x', '2\\pi\\sqrt{L}').issues[0].message).toMatch(/przypisan/i);
  });
});

describe('blok formula: węzeł ODE', () => {
  const ode = [
    '@ode',
    '@state theta, omega',
    '@d theta = \\omega',
    '@d omega = -\\frac{g}{L}\\sin(\\theta)',
    '@init theta = theta0, omega = 0',
    '@vars g: m/s^2, L: m, theta0: rad',
  ].join('\n');

  it('czyta zmienne stanu, pochodne i warunki początkowe', () => {
    const block = parseFormulaBlock('pendulum-ode', ode);

    expect(block.kind).toBe('ode');
    expect(block.state).toEqual(['theta', 'omega']);
    expect(block.derivatives).toEqual({ theta: '\\omega', omega: '-\\frac{g}{L}\\sin(\\theta)' });
    expect(block.init).toEqual({ theta: 'theta0', omega: '0' });
  });

  it('pochodna zmiennej spoza stanu jest błędem', () => {
    const block = parseFormulaBlock('x', ['@ode', '@state theta', '@d phi = 1'].join('\n'));
    expect(block.issues.some((i) => i.message.includes('phi'))).toBe(true);
  });

  it('brak pochodnej dla zmiennej stanu jest błędem', () => {
    const block = parseFormulaBlock('x', ['@ode', '@state theta, omega', '@d theta = \\omega'].join('\n'));
    expect(block.issues.some((i) => i.message.includes('omega'))).toBe(true);
  });
});

describe('blok formula: zapis źródłowy', () => {
  it('nierozpoznana dyrektywa nie znika', () => {
    const block = parseFormulaBlock('x', ['T = L', '@cośnowego wartość'].join('\n'));
    expect(block.unknown).toContain('@cośnowego wartość');
    expect(serializeFormulaBlock(block)).toContain('@cośnowego wartość');
  });

  it('nazwa w postaci LaTeX wraca dosłownie, a model widzi ją znormalizowaną', () => {
    const block = parseFormulaBlock('w', '\\omega_0 = \\sqrt{\\frac{g}{L}}');
    expect(block.target).toBe('omega_0');
    expect(serializeFormulaBlock(block)).toBe('\\omega_0 = \\sqrt{\\frac{g}{L}}');
  });

  it('round-trip zachowuje treść', () => {
    const source = [
      'T = 2\\pi\\sqrt{\\frac{L}{g}}',
      '@vars L: m, g: m/s^2',
      '@derivedFrom pendulum-eq',
      '@assume small-angles',
    ].join('\n');

    expect(serializeFormulaBlock(parseFormulaBlock('t', source))).toBe(source);
  });

  it('round-trip ODE zachowuje kolejność pochodnych', () => {
    const source = [
      '@ode',
      '@state theta, omega',
      '@d theta = \\omega',
      '@d omega = -\\frac{g}{L}\\sin(\\theta)',
      '@init theta = theta0, omega = 0',
    ].join('\n');

    expect(serializeFormulaBlock(parseFormulaBlock('p', source))).toBe(source);
  });
});

describe('łańcuch równości', () => {
  /**
   * `T = 2π/ω = 2π√(m/k)` — podręczniki zapisują tak **drogę**, nie tylko wynik.
   * W tomie pierwszym Resnicka takich zapisów jest ponad sześćset, więc ich
   * odrzucanie oznaczałoby przepisywanie każdego wyprowadzenia.
   *
   * Do liczenia bierzemy **ostatni** człon, bo to on jest wyrażony przez
   * wielkości znane. Pośrednie zostają do pokazania czytelnikowi — w nich
   * mieści się cała wartość dydaktyczna zapisu.
   */
  it('liczy z ostatniego członu', () => {
    const blok = parseFormulaBlock('okres', [
      'T = \\frac{2\\pi}{\\omega} = 2\\pi\\sqrt{\\frac{m}{k}}',
      '@vars T: s, omega: s^-1, m: kg, k: N/m',
    ].join('\n'));

    expect(blok.issues).toEqual([]);
    expect(blok.target).toBe('T');
    expect(blok.expression).toBe('2\\pi\\sqrt{\\frac{m}{k}}');
  });

  it('zachowuje człony pośrednie do pokazania', () => {
    const blok = parseFormulaBlock('okres', 'T = \\frac{2\\pi}{\\omega} = 2\\pi\\sqrt{\\frac{m}{k}}');
    expect(blok.chain).toEqual(['\\frac{2\\pi}{\\omega}', '2\\pi\\sqrt{\\frac{m}{k}}']);
  });

  it('zwykły wzór nie ma łańcucha', () => {
    // Bez tego każdy wzór niósłby pustą tablicę, a widok musiałby ją odróżniać
    // od prawdziwego łańcucha jednoelementowego.
    expect(parseFormulaBlock('proste', 'E = m \\cdot c^2').chain).toBeUndefined();
  });

  it('człon pośredni może używać wielkości liczonej gdzie indziej', () => {
    // `2π/ω` wymaga `ω`, którego ten blok nie definiuje. Gdybyśmy liczyli
    // z pierwszego członu, wzór zależałby od czegoś, czego może nie być.
    const blok = parseFormulaBlock('okres', [
      'T = \\frac{2\\pi}{\\omega} = 2\\pi\\sqrt{\\frac{m}{k}}',
      '@vars T: s, omega: s^-1, m: kg, k: N/m',
    ].join('\n'));

    expect(blok.expression).not.toContain('omega');
  });
});
