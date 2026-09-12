import { describe, it, expect } from 'vitest';
import { symbolToLatex } from './Math';

describe('nazwa symbolu w LaTeX-u', () => {
  it('greckie litery dostają odwrotny ukośnik', () => {
    // Model trzyma `theta`, bo tak nazywa to silnik matematyczny; wzór ma
    // pokazać θ, a nie słowo „theta".
    expect(symbolToLatex('theta')).toBe('\\theta');
    expect(symbolToLatex('omega')).toBe('\\omega');
    expect(symbolToLatex('Omega')).toBe('\\Omega');
  });

  it('zwykłe litery zostają bez zmian', () => {
    expect(symbolToLatex('L')).toBe('L');
    expect(symbolToLatex('v')).toBe('v');
  });

  it('indeks dolny idzie w nawiasy klamrowe', () => {
    expect(symbolToLatex('theta_0')).toBe('\\theta_{0}');
    expect(symbolToLatex('v_x')).toBe('v_{x}');
    expect(symbolToLatex('omega_0')).toBe('\\omega_{0}');
  });

  it('wieloznakowy indeks nie gubi części', () => {
    expect(symbolToLatex('v_max')).toBe('v_{max}');
    expect(symbolToLatex('x_1_2')).toBe('x_{1_2}');
  });

  it('nazwa, która tylko wygląda na grecką, zostaje zwykła', () => {
    // `pipeline` zaczyna się od „pi", ale greckie litery dopasowujemy w całości.
    expect(symbolToLatex('pipeline')).toBe('pipeline');
  });
});
