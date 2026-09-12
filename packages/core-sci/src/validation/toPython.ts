/**
 * toPython.ts — wzór z dokumentu jako wyrażenie Pythona.
 *
 * Warstwa pod cross-walidacją z raportu (§7, poziom 2): SciPy ma policzyć **ten
 * sam** układ równań co sci-core. Sens porównania stoi i upada na dosłowności
 * tłumaczenia — gdyby Python dostał choć trochę inny model, zgodność wyników
 * nic by nie znaczyła, a rozbieżność wskazywałaby na tłumacza zamiast na solver.
 *
 * Tłumaczymy z **MathJSON**, nie z zapisu tekstowego. Serializacja ascii z
 * Compute Engine wygląda kusząco blisko Pythona, ale zostawia niejawne
 * mnożenia (`2pi`, `-30(x - 0.5)`) i symbole w cudzysłowach (`"omega_0"`),
 * czyli dokładnie te miejsca, w których Python albo się wywali, albo — gorzej —
 * policzy coś innego. MathJSON jest drzewem: każdy nawias i każde mnożenie
 * stawiamy sami i wiemy, że tam są.
 *
 * Zasada z reszty projektu obowiązuje: nieznana konstrukcja jest **zgłaszana**,
 * a nie zamieniana na coś podobnego.
 */
import { ComputeEngine } from '@cortex-js/compute-engine';

const engine = new ComputeEngine();

export interface PythonExpression {
  /** Wyrażenie gotowe do wstawienia w kod Pythona. */
  code: string;
  /** Symbole, które skrypt musi podstawić. */
  symbols: string[];
  issues: string[];
}

/**
 * Funkcje o tej samej nazwie w MathJSON i w module `math` Pythona.
 *
 * `Ln` → `log`, bo w Pythonie `log` jest logarytmem naturalnym; `log` z
 * MathJSON (dziesiętny) trafia osobno na `log10`.
 */
const FUNKCJE: Record<string, string> = {
  Sin: 'sin', Cos: 'cos', Tan: 'tan',
  Arcsin: 'asin', Arccos: 'acos', Arctan: 'atan',
  Sinh: 'sinh', Cosh: 'cosh', Tanh: 'tanh',
  Exp: 'exp', Ln: 'log', Log: 'log10', Sqrt: 'sqrt', Abs: 'fabs',
};

const STALE: Record<string, string> = {
  Pi: 'pi',
  ExponentialE: 'e',
};

/** Nazwa symbolu bez ozdobników LaTeX-a — taka sama jak w reszcie rdzenia. */
function nazwa(symbol: string): string {
  return symbol.replace(/^\\/, '').replace(/[{}\\]/g, '');
}

function serialize(json: unknown, symbols: Set<string>, issues: string[]): string {
  if (typeof json === 'number') return String(json);

  if (typeof json === 'string') {
    if (STALE[json]) return STALE[json];
    const czysta = nazwa(json);
    symbols.add(czysta);
    return czysta;
  }

  if (!Array.isArray(json) || !json.length) {
    issues.push(`Nie umiem przetłumaczyć fragmentu: ${JSON.stringify(json)}.`);
    return '0';
  }

  const [head, ...args] = json as [string, ...unknown[]];
  const dzieci = () => args.map((a) => serialize(a, symbols, issues));

  switch (head) {
    case 'Add': return `(${dzieci().join(' + ')})`;
    case 'Subtract': return `(${dzieci().join(' - ')})`;
    case 'Negate': return `(-${dzieci()[0]})`;
    case 'Multiply': return `(${dzieci().join(' * ')})`;
    case 'Divide': return `(${dzieci().join(' / ')})`;
    case 'Power': {
      const [podstawa, wykladnik] = dzieci();
      // `^` w Pythonie znaczy XOR, więc pomyłka tutaj nie wywala kodu, tylko
      // po cichu liczy co innego. Stąd osobny przypadek zamiast przepisania.
      return `(${podstawa} ** ${wykladnik})`;
    }
    case 'Square': return `(${dzieci()[0]} ** 2)`;
    case 'Root': {
      const [radykand, stopien] = dzieci();
      return `(${radykand} ** (1 / ${stopien}))`;
    }
    case 'Rational': {
      const [licznik, mianownik] = dzieci();
      return `(${licznik} / ${mianownik})`;
    }
    case 'Delimiter':
    case 'Sequence':
      return dzieci()[0] ?? '0';
    default: {
      const funkcja = FUNKCJE[head];
      if (funkcja) return `${funkcja}(${dzieci().join(', ')})`;

      issues.push(
        `Nie umiem przetłumaczyć „${head}" na Pythona — cross-walidacja pominie ten wzór.`,
      );
      return '0';
    }
  }
}

/** Tłumaczy wzór z LaTeX-a na wyrażenie Pythona. */
export function latexToPython(latex: string): PythonExpression {
  const issues: string[] = [];
  const symbols = new Set<string>();

  let json: unknown;
  try {
    json = engine.parse(latex).json;
  } catch (error) {
    return { code: '0', symbols: [], issues: [`Nie umiem odczytać „${latex}": ${(error as Error).message}`] };
  }

  const code = serialize(json, symbols, issues);
  return { code, symbols: [...symbols], issues };
}
