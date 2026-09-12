/**
 * Wartości zapisane w bloku `sim` mają wylądować na suwakach.
 *
 * Bez tego symulacja rusza z wartości domyślnych modelu, a autor dokumentu
 * traci jedyne miejsce, w którym mógł powiedzieć „ten atraktor pokazuje się
 * dla sigma = 10, nie dla jedynki".
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { parseFormulaBlock } from '@hestia/core-sci';
import { SimBlock } from './SimBlock';

const LORENZ = parseFormulaBlock('lorenz-ode', [
  '@ode', '@state x, y, z',
  '@d x = \\sigma \\cdot (y - x)',
  '@d y = x \\cdot (\\rho - z) - y',
  '@d z = x \\cdot y - \\beta \\cdot z',
  '@init x = x_0, y = 1, z = 1',
  '@vars x: 1, y: 1, z: 1, sigma: 1, rho: 1, beta: 1, x_0: 1',
].join('\n'));

describe('SimBlock', () => {
  it('startuje z wartości podanych w bloku, nie z domyślnych modelu', () => {
    render(
      <SimBlock
        bare
        code={JSON.stringify({ sigma: 10, rho: 28, beta: 2.667, x_0: 1, duration: 40 })}
        formulas={[LORENZ]}
      />,
    );

    const suwak = (nazwa: string) =>
      Number((screen.getByLabelText(nazwa, { exact: false }) as HTMLInputElement).value);

    expect(suwak('sigma')).toBeCloseTo(10, 6);
    expect(suwak('rho')).toBeCloseTo(28, 6);
    expect(suwak('beta')).toBeCloseTo(2.667, 6);
  });

  it('zakres suwaka obejmuje wartość z bloku', () => {
    // Zakres liczony z wartości domyślnej modelu ucinałby wartość autora do
    // maksimum — suwak pokazywałby co innego niż dokument.
    render(
      <SimBlock bare code={JSON.stringify({ sigma: 10, rho: 28, beta: 2.667 })} formulas={[LORENZ]} />,
    );

    const rho = screen.getByLabelText('rho', { exact: false }) as HTMLInputElement;
    expect(Number(rho.max)).toBeGreaterThanOrEqual(28);
  });
});
