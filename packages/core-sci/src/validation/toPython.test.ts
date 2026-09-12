/**
 * Wzór z dokumentu → wyrażenie Pythona.
 *
 * Warstwa pod cross-walidacją (raport §7, poziom 2): SciPy ma policzyć **ten
 * sam** układ równań co sci-core, żeby dwa niezależne solwery można było
 * porównać. Żeby to miało sens, tłumaczenie musi być dosłowne — inaczej
 * porównywalibyśmy dwa różne modele i zgodność nic by nie znaczyła.
 *
 * Tłumaczymy z MathJSON, a nie z zapisu ascii: ten drugi zostawia niejawne
 * mnożenia (`2pi`, `-30(x - 0.5)`) i symbole w cudzysłowach, których Python nie
 * przyjmie. MathJSON jest drzewem, więc każdy nawias i każde mnożenie stawiamy
 * sami i wiemy, że tam są.
 */
import { describe, it, expect } from 'vitest';
import { latexToPython } from './toPython';
import { compileExpression } from '../formula/expression';

const py = (latex: string) => latexToPython(latex).code;

/**
 * Liczy wyrażenie „pythonowe" w JavaScripcie.
 *
 * Obie składnie dzielą operator potęgi `**` i te same nazwy funkcji, gdy
 * podstawi się je ze `Math`. Dzięki temu da się sprawdzić **wartość**
 * tłumaczenia, a nie tylko jego kształt — a to jest jedyne, co naprawdę ma
 * znaczenie: SciPy musi policzyć ten sam model, nie ten sam zapis.
 */
function oblicz(code: string, scope: Record<string, number>): number {
  const nazwy = Object.keys(scope);
  const funkcje = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp,
    log: Math.log, log10: Math.log10, sqrt: Math.sqrt, fabs: Math.abs,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    pi: Math.PI, e: Math.E,
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function(...Object.keys(funkcje), ...nazwy, `return ${code};`);
  return fn(...Object.values(funkcje), ...nazwy.map((n) => scope[n]));
}

/** Czy tłumaczenie daje tę samą liczbę co silnik dokumentu. */
function zgodneZRdzeniem(latex: string, scope: Record<string, number>) {
  const wRdzeniu = compileExpression(latex, Object.keys(scope)).evaluate(scope);
  const wPythonie = oblicz(latexToPython(latex).code, scope);
  return { wRdzeniu, wPythonie };
}

describe('latexToPython', () => {
  it('działania arytmetyczne dają te same wartości co rdzeń', () => {
    // Sprawdzamy wartość, nie zapis: Compute Engine normalizuje `a - b` do
    // `a + (-b)`, co jest poprawne i w matematyce, i w Pythonie.
    for (const wzor of ['a + b', 'a - b', 'a \\cdot b', '\\frac{a}{b}']) {
      const { wRdzeniu, wPythonie } = zgodneZRdzeniem(wzor, { a: 7, b: 2.5 });
      expect(wPythonie).toBeCloseTo(wRdzeniu, 12);
    }
  });

  it('potęgę zapisuje po pythonowemu', () => {
    // `^` w Pythonie znaczy XOR — najgroźniejszy możliwy błąd tłumaczenia,
    // bo kod się wykona i da liczbę, tylko nie tę.
    expect(py('x^2')).not.toContain('^');
    expect(py('x^2')).toContain('**');

    const { wRdzeniu, wPythonie } = zgodneZRdzeniem('\\omega_0^2 \\cdot x', { omega_0: 3, x: 2 });
    expect(wPythonie).toBeCloseTo(wRdzeniu, 12);
  });

  it('nie zostawia niejawnych mnożeń', () => {
    const wynik = py('2\\pi\\sqrt{\\frac{L}{g}}');
    expect(wynik).toContain('*');
    expect(wynik).not.toMatch(/\dpi/);
    expect(wynik).toContain('pi');
  });

  it('symbole z indeksem zostają nazwami, nie tekstem', () => {
    // Ascii-math otacza je cudzysłowem — w Pythonie byłby to napis, a napisu
    // nie da się dodać do liczby.
    expect(py('F_0 \\cdot x')).not.toContain('"');
    expect(py('F_0 \\cdot x')).toContain('F_0');
  });

  it('funkcje trygonometryczne i wykładnicze liczą to samo', () => {
    for (const wzor of ['\\sin(x)', '\\cos(x)', '\\tan(x)', '\\exp(x)', '\\sqrt{x}', '\\ln(x)']) {
      const { wRdzeniu, wPythonie } = zgodneZRdzeniem(wzor, { x: 1.3 });
      expect(wPythonie).toBeCloseTo(wRdzeniu, 12);
    }
  });

  it('stałe matematyczne', () => {
    expect(py('\\pi')).toBe('pi');
    // `exp(x)` normalizuje się do potęgi `e ** x` — ta sama funkcja, inny zapis.
    const { wRdzeniu, wPythonie } = zgodneZRdzeniem('e^x', { x: 2 });
    expect(wPythonie).toBeCloseTo(wRdzeniu, 12);
  });

  it('cały wzór wahadła zgadza się co do wartości', () => {
    // Sprawdzian najbliższy temu, o co chodzi w cross-walidacji: prawa strona
    // równania ruchu policzona dwiema drogami musi dać tę samą liczbę.
    const { wRdzeniu, wPythonie } = zgodneZRdzeniem(
      '-\\frac{g}{L}\\sin(\\theta)',
      { g: 9.81, L: 1.2, theta: 0.37 },
    );
    expect(wPythonie).toBeCloseTo(wRdzeniu, 12);
  });

  it('złożony wzór oscylatora wymuszonego', () => {
    const wynik = py('-2\\beta v - \\omega_0^2 x + F_0 \\cos(\\Omega t)');

    expect(wynik).toContain('beta');
    expect(wynik).toContain('omega_0 ** 2');
    expect(wynik).toContain('cos(');
    expect(wynik).not.toContain('"');
  });

  it('podaje symbole użyte w wyrażeniu', () => {
    // Skrypt Pythona musi wiedzieć, co podstawić — bez listy zgadywałby po
    // nazwach zmiennych w kodzie.
    expect(latexToPython('-\\frac{g}{L}\\sin(\\theta)').symbols.sort())
      .toEqual(['L', 'g', 'theta']);
  });

  it('nieznana konstrukcja jest zgłaszana, nie zgadywana', () => {
    // Cicha zamiana nieznanej funkcji na coś podobnego dałaby Pythonowi inny
    // model niż ten w dokumencie — a porównanie wyszłoby „zgodne".
    const wynik = latexToPython('\\Gamma(x)');
    expect(wynik.issues.join(' ')).toMatch(/Gamma/);
  });
});
