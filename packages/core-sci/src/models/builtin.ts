/**
 * builtin.ts — zjawiska wbudowane w bibliotekę.
 *
 * Każde z nich dałoby się zapisać w dokumencie blokami `formula` — i tam, gdzie
 * dokument o nich uczy, **powinno** tak być, bo wtedy czytelnik widzi równania.
 * Tutaj są dlatego, że ta sama fizyka bywa potrzebna jako **tło**: zadanie
 * o rezonansie nie musi po raz kolejny wyprowadzać oscylatora, a dokument
 * o orbitach nie chce zaczynać od sześćdziesięciu równań ruchu.
 *
 * Wszystkie korzystają z `defineModel`, więc mają dokładnie ten sam kontrakt co
 * modele kompilowane z grafu wzorów.
 */
import { defineModel } from '../model/defineModel';
import { registerModel } from './registry';
import { dopri5 } from '../numeric/dopri5';
import { verlet } from '../numeric/solvers';
import type { State } from './../numeric/trajectory';

/** Odczyt opcji z rozsądnym domyślnym — opcje przychodzą z JSON-a w dokumencie. */
function flag(options: Record<string, unknown>, name: string, fallback = false): boolean {
  const value = options[name];
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Oscylator harmoniczny: tłumiony i wymuszony w jednym.
 *
 * Jeden model, a nie trzy, bo tłumienie i wymuszenie to **wartości parametrów**,
 * nie osobne zjawiska: przy c = 0 i F₀ = 0 zostaje ruch swobodny, i to właśnie
 * czytelnik ma zobaczyć, przesuwając suwak zamiast przełączając dokument.
 */
registerModel({
  name: 'oscylator',
  summary: 'Masa na sprężynie: ruch swobodny, tłumiony i wymuszony — zależnie od nastaw.',
  build: () => defineModel({
    parameters: [
      { name: 'm', unit: 'kg', value: 1, min: 0.1, max: 5 },
      { name: 'k', unit: 'N/m', value: 4, min: 0.1, max: 40 },
      { name: 'c', unit: 'kg/s', value: 0, min: 0, max: 2 },
      { name: 'F_0', unit: 'N', value: 0, min: 0, max: 5 },
      { name: 'Omega', unit: 's^-1', value: 2, min: 0, max: 10 },
      { name: 'x_0', unit: 'm', value: 0.1, min: -1, max: 1 },
      { name: 'v_0', unit: 'm/s', value: 0, min: -5, max: 5 },
    ],
    observables: [
      { name: 'x', unit: 'm' },
      { name: 'v', unit: 'm/s' },
      { name: 'E', unit: 'J' },
    ],
    derivativePairs: [['x', 'v']],
    // Energia mechaniczna jest zachowana **tylko** przy c = 0 i F₀ = 0; przy
    // pozostałych nastawach panel jakości pokaże jej ubytek albo przyrost.
    // To nie jest ostrzeżenie o błędzie numerycznym, tylko fizyka układu —
    // i dobrze, żeby czytelnik zobaczył jedno obok drugiego.
    invariants: [{
      name: 'E',
      of: ([x, v], _t, { m, k }) => 0.5 * m * v * v + 0.5 * k * x * x,
    }],
    run: ({ m, k, c, F_0, Omega, x_0, v_0 }, tSpan, dt) => {
      const trajektoria = dopri5(
        (t, [x, v]) => [v, (F_0 * Math.cos(Omega * t) - c * v - k * x) / m],
        [x_0, v_0], tSpan,
        { rtol: 1e-9, atol: 1e-12, dt, stateNames: ['x', 'v'] },
      );

      return {
        trajectory: trajektoria,
        series: {
          E: trajektoria.samples.map((s): [number, number] => [
            s.t, 0.5 * m * s.y[1] * s.y[1] + 0.5 * k * s.y[0] * s.y[0],
          ]),
        },
      };
    },
  }),
});

/**
 * Wahadło matematyczne — domyślnie **bez** przybliżenia małych kątów.
 *
 * Przybliżenie `sin θ ≈ θ` jest w podręczniku wszędzie i właśnie dlatego warto,
 * żeby domyślnie go tu nie było: różnica okresu przy dużym wychyleniu jest
 * treścią lekcji, a nie usterką. Wariant przybliżony włącza się opcją
 * `smallAngle`, żeby dało się pokazać oba obok siebie.
 */
registerModel({
  name: 'wahadlo',
  summary: 'Wahadło matematyczne z pełnym równaniem ruchu; opcja „smallAngle" włącza przybliżenie sin θ ≈ θ.',
  options: ['smallAngle'],
  build: (options) => {
    const małeKąty = flag(options, 'smallAngle');
    return defineModel({
      parameters: [
        { name: 'L', unit: 'm', value: 1, min: 0.1, max: 5 },
        { name: 'g', unit: 'm/s^2', value: 9.81, min: 1, max: 25 },
        { name: 'theta_0', unit: 'rad', value: 0.3, min: -3, max: 3 },
      ],
      observables: [
        { name: 'theta', unit: 'rad' },
        { name: 'omega', unit: 'rad/s' },
        { name: 'x', unit: 'm' },
        { name: 'y', unit: 'm' },
      ],
      derivativePairs: [['theta', 'omega']],
      run: ({ L, g, theta_0 }, tSpan, dt) => {
        const trajektoria = dopri5(
          (_t, [theta, omega]) => [omega, -(g / L) * (małeKąty ? theta : Math.sin(theta))],
          [theta_0, 0], tSpan,
          { rtol: 1e-9, atol: 1e-12, dt, stateNames: ['theta', 'omega'] },
        );

        // Położenie ciężarka liczymy z kąta: widok animacji potrzebuje punktu
        // na płaszczyźnie, a nie kąta, i nie ma powodu, żeby każdy widok
        // wyprowadzał to sobie sam.
        const series = {
          x: trajektoria.samples.map((s): [number, number] => [s.t, L * Math.sin(s.y[0])]),
          y: trajektoria.samples.map((s): [number, number] => [s.t, -L * Math.cos(s.y[0])]),
        };
        return { trajectory: trajektoria, series };
      },
    });
  },
});

/**
 * Układ N ciał oddziałujących grawitacyjnie.
 *
 * To jest zjawisko, dla którego rejestr powstał: liczba równań wynika z liczby
 * ciał, więc w dokumencie nie da się ich wypisać. Ciała podaje się w opcjach
 * bloku, bo ich liczba zmienia **kształt** modelu, a nie tylko wartości.
 *
 * Solver to Verlet, nie metoda wyższego rzędu: przy tysiącach obiegów liczy się
 * to, żeby orbity nie zwężały się przez dryf energii — a nie to, żeby pojedynczy
 * krok był najdokładniejszy. Uzasadnienie w `numeric/solvers.ts` i zmierzone
 * w `dokumenty/orbita.md`.
 */
interface Cialo {
  name?: string;
  mass: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function readBodies(options: Record<string, unknown>): Cialo[] {
  const raw = options.bodies;
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error('Podaj co najmniej dwa ciała w „bodies": [{ mass, x, y, vx, vy }, …].');
  }

  return raw.map((item, index) => {
    const body = item as Partial<Cialo>;
    if (typeof body.mass !== 'number' || !(body.mass > 0)) {
      throw new Error(`Ciało nr ${index + 1} nie ma dodatniej masy.`);
    }
    return {
      name: body.name ?? `ciało ${index + 1}`,
      mass: body.mass,
      x: body.x ?? 0,
      y: body.y ?? 0,
      vx: body.vx ?? 0,
      vy: body.vy ?? 0,
    };
  });
}

/**
 * Energia całkowita układu — kinetyczna plus potencjalna po parach.
 *
 * Wydzielona z `run`, bo potrzebują jej dwie rzeczy naraz: przebieg do wykresu
 * i pomiar niezmiennika. Liczona z pełnego wektora stanu Verleta, w którym
 * najpierw stoją wszystkie położenia, a potem wszystkie prędkości.
 */
function energiaUkladu(state: State, masy: number[], G: number, softening: number): number {
  const n = masy.length;
  let E = 0;
  for (let i = 0; i < n; i += 1) {
    const vx = state[2 * n + 2 * i];
    const vy = state[2 * n + 2 * i + 1];
    E += 0.5 * masy[i] * (vx * vx + vy * vy);
    for (let j = i + 1; j < n; j += 1) {
      const dx = state[2 * j] - state[2 * i];
      const dy = state[2 * j + 1] - state[2 * i + 1];
      const r = Math.sqrt(dx * dx + dy * dy + softening * softening);
      if (r > 0) E -= (G * masy[i] * masy[j]) / r;
    }
  }
  return E;
}

registerModel({
  name: 'nbody',
  summary: 'N ciał oddziałujących grawitacyjnie; ciała podaje się w opcji „bodies".',
  options: ['bodies'],
  build: (options) => {
    const ciała = readBodies(options);
    const n = ciała.length;

    return defineModel({
      parameters: [
        // Stała grawitacji jako parametr, bo dokumenty liczą i w jednostkach SI,
        // i w umownych (G = 1), gdzie zjawisko widać bez dziesięciu zer.
        { name: 'G', unit: 'm^3/(kg s^2)', value: 6.6743e-11, min: 0, max: 1 },
        { name: 'softening', unit: 'm', value: 0, min: 0, max: 1e9 },
      ],
      observables: [
        // Położenia i prędkości: jedne do animacji, drugie do przestrzeni
        // fazowej — i dopiero komplet pozwala zadeklarować pary pochodnych,
        // z których widok sam rozpozna, co jest czyją prędkością.
        ...ciała.flatMap((_ciało, i) => [
          { name: `x${i}`, unit: 'm' },
          { name: `y${i}`, unit: 'm' },
        ]),
        ...ciała.flatMap((_ciało, i) => [
          { name: `vx${i}`, unit: 'm/s' },
          { name: `vy${i}`, unit: 'm/s' },
        ]),
        { name: 'E', unit: 'J', kind: 'series' as const },
      ],
      derivativePairs: ciała.flatMap((_, i) => [
        [`x${i}`, `vx${i}`], [`y${i}`, `vy${i}`],
      ] as Array<[string, string]>),
      // Energia całkowita układu izolowanego jest zachowana — a że liczymy
      // Verletem, jej błąd ma **oscylować**, nie narastać. To jest jedyny
      // sposób, żeby czytelnik odróżnił orbitę stabilną od powoli zwężanej
      // przez numerykę, bo na wykresie wyglądają tak samo.
      invariants: [{
        name: 'E',
        of: (state, _t, { G, softening }) => energiaUkladu(state, ciała.map((c) => c.mass), G, softening),
      }],
      run: ({ G, softening }, tSpan, dt) => {
        const masy = ciała.map((c) => c.mass);
        const x0 = ciała.flatMap((c) => [c.x, c.y]);
        const v0 = ciała.flatMap((c) => [c.vx, c.vy]);

        /** Przyspieszenia od par ciał — para liczona raz, dwa razy użyta. */
        const acceleration = (_t: number, pos: State): State => {
          const a = new Array<number>(2 * n).fill(0);
          for (let i = 0; i < n; i += 1) {
            for (let j = i + 1; j < n; j += 1) {
              const dx = pos[2 * j] - pos[2 * i];
              const dy = pos[2 * j + 1] - pos[2 * i + 1];
              const r2 = dx * dx + dy * dy + softening * softening;
              const r = Math.sqrt(r2);
              // Zmiękczenie chroni przed nieskończonością przy zderzeniu ciał
              // punktowych; przy softening = 0 zachowuje się jak czyste 1/r².
              const inv = r > 0 ? 1 / (r2 * r) : 0;
              a[2 * i] += G * masy[j] * dx * inv;
              a[2 * i + 1] += G * masy[j] * dy * inv;
              a[2 * j] -= G * masy[i] * dx * inv;
              a[2 * j + 1] -= G * masy[i] * dy * inv;
            }
          }
          return a;
        };

        const trajektoria = verlet(acceleration, x0, v0, tSpan, {
          dt,
          stateNames: [
            ...ciała.flatMap((_, i) => [`x${i}`, `y${i}`]),
            ...ciała.flatMap((_, i) => [`vx${i}`, `vy${i}`]),
          ],
        });

        return {
          trajectory: trajektoria,
          series: {
            E: trajektoria.samples.map((s): [number, number] => [
              s.t, energiaUkladu(s.y, masy, G, softening),
            ]),
          },
        };
      },
    });
  },
});
