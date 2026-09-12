/**
 * parseFormula.ts — treść bloku ```formula:id ⇄ węzeł grafu wzorów.
 *
 * Blok jest **jednocześnie** tym, co czytelnik widzi w dokumencie, i tym, co
 * liczy symulacja. Stąd zasada: pierwsza linia to matematyka, reszta to
 * metadane. Autor pisze wzór, nie konfigurację.
 *
 * Dwa rodzaje węzłów, bo dynamika w czasie nie mieści się w czystym DAG-u:
 *
 *  • **definicja** — `T = <wyrażenie>`; wynik zależy od innych wartości,
 *  • **ODE** — `@state`, `@d`, `@init`; węzeł produkuje trajektorię, a jego
 *    wnętrze to pętla solvera.
 *
 * Zapis matematyki to **LaTeX**, nie notacja swobodna. To nie jest wybór
 * estetyczny: `2 pi sqrt(L/g)` parsuje się na `2i · p · q · r · s · t · (L/g)`,
 * bo `pi` to `p·i` z jednostką urojoną, a `sqrt` to iloczyn czterech liter.
 * LaTeX (`2\pi\sqrt{\frac{L}{g}}`) jest jednoznaczny i to samo wyjdzie z
 * MathLive i z rozpoznawania pisma rysikiem.
 */

/**
 * `relation` to równanie, które **nie jest przypisaniem** — jak (15-5)
 * u Resnicka: `d²x/dt² + (k/m)x = 0`. Podręcznik jest ich pełen, a tekst
 * odsyła do nich po numerze, więc muszą mieć identyfikator i dać się pokazać.
 * Do grafu obliczeń nie wchodzą: nie ma czego z nich policzyć bez rozwiązania.
 */
export type FormulaKind = 'definition' | 'ode' | 'pde' | 'linalg' | 'relation';

/**
 * Opis bloku algebry liniowej.
 *
 * Trzymamy **surowy tekst** deklaracji, a nie sparsowane liczby: parser wzoru
 * nie zna algebry, a rozdzielenie tych warstw pozwala zgłaszać błędy kształtu
 * macierzy tam, gdzie znane jest ich znaczenie.
 */
export interface LinAlgSpec {
  matrices: Array<{ name: string; text: string }>;
  vectors: Array<{ name: string; text: string }>;
  /**
   * Czy blok opisuje przestrzeń trójwymiarową.
   *
   * Wynika z użytych dyrektyw (`@mat3`/`@vec3`), a nie z osobnej deklaracji:
   * autor pisze wymiar raz, w zapisie macierzy, i nie może się pomylić.
   */
  dim3?: boolean;
  /** Przypisania liczone po kolei — kolejność zapisu jest kolejnością liczenia. */
  definitions: Array<{ name: string; expression: string }>;
}

/** Opis pola na siatce 2D — wypełniany dyrektywami bloku `@pde`. */
export interface PdeSpec {
  /** Nazwa pola, np. `u`. */
  field?: string;
  /** Rozdzielczość siatki. */
  nx?: number;
  ny?: number;
  /** Dziedzina: `[od, do]` w jednostkach osi. */
  domainX?: [number, number];
  domainY?: [number, number];
  /** Jednostka osi — obie osie muszą mieć tę samą. */
  domainUnit?: string;
  /** Prawa strona `@d u = …` (pierwszy rząd w czasie: dyfuzja). */
  first?: string;
  /** Prawa strona `@d2 u = …` (drugi rząd w czasie: fala). */
  second?: string;
  /** Warunek początkowy jako wyrażenie od `x` i `y`. */
  init?: string;
  /**
   * Warunek początkowy narysowany piórem, jako lista pociągnięć.
   *
   * Ma pierwszeństwo przed `@init`: gdy oba są w bloku, obowiązuje rysunek, a
   * wzór zostaje jako ślad tego, co było wcześniej. Kompilacja zamienia
   * pociągnięcia na takie samo wyrażenie, więc solver nie widzi różnicy.
   */
  strokes?: string;
  /** Warunek początkowy dla prędkości pola (`@init2`), gdy równanie jest falowe. */
  initRate?: string;
  /** `dirichlet` z wartością na brzegu albo `neumann` (brzeg izolowany). */
  boundary?: { kind: 'dirichlet'; value: number } | { kind: 'neumann' };
}

export interface FormulaEvent {
  /** Warunek w LaTeX-u, np. `y < 0`. */
  when: string;
  /** Przypisania wykonywane po zajściu zdarzenia. */
  assign?: Record<string, string>;
  /** Czy zdarzenie kończy symulację. */
  stop?: boolean;
}

export interface FormulaIssue {
  message: string;
  /** Numer linii w bloku (0-based) — do podświetlenia w edytorze. */
  line?: number;
}

export interface FormulaBlock {
  id: string;
  kind: FormulaKind;
  /** Surowy LaTeX — używany, gdy równanie nie jest przypisaniem (`relation`). */
  latex?: string;
  /** Nazwa wyniku dla definicji — po niej inne wzory się do niej odwołują. */
  target?: string;
  /**
   * Dosłowny zapis lewej strony, np. `\omega_0`.
   *
   * Model pracuje na nazwie znormalizowanej, ale zapis ma wrócić w postaci, w
   * jakiej napisał go autor — inaczej samo otwarcie dokumentu przepisywałoby
   * mu wzory.
   */
  targetLatex?: string;
  /** Prawa strona definicji w LaTeX-u — **ostatni** człon łańcucha równości. */
  expression?: string;
  /**
   * Człony łańcucha `a = b = c`, gdy autor pokazał drogę, a nie sam wynik.
   *
   * Do liczenia służy ostatni (wyrażony przez wielkości znane); pośrednie
   * zostają do pokazania, bo w nich mieści się wartość dydaktyczna zapisu.
   * Zwykły wzór nie ma tego pola wcale — pusta tablica zmuszałaby widok do
   * odróżniania jej od łańcucha jednoelementowego.
   */
  chain?: string[];
  /** Zmienne stanu układu ODE, w kolejności wektora stanu. */
  state?: string[];
  /** Pochodne zmiennych stanu: nazwa → wyrażenie LaTeX. */
  derivatives?: Record<string, string>;
  /** Warunki początkowe: nazwa → wyrażenie LaTeX (może odwoływać się do parametrów). */
  init?: Record<string, string>;
  /**
   * Zdarzenia: co ma się stać, gdy układ przekroczy próg.
   *
   * Trzeci typ węzła z sekcji 3.6b raportu. Odbicie, zatrzymanie, przełączenie
   * — rzeczy, których nie da się zapisać jako ciągła pochodna.
   */
  events?: FormulaEvent[];
  /**
   * Wielkości, które mają pozostać stałe: nazwa → wyrażenie LaTeX.
   *
   * Deklaracja **nie wchodzi do obliczeń** — układ liczy się tak samo z nią
   * i bez niej. Wchodzi do tego, co silnik potrafi o obliczeniach powiedzieć:
   * energia, która narasta, jest jedynym sygnałem, że krok całkowania jest za
   * duży, a wykres wygląda przy tym zupełnie zdrowo.
   */
  invariants?: Record<string, string>;
  /** Opis pola na siatce, gdy blok jest równaniem cząstkowym. */
  pde?: PdeSpec;
  /** Deklaracje algebry liniowej, gdy blok jest sceną przekształcenia. */
  linalg?: LinAlgSpec;
  /** Metoda całkowania wskazana przez autora; brak = wybór domyślny. */
  solver?: string;
  /**
   * Tolerancja względna dla metod adaptacyjnych.
   *
   * Osobno od `solver`, bo odpowiada na inne pytanie: metoda to „czym liczyć",
   * tolerancja to „jak dokładnie". Metody o stałym kroku ją ignorują — i to
   * jest powód, dla którego w ogóle warto wybrać metodę adaptacyjną.
   */
  tolerance?: number;
  /** Jednostki zmiennych — podstawa analizy wymiarowej i UI parametrów. */
  vars: Record<string, string>;
  derivedFrom: string[];
  approximates: string[];
  specialCaseOf: string[];
  assume: string[];
  /** Dyrektywy, których nie rozumiemy — wracają nietknięte przy zapisie. */
  unknown: string[];
  issues: FormulaIssue[];
}

/**
 * Przypisanie „nazwa = wyrażenie".
 *
 * Nazwa może nieść **argument w nawiasie** — `U(x)`, `F(x)` — bo tak pisze
 * podręcznik. To wyłącznie zapis: wielkością pozostaje `U`, więc graf obliczeń
 * nic o tym nie wie. Nawias musi przylegać do nazwy, inaczej `E (m + 1) = 2`
 * (mnożenie) udawałoby funkcję.
 *
 * Nawias jest w **tej samej grupie** co nazwa, a nie w osobnej — dzięki temu
 * numery grup zostają, a używa ich sześć innych miejsc w tym pliku.
 */
const ASSIGNMENT = /^\s*((?:\\?[A-Za-z][A-Za-z0-9]*(?:_\{?[A-Za-z0-9]+\}?)?)(?:\([^)\s][^)]*\))?)\s*=\s*([\s\S]+?)\s*$/;

/**
 * Warianty greckich liter, którym Compute Engine nadaje **inną nazwę, niż
 * wygląda ich zapis**: `\varkappa` staje się `kappaSymbol`, a nie `varkappa`.
 *
 * Bez tej tabeli `@vars \varkappa: N*m` deklarowało wielkość o nazwie, której
 * w skompilowanym wyrażeniu nie było — wzór zgłaszał brakujący symbol i nie dawał
 * się policzyć. A warianty nie są ozdobą: Resnick pisze moment kierujący
 * wahadła torsyjnego właśnie jako `ϰ`.
 */
const WARIANTY_GRECKIE: Record<string, string> = {
  varkappa: 'kappaSymbol',
  varepsilon: 'epsilonSymbol',
  vartheta: 'thetaSymbol',
  varrho: 'rhoSymbol',
  varpi: 'piSymbol',
  varsigma: 'finalSigma',
};

/**
 * `\varphi` nie da się zmapować, bo Compute Engine czyta je jako **złoty
 * podział** — stałą 1,618, a nie symbol. Wzór z nim nie tyle się psuje, co po
 * cichu liczy z podstawioną liczbą, więc zgłaszamy to jako błąd bloku.
 */
const VARPHI = /\\varphi\b/;

/** Lewa strona typu `\omega' = …` — nazwa wielkości zakończona primem. */
const PRIM_PO_LEWEJ = /^\s*\\?[A-Za-z][A-Za-z0-9]*(?:_\{?[A-Za-z0-9]+\}?)?'\s*=/;

/**
 * Nazwa symbolu w postaci, jakiej używa silnik matematyczny.
 *
 * Autor pisze `\omega_0` albo `omega_0` — to ten sam byt, bo Compute Engine
 * mapuje polecenie LaTeX-a na symbol o tej samej nazwie bez backslasha.
 * Normalizujemy przy wejściu, żeby reszta kodu miała jedną postać.
 *
 * Uwaga dla autora: w **wyrażeniach** nazwa wieloliterowa musi mieć backslash.
 * `theta_0` bez niego rozpada się na iloczyn `t·h·e·t·a_0` — to ta sama
 * pułapka, co `pi` czytane jako `p·i`.
 */
export function symbolName(latexName: string): string {
  const goła = latexName.replace(/\\/g, '').replace(/[{}]/g, '');
  // Indeks zostaje nietknięty: `\vartheta_0` to `thetaSymbol_0`, tak samo jak
  // czyta to silnik. Mapujemy więc samą bazę nazwy, a nie cały napis.
  const podzial = goła.indexOf('_');
  const baza = podzial < 0 ? goła : goła.slice(0, podzial);
  const wariant = WARIANTY_GRECKIE[baza];
  if (!wariant) return goła;
  return podzial < 0 ? wariant : wariant + goła.slice(podzial);
}
const DIRECTIVE = /^\s*@([A-Za-z][A-Za-z0-9]*)\s*(.*)$/;

/** `L: m, g: m/s^2` → mapa nazwa → jednostka. */
function parseVars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(',')) {
    const [name, unit] = part.split(':').map((s) => s.trim());
    if (name) out[symbolName(name)] = unit ?? '1';
  }
  return out;
}

/** `theta = theta0, omega = 0` → mapa nazwa → wyrażenie. */
function parseAssignments(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[symbolName(part.slice(0, eq).trim())] = part.slice(eq + 1).trim();
  }
  return out;
}

/** `x: 0..1 m, y: 0..1 m` → zakresy obu osi. */
function parseDomain(rest: string): Partial<PdeSpec> | undefined {
  const osie: Record<string, [number, number]> = {};
  let unit: string | undefined;

  for (const czesc of rest.split(',')) {
    const dopasowanie = /^\s*([xy])\s*:\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)\s*(\S+)?\s*$/.exec(czesc);
    if (!dopasowanie) return undefined;
    osie[dopasowanie[1]] = [Number(dopasowanie[2]), Number(dopasowanie[3])];
    unit = dopasowanie[4] ?? unit;
  }

  if (!osie.x || !osie.y) return undefined;
  return { domainX: osie.x, domainY: osie.y, domainUnit: unit };
}

/** `dirichlet 0` albo `neumann`. */
function parseBoundary(rest: string): PdeSpec['boundary'] {
  const [rodzaj, wartosc] = rest.trim().split(/\s+/);
  if (rodzaj === 'neumann') return { kind: 'neumann' };
  if (rodzaj === 'dirichlet') {
    const liczba = wartosc === undefined ? 0 : Number(wartosc);
    return Number.isFinite(liczba) ? { kind: 'dirichlet', value: liczba } : undefined;
  }
  return undefined;
}

/**
 * Rozdziela łańcuch równości na człony.
 *
 * Znak `=` wewnątrz nawiasów albo w poleceniu LaTeX-a (`\leq`, `\neq`) nie
 * rozdziela — inaczej wyrażenie z warunkiem rozpadłoby się w połowie.
 */
function rozdzielLancuch(prawaStrona: string): string[] {
  const czlony: string[] = [];
  let glebokosc = 0;
  let biezacy = '';

  for (let i = 0; i < prawaStrona.length; i += 1) {
    const znak = prawaStrona[i];
    if ('({['.includes(znak)) glebokosc += 1;
    if (')}]'.includes(znak)) glebokosc -= 1;

    const poprzedni = prawaStrona[i - 1];
    const nastepny = prawaStrona[i + 1];
    const czescOperatora = poprzedni === '<' || poprzedni === '>' || poprzedni === '!'
      || nastepny === '=' || poprzedni === '=';

    if (znak === '=' && glebokosc === 0 && !czescOperatora) {
      czlony.push(biezacy.trim());
      biezacy = '';
      continue;
    }
    biezacy += znak;
  }

  czlony.push(biezacy.trim());
  return czlony.filter(Boolean);
}

export function parseFormulaBlock(id: string, body: string): FormulaBlock {
  const block: FormulaBlock = {
    id,
    kind: 'definition',
    vars: {},
    derivedFrom: [],
    approximates: [],
    specialCaseOf: [],
    assume: [],
    unknown: [],
    issues: [],
  };

  const lines = body.split('\n');
  let sawAssignment = false;

  if (VARPHI.test(body)) {
    block.issues.push({
      message: 'Zapis „\\varphi" jest w silniku matematycznym złotym podziałem (1,618), '
        + 'a nie symbolem — wzór policzyłby się z podstawioną liczbą. Użyj „\\phi".',
    });
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const directive = DIRECTIVE.exec(trimmed);
    if (directive) {
      const [, name, rest] = directive;
      switch (name) {
        case 'ode':
          block.kind = 'ode';
          return;
        case 'pde':
          block.kind = 'pde';
          block.pde = { ...block.pde };
          return;
        case 'linalg':
          block.kind = 'linalg';
          block.linalg = block.linalg ?? { matrices: [], vectors: [], definitions: [] };
          return;
        case 'mat3':
        case 'vec3':
        case 'mat':
        case 'vec': {
          const assignment = ASSIGNMENT.exec(rest);
          if (!assignment) {
            block.issues.push({
              message: `Deklaracja musi mieć postać „@${name} nazwa = wartość".`,
              line: index,
            });
            return;
          }
          const spec = block.linalg ?? { matrices: [], vectors: [], definitions: [] };
          const wpis = { name: symbolName(assignment[1]), text: assignment[2].trim() };
          const trojwymiarowy = spec.dim3 || name.endsWith('3');
          block.linalg = name.startsWith('mat')
            ? { ...spec, dim3: trojwymiarowy, matrices: [...spec.matrices, wpis] }
            : { ...spec, dim3: trojwymiarowy, vectors: [...spec.vectors, wpis] };
          return;
        }
        case 'field':
          block.pde = { ...block.pde, field: symbolName(rest.trim()) };
          return;
        case 'grid': {
          // `40 x 40` — krzyżyk, bo tak zapisuje się rozdzielczość i tak
          // czyta się to w dokumencie.
          const wymiary = /^(\d+)\s*[x×]\s*(\d+)$/.exec(rest.trim());
          if (!wymiary) {
            block.issues.push({ message: 'Siatka musi mieć postać „@grid 64 x 64".', line: index });
            return;
          }
          block.pde = { ...block.pde, nx: Number(wymiary[1]), ny: Number(wymiary[2]) };
          return;
        }
        case 'domain': {
          const osie = parseDomain(rest);
          if (!osie) {
            block.issues.push({
              message: 'Dziedzina musi mieć postać „@domain x: 0..1 m, y: 0..1 m".',
              line: index,
            });
            return;
          }
          block.pde = { ...block.pde, ...osie };
          return;
        }
        case 'd2': {
          const assignment = ASSIGNMENT.exec(rest);
          if (!assignment) {
            block.issues.push({ message: 'Druga pochodna musi mieć postać „@d2 pole = wyrażenie".', line: index });
            return;
          }
          block.pde = { ...block.pde, second: assignment[2] };
          return;
        }
        case 'strokes':
          block.pde = { ...block.pde, strokes: rest.trim() };
          return;
        case 'init2':
          block.pde = { ...block.pde, initRate: rest.trim() };
          return;
        case 'boundary': {
          const warunek = parseBoundary(rest);
          if (!warunek) {
            block.issues.push({
              message: 'Warunek brzegowy to „@boundary dirichlet <wartość>" albo „@boundary neumann".',
              line: index,
            });
            return;
          }
          block.pde = { ...block.pde, boundary: warunek };
          return;
        }
        case 'state':
          block.state = rest.split(',').map((s) => symbolName(s.trim())).filter(Boolean);
          return;
        case 'd': {
          const assignment = ASSIGNMENT.exec(rest);
          if (!assignment) {
            block.issues.push({ message: `Pochodna musi mieć postać „@d zmienna = wyrażenie".`, line: index });
            return;
          }
          // W bloku pola ta sama dyrektywa opisuje ewolucję pola, a nie
          // zmiennej stanu — jedna składnia dla obu rodzajów równań.
          if (block.kind === 'pde') block.pde = { ...block.pde, first: assignment[2] };
          else block.derivatives = { ...block.derivatives, [symbolName(assignment[1])]: assignment[2] };
          return;
        }
        case 'init':
          if (block.kind === 'pde') block.pde = { ...block.pde, init: rest.trim().replace(/^[^=]*=\s*/, '') };
          else block.init = { ...block.init, ...parseAssignments(rest) };
          return;
        case 'when':
          block.events = [...(block.events ?? []), { when: rest.trim() }];
          return;
        case 'then': {
          const last = block.events?.[block.events.length - 1];
          if (!last) {
            block.issues.push({ message: '„@then" musi stać po „@when".', line: index });
            return;
          }
          last.assign = { ...last.assign, ...parseAssignments(rest) };
          return;
        }
        case 'stop': {
          const last = block.events?.[block.events.length - 1];
          if (!last) {
            block.issues.push({ message: '„@stop" musi stać po „@when".', line: index });
            return;
          }
          last.stop = true;
          return;
        }
        case 'invariant': {
          const assignment = ASSIGNMENT.exec(rest);
          if (!assignment) {
            block.issues.push({
              message: 'Niezmiennik zapisuje się „@invariant nazwa = wyrażenie", np. „@invariant E = \\frac{1}{2} m v^2".',
              line: index,
            });
            return;
          }
          block.invariants = { ...block.invariants, [symbolName(assignment[1])]: assignment[2] };
          return;
        }
        case 'relation':
          /*
           * Dyrektywa działa **niezależnie od miejsca w bloku**.
           *
           * Parser czyta liniowo, więc pierwotnie liczyła się tylko wtedy, gdy
           * stała przed wzorem. Autor stawia ją jednak tam, gdzie stoją
           * wszystkie pozostałe dyrektywy — pod spodem — i wtedy wzór trafiał
           * do nierozpoznanych linii, a blok zgłaszał „równanie nie ma treści".
           * Komunikat był podwójnie mylący: treść była, a przyczyną była
           * kolejność, o której nigdzie nie napisano.
           *
           * Dlatego przy przejściu na `relation` zbieramy z powrotem to, co
           * zdążyło się rozejść: rozbiór na przypisanie (`E = mc^2`) i linie
           * uznane za nierozpoznane.
           */
          block.kind = 'relation';
          if (!block.latex) {
            const zPrzypisania = block.target !== undefined
              ? [`${block.targetLatex ?? block.target} = ${(block.chain ?? [block.expression ?? '']).join(' = ')}`]
              : [];
            const zNieznanych = block.unknown.filter((line) => !line.startsWith('@'));
            const odzyskane = [...zPrzypisania, ...zNieznanych].filter(Boolean);
            if (odzyskane.length) {
              block.latex = odzyskane.join(' ');
              block.unknown = block.unknown.filter((line) => line.startsWith('@'));
              delete block.target;
              delete block.targetLatex;
              delete block.expression;
              delete block.chain;
            }
          }
          return;
      case 'solver':
          block.solver = rest.trim();
          return;
        case 'tol': {
          const value = Number(rest.trim());
          if (!Number.isFinite(value) || value <= 0) {
            block.issues.push({ message: 'Tolerancja to dodatnia liczba, np. „@tol 1e-8".', line: index });
            return;
          }
          block.tolerance = value;
          return;
        }
        case 'vars':
          block.vars = { ...block.vars, ...parseVars(rest) };
          return;
        case 'derivedFrom':
        case 'approximates':
        case 'specialCaseOf':
        case 'assume':
          (block[name] as string[]).push(...rest.split(',').map((s) => s.trim()).filter(Boolean));
          return;
        default:
          // Zasada z reszty projektu: albo rozumiemy linię w całości, albo
          // zostawiamy ją nietkniętą.
          block.unknown.push(trimmed);
          return;
      }
    }

    if (block.kind === 'relation') {
      block.latex = block.latex ? `${block.latex} ${trimmed}` : trimmed;
      return;
    }

    const assignment = ASSIGNMENT.exec(trimmed);
    if (assignment && block.kind === 'linalg') {
      const spec = block.linalg ?? { matrices: [], vectors: [], definitions: [] };
      block.linalg = {
        ...spec,
        definitions: [...spec.definitions, {
          name: symbolName(assignment[1]),
          expression: assignment[2].trim(),
        }],
      };
      return;
    }

    if (assignment && !sawAssignment) {
      sawAssignment = true;
      // Argument w nawiasie należy do zapisu, nie do nazwy wielkości.
      block.target = symbolName(assignment[1].replace(/\([^)]*\)$/, ''));
      block.targetLatex = assignment[1];

      // Łańcuch `T = 2π/ω = 2π√(m/k)`: liczymy z **ostatniego** członu, bo to
      // on jest wyrażony przez wielkości znane. Pierwszy bywa zapisany przez
      // wielkość liczoną gdzie indziej i sam z siebie nie wystarcza.
      const czlony = rozdzielLancuch(assignment[2]);
      block.expression = czlony[czlony.length - 1];
      if (czlony.length > 1) block.chain = czlony;
      return;
    }

    block.unknown.push(trimmed);
  });

  validate(block);
  return block;
}

function validate(block: FormulaBlock): void {
  // Pole na siatce ma własny komplet wymagań (siatka, dziedzina, warunek
  // początkowy) i sprawdza je `compilePde` — tam, gdzie znane są też jednostki.
  if (block.kind === 'linalg') {
    const spec = block.linalg;
    if (!spec?.matrices.length && !spec?.vectors.length) {
      block.issues.push({ message: 'Blok algebry potrzebuje choć jednej deklaracji „@mat" albo „@vec".' });
    }
    return;
  }

  if (block.kind === 'pde') {
    if (!block.pde?.field) block.issues.push({ message: 'Blok pola musi wskazać pole przez „@field".' });
    return;
  }

  // Równanie bez przypisania niesie tylko zapis — sprawdzamy, że w ogóle coś
  // ma, bo pusty blok byłby cichym brakiem.
  if (block.kind === 'relation') {
    if (!block.latex) {
      block.issues.push({ message: `Równanie „${block.id}" nie ma treści.` });
    }
    return;
  }

  if (block.kind === 'definition') {
    if (!block.target) {
      // Prim jest w podręczniku zwykłym oznaczeniem innej wielkości (`ω′` to
      // częstość ruchu tłumionego), ale dla silnika matematycznego znaczy
      // pochodną. Bez tej podpowiedzi autor dostawał „musi być przypisaniem"
      // przy zapisie, w którym przypisanie widać gołym okiem.
      const zPrimem = block.unknown.some((linia) => PRIM_PO_LEWEJ.test(linia));
      block.issues.push({
        message: zPrimem
          ? 'Nazwa z primem („\\omega\'") znaczy dla silnika matematycznego pochodną, '
            + 'a nie osobną wielkość, więc wzór nie może być przypisaniem. '
            + 'Zapisz go jako „@relation" — zostanie pokazany dokładnie jak w druku, '
            + 'ale nie wejdzie do grafu obliczeń.'
          : 'Wzór musi być przypisaniem postaci „nazwa = wyrażenie".',
      });
    }
    return;
  }

  const state = block.state ?? [];
  if (!state.length) {
    block.issues.push({ message: 'Układ ODE musi deklarować zmienne stanu przez „@state".' });
    return;
  }

  for (const event of block.events ?? []) {
    if (!event.assign && !event.stop) {
      block.issues.push({ message: `Zdarzenie „${event.when}" nic nie robi — dodaj „@then" albo „@stop".` });
    }
    for (const name of Object.keys(event.assign ?? {})) {
      if (!(block.state ?? []).includes(name)) {
        block.issues.push({ message: `Zdarzenie zmienia „${name}", które nie jest zmienną stanu.` });
      }
    }
  }

  const derivatives = block.derivatives ?? {};
  for (const name of Object.keys(derivatives)) {
    if (!state.includes(name)) {
      block.issues.push({ message: `„@d ${name}" opisuje pochodną zmiennej spoza @state.` });
    }
  }
  for (const name of state) {
    if (!(name in derivatives)) {
      block.issues.push({ message: `Zmienna stanu „${name}" nie ma pochodnej — dodaj „@d ${name} = …".` });
    }
  }
}

export function serializeFormulaBlock(block: FormulaBlock): string {
  const out: string[] = [];

  if (block.kind === 'ode') {
    out.push('@ode');
    if (block.state?.length) out.push(`@state ${block.state.join(', ')}`);
    // Kolejność pochodnych idzie za kolejnością @state, żeby zapis czytał się
    // tak jak wektor stanu, a nie w kolejności przypadkowego wpisywania.
    for (const name of block.state ?? []) {
      const expression = block.derivatives?.[name];
      if (expression !== undefined) out.push(`@d ${name} = ${expression}`);
    }
    const init = block.init ?? {};
    const initEntries = Object.entries(init);
    if (initEntries.length) out.push(`@init ${initEntries.map(([k, v]) => `${k} = ${v}`).join(', ')}`);
    if (block.solver) out.push(`@solver ${block.solver}`);
    if (block.tolerance !== undefined) out.push(`@tol ${block.tolerance}`);
    for (const event of block.events ?? []) {
      out.push(`@when ${event.when}`);
      const assign = Object.entries(event.assign ?? {});
      if (assign.length) out.push(`@then ${assign.map(([k, v]) => `${k} = ${v}`).join(', ')}`);
      if (event.stop) out.push('@stop');
    }
  } else if (block.target) {
    // Łańcuch równości zapisujemy w całości: to on niesie wyprowadzenie,
    // a samo `block.expression` to tylko jego ostatni człon.
    out.push(`${block.targetLatex ?? block.target} = ${block.chain?.join(' = ') ?? block.expression ?? ''}`);
  }

  // Niezmienniki tuż po równaniach, bo mówią o tym samym układzie — a przed
  // jednostkami, bo jednostki bywają deklarowane także dla nich.
  for (const [name, expression] of Object.entries(block.invariants ?? {})) {
    out.push(`@invariant ${name} = ${expression}`);
  }

  const vars = Object.entries(block.vars);
  if (vars.length) out.push(`@vars ${vars.map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  for (const key of ['derivedFrom', 'approximates', 'specialCaseOf'] as const) {
    for (const value of block[key]) out.push(`@${key} ${value}`);
  }
  for (const value of block.assume) out.push(`@assume ${value}`);
  out.push(...block.unknown);

  return out.join('\n');
}

/** Otwierający infostring bloku: ```formula:id */
export const FORMULA_FENCE = /^formula:([A-Za-z0-9_-]+)$/;
