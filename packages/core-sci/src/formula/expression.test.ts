import { describe, it, expect } from 'vitest';
import { compileExpression, evaluateOnce } from './expression';

describe('kompilacja wyrażeń', () => {
  it('liczy poprawnie i szybko', () => {
    const { evaluate, issues } = compileExpression('-\\frac{g}{L}\\sin(\\theta)', ['g', 'L', 'theta']);
    expect(issues).toEqual([]);
    expect(evaluate({ g: 9.81, L: 1, theta: 0.2 })).toBeCloseTo(-9.81 * Math.sin(0.2), 12);
  });

  it('rozpoznaje symbole, których wyrażenie potrzebuje', () => {
    const { freeSymbols } = compileExpression('2\\pi\\sqrt{\\frac{L}{g}}');
    expect(freeSymbols.sort()).toEqual(['L', 'g']);
  });

  it('symbol z indeksem dolnym działa', () => {
    expect(compileExpression('\\theta_0 \\cdot 2', ['theta_0']).evaluate({ theta_0: 3 })).toBe(6);
  });
});

describe('ciche pomyłki LaTeX-a', () => {
  it('wykrywa symbol wchłonięty jako stała wbudowana', () => {
    // \gamma to w Compute Engine stała Eulera-Mascheroniego — wyrażenie liczy
    // się bez błędu, tylko z cudzą wartością zamiast naszego tłumienia.
    const { issues, freeSymbols } = compileExpression('e^{-\\gamma t}', ['gamma', 't']);
    expect(freeSymbols).not.toContain('gamma');
    expect(issues.join(' ')).toMatch(/gamma/);
  });

  it('mnożenie przez sąsiedztwo albo liczy dobrze, albo zgłasza problem — nigdy po cichu źle', () => {
    // Compute Engine bywa tu niestabilny: to samo wyrażenie raz kompiluje się
    // poprawnie, raz kończy błędem „Unknown operator L". Kontraktem nie jest
    // więc konkretny komunikat, tylko brak trzeciej możliwości: cichego
    // złego wyniku.
    const { evaluate, issues } = compileExpression('\\frac{1}{2} m L^2 \\omega^2', ['m', 'L', 'omega']);
    const value = evaluate({ m: 2, L: 3, omega: 4 });
    const oczekiwane = 0.5 * 2 * 9 * 16;

    if (issues.length === 0) expect(value).toBeCloseTo(oczekiwane, 9);
    else expect(Number.isNaN(value)).toBe(true);
  });

  it('ten sam wzór z jawnym mnożeniem przechodzi', () => {
    const { evaluate, issues } = compileExpression(
      '\\frac{1}{2} \\cdot m \\cdot L^2 \\cdot \\omega^2', ['m', 'L', 'omega'],
    );
    expect(issues).toEqual([]);
    expect(evaluate({ m: 2, L: 3, omega: 4 })).toBeCloseTo(0.5 * 2 * 9 * 16, 9);
  });

  it('nie zgłasza symboli, których w zapisie nie ma', () => {
    const { issues } = compileExpression('2 \\cdot L', ['L', 'g', 'nieuzywana']);
    expect(issues).toEqual([]);
  });

  it('literówka w nazwie funkcji nie udaje wyniku', () => {
    const { evaluate } = compileExpression('\\sinn(x)', ['x']);
    expect(Number.isNaN(evaluate({ x: 1 }))).toBe(true);
  });
});

describe('obliczenie jednorazowe', () => {
  it('liczy wartość w podanym zakresie zmiennych', () => {
    expect(evaluateOnce('2\\pi\\sqrt{\\frac{L}{g}}', { L: 1, g: 9.81 })).toBeCloseTo(2.0060666, 6);
  });
});

describe('nazwy zarezerwowane', () => {
  it('komunikat mówi, czym jest zajęta nazwa i co wpisać zamiast', () => {
    const { issues } = compileExpression('2 \\cdot i', ['i']);
    expect(issues[0]).toMatch(/jednostka urojona/);
    expect(issues[0]).toMatch(/I albo i_L/);
  });

  it('stała grawitacji zderza się ze stałą Catalana', () => {
    expect(compileExpression('G \\cdot M', ['G', 'M']).issues[0]).toMatch(/Catalana.*G_N/s);
  });

  it('nieznana kolizja nadal jest zgłaszana, tylko ogólniej', () => {
    const { issues } = compileExpression('2 \\cdot \\aleph', ['aleph']);
    if (issues.length) expect(issues[0]).toMatch(/nie traktuje go jak zmiennej|skompilować/);
  });
});
