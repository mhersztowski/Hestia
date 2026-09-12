/**
 * compileGraph.ts — graf wzorów → wykonywalny model zjawiska.
 *
 * To jest miejsce, w którym teza raportu przestaje być deklaracją: dokument
 * *jest* warstwą obliczeniową. Na wejściu bloki, które czytelnik widzi na
 * stronie, na wyjściu obiekt, który da się uruchomić, wykreślić i przetestować.
 *
 * `PhenomenonModel` z sekcji 3.3 raportu jest tu **artefaktem kompilacji**, a
 * nie klasą pisaną ręcznie. Ręczna implementacja zostaje możliwa (kolizje,
 * siatki PDE), ale przestaje być domyślną ścieżką.
 *
 * Jedna decyzja wymaga uzasadnienia: wyrażenia kompilujemy **raz**, przy
 * budowie modelu, a nie przy każdym kroku. Prawa strona ODE jest wołana cztery
 * razy na krok RK4, czyli setki tysięcy razy na sekundę animacji — kompilacja
 * w pętli kosztowałaby więcej niż samo całkowanie.
 */
import { compileCondition, compileComparison, compileExpression } from '../formula/expression';
import type { EventSpec } from '../numeric/events';
import { symbolName } from '../formula/parseFormula';
import { euler, rk4, verlet } from '../numeric/solvers';
import { dopri5, IntegrationError } from '../numeric/dopri5';
import { rosenbrock } from '../numeric/rosenbrock';
import { measureInvariant, type InvariantReport } from '../numeric/invariants';
import { Trajectory } from '../numeric/trajectory';
import { sameDimension, toSI } from '../units/quantity';
import { CONSTANTS } from '../units/constants';
import { topologicalOrder, type FormulaGraph, type GraphNode } from './formulaGraph';

/** Opis parametru — z niego powstaje suwak, pole i wartość domyślna. */
export interface ParamSchema {
  name: string;
  /** Jednostka zadeklarowana w `@vars`; `1` znaczy wielkość bezwymiarową. */
  unit: string;
  /** Wartość domyślna w SI. */
  value: number;
  min: number;
  max: number;
  /** Krok suwaka — dobrany do rzędu wielkości, nie stały. */
  step: number;
}

/** Co model umie pokazać: wielkość skalarną albo przebieg w czasie. */
export interface ObservableDef {
  name: string;
  kind: 'scalar' | 'series';
  unit?: string;
  /** Wzór, z którego wielkość pochodzi — do podświetlenia w dokumencie. */
  formulaId?: string;
  /** Czy to zmienna stanu układu, czy wielkość z niej policzona. */
  fromState?: boolean;
}

export interface PhenomenonModel {
  readonly parameters: ParamSchema[];
  readonly observables: ObservableDef[];
  /** Czy model ma węzeł ODE, czyli czy w ogóle jest co animować. */
  readonly dynamic: boolean;
  /**
   * Pary „zmienna, jej pochodna" odczytane z równań.
   *
   * `@d theta = \omega`, gdzie `omega` też jest zmienną stanu, znaczy że
   * `omega` JEST pochodną `theta`. Stąd bierze się przestrzeń fazowa — bez
   * zgadywania po nazwach i bez wiedzy o konkretnym zjawisku.
   */
  readonly derivativePairs: Array<[string, string]>;
  /** Liczy wszystko dla zadanych parametrów. */
  run(values: Record<string, number>, tSpan?: [number, number], dt?: number): PhenomenonResult;
  readonly issues: string[];
}

export interface PhenomenonResult {
  /** Wielkości skalarne policzone z definicji. */
  scalars: Record<string, number>;
  /** Trajektoria z węzła ODE, jeśli był. */
  trajectory?: Trajectory;
  /**
   * Dlaczego trajektorii nie ma, choć model ją zapowiadał.
   *
   * Nieudane całkowanie nie może wywracać całego dokumentu — blok ma dalej
   * stać na swoim miejscu i powiedzieć, co poszło nie tak. Wyjątek zatrzymałby
   * render strony przez jeden zbyt sztywny układ w jednym akapicie.
   */
  error?: string;
  /** Przebiegi wielkości zależnych od stanu — liczone wzdłuż trajektorii. */
  series: Record<string, Array<[number, number]>>;
  /**
   * Pomiar wielkości zadeklarowanych jako `@invariant`.
   *
   * Pusta lista, gdy autor nic nie zadeklarował albo gdy nie ma trajektorii —
   * brak pola zmuszałby każdy widok do rozróżniania „nie mierzono" od
   * „zmierzono i nic nie znaleziono", a to jest ta sama informacja dla odbiorcy.
   */
  invariants: InvariantReport[];
}

/**
 * Wartość domyślna parametru.
 *
 * Stała fizyczna o tej nazwie jest **podpowiedzią**, nie przechwyceniem
 * symbolu — użytkownik może ją zmienić i policzyć wahadło na Księżycu.
 *
 * Podpowiadamy ją tylko wtedy, gdy **wymiar się zgadza**. Sama nazwa nie
 * wystarcza: `\sigma` w równaniach Lorenza jest bezwymiarową liczbą Prandtla,
 * a podstawienie pod nią stałej Stefana-Boltzmanna (5,67e-8) daje układ
 * zbiegający do punktu zamiast atraktora — błąd cichy, bo liczby wychodzą.
 */
function defaultValueFor(name: string, unit: string): number {
  const constant = CONSTANTS[name] ?? (name === 'g' ? CONSTANTS.g_n : undefined);
  if (constant && sameDimension(unit, constant.unit)) return constant.value;
  if (unit === 'rad') return Math.PI / 12;
  return 1;
}

/** Zakres suwaka dobrany do rzędu wielkości wartości domyślnej. */
function rangeFor(value: number): { min: number; max: number; step: number } {
  const magnitude = Math.abs(value) || 1;
  const max = magnitude * 5;
  return { min: 0, max, step: max / 200 };
}

function paramSchema(name: string, units: Record<string, string>): ParamSchema {
  const unit = units[name] ?? '1';
  const value = defaultValueFor(name, unit);
  return { name, unit, value, ...rangeFor(value) };
}

export function compileGraph(graph: FormulaGraph): PhenomenonModel {
  const issues = graph.issues.map((i) => (i.formulaId ? `[${i.formulaId}] ${i.message}` : i.message));

  // Jednostki zbieramy ze wszystkich bloków: parametr bywa zadeklarowany w
  // jednym wzorze, a używany w drugim.
  const units: Record<string, string> = {};
  for (const node of graph.nodes) Object.assign(units, node.block.vars);

  const parameters = graph.parameters.map((name) => paramSchema(name, units));
  const order = topologicalOrder(graph);
  const byId = new Map(graph.nodes.map((node) => [node.block.id, node]));

  const odeNode = graph.nodes.find((node) => node.block.kind === 'ode');
  const ode = odeNode ? compileOde(odeNode, issues) : undefined;

  // Definicje kompilujemy raz — w pętli renderowania wołamy już tylko funkcje.
  const definitions = order
    .map((id) => byId.get(id))
    .filter((node): node is GraphNode => !!node && node.block.kind === 'definition')
    .map((node) => ({
      node,
      target: node.block.target!,
      compiled: compileExpression(node.block.expression!, [...Object.keys(units), ...(odeNode?.outputs ?? [])]),
    }));

  /**
   * Które definicje muszą być policzone PRZED całkowaniem.
   *
   * Węzeł ODE bywa zależny od innego wzoru — `\omega_0 = \sqrt{k/m}` stoi w
   * dokumencie osobno, a równanie ruchu go używa. Kolejność zna sort
   * topologiczny; wcześniej `run()` ją ignorował i liczył trajektorię zawsze
   * pierwszą, przez co takie wielkości wchodziły do solvera jako `undefined`,
   * a cała trajektoria wychodziła `NaN`.
   */
  const odePosition = odeNode ? order.indexOf(odeNode.block.id) : -1;
  const beforeOde = definitions.filter((d) => odePosition < 0 || order.indexOf(d.node.block.id) < odePosition);
  const afterOde = definitions.filter((d) => !beforeOde.includes(d));

  for (const definition of definitions) {
    for (const issue of definition.compiled.issues) issues.push(`[${definition.node.block.id}] ${issue}`);
  }

  const stateNames = ode?.state ?? [];

  /**
   * Wielkości zadeklarowane jako zachowywane.
   *
   * Zbieramy je ze **wszystkich** bloków, nie tylko z tego z równaniem ruchu:
   * energia bywa zapisana osobnym wzorem wyżej w wykładzie, a dyrektywa stoi
   * wtedy przy niej. Niezmiennik nie wchodzi do obliczeń, więc nie ma go
   * w kolejności topologicznej — jest czytany dopiero na gotowej trajektorii.
   */
  const invariantDefs = graph.nodes.flatMap((node) => Object
    .entries(node.block.invariants ?? {})
    .map((entry) => {
      const [name, expression] = entry;
      const known = [
        ...Object.keys(units), ...stateNames,
        ...definitions.map((d) => d.target), ...parameters.map((p) => p.name),
      ];
      const compiled = compileExpression(expression, known);
      for (const issue of compiled.issues) {
        issues.push(`[${node.block.id}] niezmiennik „${name}": ${issue}`);
      }

      // Wolny symbol w zwykłym wzorze staje się parametrem z suwakiem, bo graf
      // widzi, że nikt go nie liczy. Niezmiennik stoi poza grafem, więc ta
      // ścieżka go nie obejmuje — nierozpoznana nazwa dałaby po cichu NaN
      // i raport „energia nie jest liczbą" zamiast wskazania literówki.
      const nieznane = compiled.freeSymbols.filter((symbol) => !known.includes(symbol));
      if (nieznane.length) {
        issues.push(
          `[${node.block.id}] niezmiennik „${name}" używa wielkości spoza modelu: ${nieznane.join(', ')}.`,
        );
      }
      return { name, compiled };
    }));

  const observables: ObservableDef[] = [
    ...stateNames.map((name): ObservableDef => ({
      name, kind: 'series', unit: units[name], formulaId: odeNode?.block.id, fromState: true,
    })),
    ...definitions.map((definition): ObservableDef => ({
      name: definition.target,
      // Wielkość zależna od stanu zmienia się w czasie — to przebieg, nie liczba.
      kind: definition.compiled.freeSymbols.some((s) => stateNames.includes(s)) ? 'series' : 'scalar',
      unit: units[definition.target],
      formulaId: definition.node.block.id,
    })),
  ];

  return {
    parameters,
    observables,
    dynamic: !!ode,
    derivativePairs: derivativePairs(odeNode),
    issues,
    run(values, tSpan = [0, 10], dt = 0.005) {
      const scope: Record<string, number> = { ...values };
      const scalars: Record<string, number> = {};
      const series: Record<string, Array<[number, number]>> = {};

      // Najpierw to, czego potrzebuje solver.
      for (const definition of beforeOde) {
        const value = definition.compiled.evaluate(scope);
        scalars[definition.target] = value;
        scope[definition.target] = value;
      }

      // Nieudane całkowanie zwracamy jako wynik z wyjaśnieniem, a nie jako
      // wyjątek: blok w dokumencie ma dalej stać na swoim miejscu. Łapiemy
      // wyłącznie `IntegrationError` — błąd w samym wyrażeniu jest usterką
      // do naprawienia, a nie stanem, o którym warto meldować czytelnikowi.
      let trajectory: Trajectory | undefined;
      let error: string | undefined;
      try {
        trajectory = ode?.solve(scope, tSpan, dt);
      } catch (e) {
        if (!(e instanceof IntegrationError)) throw e;
        error = e.message;
      }

      for (const definition of afterOde) {
        const dependsOnState = definition.compiled.freeSymbols.some((s) => stateNames.includes(s));

        if (!dependsOnState || !trajectory) {
          const value = definition.compiled.evaluate(scope);
          scalars[definition.target] = value;
          // Wynik jednego wzoru bywa wejściem następnego — porządek
          // topologiczny gwarantuje, że jest już policzony.
          scope[definition.target] = value;
          continue;
        }

        series[definition.target] = trajectory.samples.map((sample) => {
          const local = { ...scope };
          stateNames.forEach((name, index) => { local[name] = sample.y[index]; });
          return [sample.t, definition.compiled.evaluate(local)] as [number, number];
        });
      }

      if (trajectory) {
        for (const name of stateNames) series[name] = trajectory.series(name);
      }

      // Pomiar na końcu, bo dopiero teraz `scope` zna wszystkie wielkości
      // pomocnicze — energia bywa wyrażona przez \omega_0 policzone osobnym
      // wzorem, a nie wprost przez parametry.
      const invariants = trajectory
        ? invariantDefs.map(({ name, compiled }) => measureInvariant(trajectory, (state) => {
          const local = { ...scope };
          for (let i = 0; i < stateNames.length; i += 1) local[stateNames[i]] = state[i];
          return compiled.evaluate(local);
        }, { name }))
        : [];

      return { scalars, trajectory, series, invariants, error };
    },
  };
}

/**
 * Pary „zmienna, jej pochodna" — czyli te równania, w których pochodna jednej
 * zmiennej stanu JEST inną zmienną stanu.
 *
 * `@d theta = \omega` przy `omega` w stanie daje parę (theta, omega); tak samo
 * `@d x = v_x` daje (x, vx). Cała wiedza pochodzi z równań, więc działa dla
 * każdego układu drugiego rzędu zapisanego jako dwa pierwszego.
 */
function derivativePairs(node?: GraphNode): Array<[string, string]> {
  if (!node) return [];
  const state = node.block.state ?? [];
  const pairs: Array<[string, string]> = [];

  for (const name of state) {
    const expression = node.block.derivatives?.[name];
    if (!expression) continue;
    const candidate = symbolName(expression.trim());
    if (state.includes(candidate) && candidate !== name) pairs.push([name, candidate]);
  }
  return pairs;
}

/** Węzeł ODE → funkcja całkująca. */
function compileOde(node: GraphNode, issues: string[]) {
  const block = node.block;
  const state = block.state ?? [];
  const known = [...state, ...Object.keys(block.vars), ...node.inputs];
  const pairs = derivativePairs(node);

  // Verlet wymaga, żeby stan rozpadał się na pary (położenie, prędkość) —
  // inaczej nie ma czego przeplatać i cała jego zaleta znika. Sprawdzamy to
  // zamiast po cichu wracać do RK4: autor prosił o zachowanie energii.
  const verletUsable = pairs.length * 2 === state.length;
  let method = (block.solver ?? 'rk4').toLowerCase();
  if (method === 'verlet' && !verletUsable) {
    issues.push(
      `[${block.id}] Verlet wymaga stanu złożonego z par „położenie, prędkość" `
      + '(każda zmienna z własną pochodną w stanie). Liczę metodą RK4.',
    );
    method = 'rk4';
  }
  // `rk45` to ta sama metoda pod nazwą, którą częściej spotyka się w podręczniku;
  // `stiff` mówi o **układzie**, a nie o metodzie, i dla autora dokumentu jest
  // często naturalniejszym określeniem tego, czego potrzebuje.
  if (method === 'rk45') method = 'dopri5';
  if (method === 'stiff' || method === 'implicit') method = 'rosenbrock';
  if (!['rk4', 'euler', 'verlet', 'dopri5', 'rosenbrock'].includes(method)) {
    issues.push(`[${block.id}] Nieznana metoda „${block.solver}". Liczę metodą RK4.`);
    method = 'rk4';
  }

  /**
   * Warunki zdarzeń rozłożone na funkcje zmieniające znak.
   *
   * Tylko dla nich da się **rozwiązać** równanie zdarzenia zamiast wypatrywać
   * go po kroku. Warunek złożony (koniunkcja) takiej funkcji nie ma, więc
   * zostaje przy starym trybie — i autor musi o tym wiedzieć, bo różnica
   * dotyczy dokładności wyniku, a nie wygody.
   */
  const comparisons = (block.events ?? []).map((event) => compileComparison(event.when, known));
  const zdarzeniaDokładne = comparisons.length > 0 && comparisons.every((c) => !!c && !c.issues.length);

  if (method === 'rosenbrock' && (block.events ?? []).length) {
    issues.push(
      `[${block.id}] Metoda niejawna sprawdza zdarzenia po kroku, a jej kroki bywają długie — `
      + 'chwila zdarzenia będzie przybliżona. Jeśli układ nie jest sztywny, dokładne zdarzenia '
      + 'daje `@solver dopri5`.',
    );
  }

  if (method === 'dopri5' && comparisons.length && !zdarzeniaDokładne) {
    issues.push(
      `[${block.id}] Warunku zdarzenia nie da się rozłożyć na jedną wielkość przechodzącą przez zero `
      + '(np. jest koniunkcją), więc chwila zdarzenia będzie przybliżona — ograniczam krok z góry, '
      + 'żeby próg nie został przestrzelony. Prosty warunek postaci „wielkość < próg" liczy się dokładnie.',
    );
  }

  const events = (block.events ?? []).map((event) => {
    const condition = compileCondition(event.when, known);
    for (const issue of condition.issues) issues.push(`[${block.id}] ${issue}`);
    const assign = Object.entries(event.assign ?? {}).map(([name, expression]) => {
      const compiled = compileExpression(expression, known);
      for (const issue of compiled.issues) issues.push(`[${block.id}] ${issue}`);
      return { name, compiled };
    });
    return { condition, assign, stop: !!event.stop };
  });

  const derivatives = state.map((name) => {
    const compiled = compileExpression(block.derivatives?.[name] ?? '0', known);
    for (const issue of compiled.issues) issues.push(`[${block.id}] ${issue}`);
    return compiled;
  });

  const initial = state.map((name) => {
    const expression = block.init?.[name];
    if (expression === undefined) return undefined;
    const compiled = compileExpression(expression, known);
    for (const issue of compiled.issues) issues.push(`[${block.id}] ${issue}`);
    return compiled;
  });

  return {
    state,
    solve(scope: Record<string, number>, tSpan: [number, number], dt: number): Trajectory {
      const y0 = state.map((_, index) => initial[index]?.evaluate(scope) ?? 0);

      // Obiekt zakresu tworzymy raz i nadpisujemy w miejscu: przy kilkuset
      // tysiącach wywołań na sekundę alokacja mapy na każdy krok byłaby
      // najdroższą rzeczą w całej symulacji.
      const local: Record<string, number> = { ...scope };
      const f = (t: number, y: number[]) => {
        local.t = t;
        for (let i = 0; i < state.length; i += 1) local[state[i]] = y[i];
        return derivatives.map((d) => d.evaluate(local));
      };

      /**
       * Zdarzenia sprawdzamy po każdym kroku.
       *
       * Warunek liczy się na stanie po kroku, a przypisania widzą ten sam stan
       * — dzięki temu „@then vy = -k · v_y" odbija tę prędkość, którą ciało
       * miało w chwili zetknięcia, a nie tę sprzed kroku.
       */
      const onStep = events.length
        ? (t: number, y: number[]) => {
          const local: Record<string, number> = { ...scope, t };
          for (let i = 0; i < state.length; i += 1) local[state[i]] = y[i];

          let next: number[] | undefined;
          for (const event of events) {
            if (!event.condition.test(local)) continue;
            if (event.stop) return 'stop' as const;
            next = next ?? [...y];
            for (const { name, compiled } of event.assign) {
              const index = state.indexOf(name);
              if (index >= 0) next[index] = compiled.evaluate(local);
            }
          }
          return next;
        }
        : undefined;

      const options = { dt, sampleEvery: 4, stateNames: state, onStep };

      if (method === 'rosenbrock') {
        const rtol = block.tolerance ?? 1e-6;
        return rosenbrock(f, y0, tSpan, {
          rtol,
          atol: rtol * 1e-3,
          dt,
          stateNames: state,
          onStep,
          // Ten sam limit co dla metody jawnej i z tego samego powodu: blok
          // w dokumencie ma odpowiedzieć szybko, choćby odpowiedzią „nie umiem".
          maxSteps: 200_000,
        });
      }

      if (method === 'dopri5') {
        const rtol = block.tolerance ?? 1e-6;

        /**
         * Zdarzenia dokumentu jako miejsca zerowe.
         *
         * Budowane tutaj, a nie przy kompilacji, bo funkcja zdarzenia musi
         * widzieć wartości parametrów — a te przychodzą dopiero z `run()`.
         */
        const eventSpecs: EventSpec[] = zdarzeniaDokładne
          ? events.map((event, i): EventSpec => {
            const comparison = comparisons[i]!;
            const scopeAt = (t: number, y: number[]) => {
              const at: Record<string, number> = { ...scope, t };
              for (let j = 0; j < state.length; j += 1) at[state[j]] = y[j];
              return at;
            };
            return {
              name: block.events![i].when,
              g: (t, y) => comparison.value(scopeAt(t, y)),
              direction: comparison.direction,
              stop: event.stop,
              apply: event.assign.length
                ? (t, y) => {
                  const at = scopeAt(t, y);
                  const next = [...y];
                  for (const { name, compiled } of event.assign) {
                    const index = state.indexOf(name);
                    if (index >= 0) next[index] = compiled.evaluate(at);
                  }
                  return next;
                }
                : undefined,
            };
          })
          : [];
        return dopri5(f, y0, tSpan, {
          rtol,
          // Tolerancja bezwzględna trzy rzędy niżej: to ona decyduje, co uznać
          // za zero, a wielkości fizyczne rzadko mają sensowną wartość progową
          // podaną osobno.
          atol: rtol * 1e-3,
          dt,
          stateNames: state,
          events: eventSpecs,
          // Hak po kroku zostaje wyłącznie dla warunków, których nie dało się
          // rozłożyć; przy zdarzeniach rozwiązywanych dokładnie byłby drugim,
          // gorszym mechanizmem meldującym to samo.
          onStep: zdarzeniaDokładne ? undefined : onStep,
          // Ograniczenie kroku też jest już tylko dla tego przypadku: adaptacja
          // rozciąga krok tam, gdzie rozwiązanie jest gładkie, a próg bywa
          // właśnie na gładkim odcinku.
          maxStep: (!zdarzeniaDokładne && events.length) ? (tSpan[1] - tSpan[0]) / 500 : undefined,
          // Niżej niż domyślny limit solvera: to jest blok w dokumencie, a nie
          // obliczenie w tle. Czytelnik ma dostać komunikat „układ jest sztywny"
          // po chwili, a nie po kilku sekundach zamrożonej strony — a żaden
          // model dydaktyczny nie potrzebuje dwustu tysięcy kroków.
          maxSteps: 200_000,
        });
      }

      if (method === 'verlet') {
        // Stan przestawiamy na kolejność, której wymaga Verlet: najpierw
        // wszystkie położenia, potem wszystkie prędkości.
        const positions = pairs.map(([position]) => position);
        const velocities = pairs.map(([, velocity]) => velocity);
        const indexOf = (name: string) => state.indexOf(name);

        const acceleration = (t: number, x: number[]) => {
          const local: Record<string, number> = { ...scope, t };
          positions.forEach((name, i) => { local[name] = x[i]; });
          // Prędkości bierzemy z ostatniego znanego stanu — dla sił zależnych
          // wyłącznie od położenia (a takich dotyczy Verlet) nie są używane.
          velocities.forEach((name) => { local[name] = local[name] ?? 0; });
          return velocities.map((name) => derivatives[indexOf(name)].evaluate(local));
        };

        const x0 = positions.map((name) => y0[indexOf(name)]);
        const v0 = velocities.map((name) => y0[indexOf(name)]);
        return verlet(acceleration, x0, v0, tSpan, {
          ...options,
          stateNames: [...positions, ...velocities],
        });
      }

      if (method === 'euler') return euler(f, y0, tSpan, options);
      return rk4(f, y0, tSpan, options);
    },
  };
}

/** Wartości domyślne parametrów — punkt startowy panelu suwaków. */
export function defaultValues(model: PhenomenonModel): Record<string, number> {
  return Object.fromEntries(model.parameters.map((p) => [p.name, p.value]));
}

/** Nadpisuje parametry wartościami z dokumentu („1 m", „15 deg"). */
export function applyOverrides(
  model: PhenomenonModel,
  overrides: Record<string, string | number>,
): { values: Record<string, number>; issues: string[] } {
  const values = defaultValues(model);
  const issues: string[] = [];

  for (const [rawName, raw] of Object.entries(overrides)) {
    const name = symbolName(rawName);
    const schema = model.parameters.find((p) => p.name === name);
    if (!schema) {
      issues.push(`Parametr „${name}" nie występuje w żadnym wzorze tego dokumentu.`);
      continue;
    }
    try {
      values[name] = toSI(raw, schema.unit === '1' ? undefined : schema.unit);
    } catch (error) {
      /*
       * Goła liczba znaczy wartość **w jednostce zadeklarowanej we wzorze**.
       *
       * Rygor `parseQuantity` jest w rdzeniu słuszny: „15" tam, gdzie ma być
       * kąt, znaczy co innego niż „15 deg". Ale tutaj autor zadeklarował
       * jednostkę wyżej, w `@vars`, i powtarzanie jej przy każdej wartości
       * jest przepisywaniem tego samego dwa razy. Zła jednostka nadal jest
       * błędem — cicha konwersja znaczyłaby zgodę na bezsens.
       */
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        values[name] = toSI(`${raw} ${schema.unit}`, schema.unit);
      } else {
        issues.push((error as Error).message);
      }
    }
  }

  return { values, issues };
}
