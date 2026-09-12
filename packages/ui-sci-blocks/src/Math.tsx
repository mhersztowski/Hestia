/**
 * Math — wzór złożony przez KaTeX.
 *
 * Raport (3.6) obiecuje, że blok „renderuje się w dokumencie jako złożony
 * LaTeX". Do tej pory pokazywał surowy zapis — czytelne dla autora, ale nie o
 * to chodzi w artykule, który ma wyglądać jak podręcznik.
 *
 * KaTeX, nie MathJax: składa synchronicznie, bez czekania na układ strony, więc
 * wzór nie „przeskakuje" po wyrenderowaniu. MathLive (edytor wizualny z raportu)
 * to osobna decyzja — najpierw dokument ma się dobrze czytać, potem dobrze
 * edytować.
 *
 * **Błąd składni nie może wywalić bloku.** Wzór z literówką pokazujemy jako
 * surowy tekst z ostrzeżeniem: autor musi zobaczyć, co napisał, żeby to
 * poprawić — pusty prostokąt albo czerwony komunikat KaTeX-a mówią mniej.
 */
import { useMemo } from 'react';
import katex from 'katex';

export interface MathProps {
  latex: string;
  /** Wzór w osobnej linii (`display`) czy w tekście. */
  block?: boolean;
}

export function Math({ latex, block = true }: MathProps) {
  const rendered = useMemo(() => {
    try {
      return {
        html: katex.renderToString(latex, {
          displayMode: block,
          throwOnError: true,
          strict: false,
          // `\cdot`, `\frac`, `\sqrt` i reszta zapisu fizycznego mieści się w
          // domyślnym zestawie; makra własne byłyby kolejnym dialektem.
          trust: false,
        }),
      };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [latex, block]);

  if (rendered.error) {
    return (
      <span
        title={rendered.error}
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 13,
          color: '#b91c1c',
          background: '#fef2f2',
          borderRadius: 3,
          padding: '1px 4px',
        }}
      >
        {latex}
      </span>
    );
  }

  return (
    <span
      // Wejściem jest LaTeX z dokumentu, a wyjściem HTML KaTeX-a — biblioteka
      // sama escapuje treść i nie przepuszcza znaczników (`trust: false`).
      dangerouslySetInnerHTML={{ __html: rendered.html! }}
      style={block ? { display: 'block', overflowX: 'auto', overflowY: 'hidden' } : undefined}
    />
  );
}

/** Greckie litery i inne nazwy, które w LaTeX-u wymagają odwrotnego ukośnika. */
const LATEX_NAMES = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
  'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]);

/**
 * Nazwa symbolu w zapisie LaTeX.
 *
 * Model trzyma nazwy bez ozdobników (`theta_0`), bo tak nazywa je silnik
 * matematyczny. Do złożenia wzoru trzeba drogi powrotnej: `theta_0` → `\theta_0`,
 * `v_x` → `v_x`. Bez niej pochodne w układzie ODE wyglądałyby jak „dtheta/dt".
 */
export function symbolToLatex(name: string): string {
  const [base, ...rest] = name.split('_');
  const head = LATEX_NAMES.has(base) ? `\\${base}` : base;
  return rest.length ? `${head}_{${rest.join('_')}}` : head;
}
