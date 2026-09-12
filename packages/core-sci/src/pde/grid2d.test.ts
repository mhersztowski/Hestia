/**
 * Pola na siatce 2D.
 *
 * Testy nie sprawdzają „czy się nie wywala", tylko czy wynik jest **prawdziwy**:
 * porównujemy z rozwiązaniami analitycznymi, które dla równania ciepła i fali
 * są znane. Symulacja, która wygląda ładnie i zanika w złym tempie, jest gorsza
 * niż brak symulacji — uczy nieprawdy.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { compilePde } from './grid2d';

/** Mod własny równania ciepła na kwadracie z zerowym brzegiem. */
const CIEPLO = [
  '@pde',
  '@field u',
  '@grid 40 x 40',
  '@domain x: 0..1 m, y: 0..1 m',
  '@d u = \\alpha \\cdot \\Delta u',
  '@init u = \\sin(\\pi x) \\cdot \\sin(\\pi y)',
  '@boundary dirichlet 0',
  '@vars u: K, alpha: m^2/s, x: m, y: m',
].join('\n');

/** Fala na tym samym kwadracie — drugi rząd w czasie. */
const FALA = [
  '@pde',
  '@field u',
  '@grid 40 x 40',
  '@domain x: 0..1 m, y: 0..1 m',
  '@d2 u = c^2 \\cdot \\Delta u',
  '@init u = \\sin(\\pi x) \\cdot \\sin(\\pi y)',
  '@boundary dirichlet 0',
  '@vars u: m, c: m/s, x: m, y: m',
].join('\n');

const model = (source: string) => compilePde(parseFormulaBlock('pole', source));

/** Wartość pola w środku siatki. */
function srodek(frame: { data: Float32Array }, nx: number, ny: number): number {
  return frame.data[Math.floor(ny / 2) * nx + Math.floor(nx / 2)];
}

describe('parsowanie bloku @pde', () => {
  it('czyta siatkę, dziedzinę i warunek brzegowy', () => {
    const pde = model(CIEPLO);
    expect(pde.nx).toBe(40);
    expect(pde.ny).toBe(40);
    expect(pde.field).toBe('u');
    expect(pde.parameters.map((p) => p.name)).toContain('alpha');
    expect(pde.issues).toEqual([]);
  });

  it('zgłasza siatkę, której nie da się policzyć', () => {
    const pde = compilePde(parseFormulaBlock('złe', [
      '@pde', '@field u', '@grid 4000 x 4000',
      '@domain x: 0..1 m, y: 0..1 m',
      '@d u = \\alpha \\cdot \\Delta u', '@init u = 0',
      '@vars u: K, alpha: m^2/s, x: m, y: m',
    ].join('\n')));

    // Szesnaście milionów punktów na krok to nie jest symulacja w dokumencie.
    expect(pde.issues.join(' ')).toMatch(/siatk/i);
  });
});

describe('równanie ciepła', () => {
  it('mod własny zanika w tempie exp(-2απ²t)', () => {
    // To jest cały sens testowania PDE analitycznie: sin(πx)sin(πy) jest funkcją
    // własną laplasjanu z wartością -2π², więc amplituda MUSI maleć wykładniczo
    // z dokładnie takim wykładnikiem. Zły schemat da zanik, ale nie ten.
    const pde = model(CIEPLO);
    const alpha = 0.01;
    const wynik = pde.run({ alpha }, [0, 2], 40);

    const t = wynik.frames[wynik.frames.length - 1].t;
    const amplituda = srodek(wynik.frames[wynik.frames.length - 1], pde.nx, pde.ny);
    const oczekiwana = Math.exp(-2 * Math.PI ** 2 * alpha * t);

    expect(amplituda).toBeCloseTo(oczekiwana, 2);
  });

  it('szybsze przewodzenie znaczy szybszy zanik', () => {
    const pde = model(CIEPLO);
    const wolno = pde.run({ alpha: 0.005 }, [0, 2], 10);
    const szybko = pde.run({ alpha: 0.02 }, [0, 2], 10);

    const ostatni = (w: ReturnType<typeof pde.run>) =>
      srodek(w.frames[w.frames.length - 1], pde.nx, pde.ny);

    expect(ostatni(szybko)).toBeLessThan(ostatni(wolno));
  });

  it('zerowy brzeg zostaje zerowy', () => {
    const pde = model(CIEPLO);
    const wynik = pde.run({ alpha: 0.02 }, [0, 1], 5);
    const { data } = wynik.frames[wynik.frames.length - 1];

    for (let i = 0; i < pde.nx; i += 1) {
      expect(Math.abs(data[i])).toBeLessThan(1e-9);
      expect(Math.abs(data[(pde.ny - 1) * pde.nx + i])).toBeLessThan(1e-9);
    }
  });

  it('brzeg izolowany zachowuje ciepło', () => {
    // Warunek Neumanna znaczy „nic nie ucieka" — suma po siatce musi zostać
    // stała. To jest sprawdzian schematu mocniejszy niż oglądanie obrazka.
    const pde = compilePde(parseFormulaBlock('izolacja', [
      '@pde', '@field u', '@grid 32 x 32',
      '@domain x: 0..1 m, y: 0..1 m',
      '@d u = \\alpha \\cdot \\Delta u',
      '@init u = \\exp(-30 \\cdot ((x - 0.5)^2 + (y - 0.5)^2))',
      '@boundary neumann',
      '@vars u: K, alpha: m^2/s, x: m, y: m',
    ].join('\n')));

    const wynik = pde.run({ alpha: 0.02 }, [0, 2], 10);

    // Całka, nie suma: węzeł brzegowy reprezentuje **pół** komórki, a narożny
    // ćwierć. Zwykła suma po węzłach rośnie, gdy ciepło dopływa do brzegu —
    // i to nie jest wada schematu, tylko zła miara.
    const calka = ({ data }: { data: Float32Array }) => {
      let suma = 0;
      for (let j = 0; j < pde.ny; j += 1) {
        for (let i = 0; i < pde.nx; i += 1) {
          const waga = (i === 0 || i === pde.nx - 1 ? 0.5 : 1)
            * (j === 0 || j === pde.ny - 1 ? 0.5 : 1);
          suma += waga * data[j * pde.nx + i];
        }
      }
      return suma;
    };

    const poczatek = calka(wynik.frames[0]);
    const koniec = calka(wynik.frames[wynik.frames.length - 1]);
    expect(koniec / poczatek).toBeCloseTo(1, 3);
  });
});

describe('równanie falowe', () => {
  it('mod własny drga z częstością c·π·√2', () => {
    // Fala stojąca sin(πx)sin(πy) ma częstość ω = c·π√2. Po połowie okresu
    // amplituda jest równa co do wartości, ale przeciwnego znaku.
    const pde = model(FALA);
    const c = 0.5;
    const omega = c * Math.PI * Math.SQRT2;
    const polOkresu = Math.PI / omega;

    const wynik = pde.run({ c }, [0, polOkresu], 2);
    const amplituda = srodek(wynik.frames[wynik.frames.length - 1], pde.nx, pde.ny);

    expect(amplituda).toBeCloseTo(-1, 1);
  });

  it('nie rozjeżdża się przez wiele okresów', () => {
    // Fala nie ma tłumienia, więc amplituda po dziesięciu okresach ma być
    // wciąż rzędu jedności. Niestabilny schemat urośnie do nieskończoności.
    const pde = model(FALA);
    const c = 0.5;
    const okres = 2 * Math.PI / (c * Math.PI * Math.SQRT2);

    const wynik = pde.run({ c }, [0, 10 * okres], 5);
    const amplituda = Math.abs(srodek(wynik.frames[wynik.frames.length - 1], pde.nx, pde.ny));

    expect(amplituda).toBeGreaterThan(0.5);
    expect(amplituda).toBeLessThan(1.5);
  });
});

describe('klatki', () => {
  it('liczba klatek jest ograniczona niezależnie od liczby kroków', () => {
    // Siatka 40×40 przy kroku stabilności to dziesiątki tysięcy kroków. Zapis
    // każdego z nich to setki megabajtów — klatki są próbką, nie zapisem.
    const pde = model(CIEPLO);
    const wynik = pde.run({ alpha: 0.02 }, [0, 2], 25);

    expect(wynik.frames).toHaveLength(25);
    expect(wynik.frames[0].t).toBe(0);
    expect(wynik.frames[24].t).toBeCloseTo(2, 6);
  });

  it('podaje zakres wartości do wyskalowania kolorów', () => {
    const wynik = model(CIEPLO).run({ alpha: 0.01 }, [0, 1], 10);
    expect(wynik.max).toBeGreaterThan(wynik.min);
    expect(wynik.max).toBeLessThanOrEqual(1.001);
  });
});

describe('szybka ścieżka dla równań liniowych', () => {
  /**
   * Równanie ciepła i falowe są liniowe w laplasjanie i w samym polu, więc
   * zamiast wołać skompilowane wyrażenie w każdym punkcie każdego kroku
   * (dziesiątki milionów razy) wystarczy raz wyznaczyć współczynniki.
   *
   * Optymalizacja ma prawo istnieć tylko wtedy, gdy **nie zmienia wyniku** i
   * gdy sama się wyłącza dla równań, dla których nie jest prawdziwa.
   */
  const NIELINIOWE = [
    '@pde', '@field u', '@grid 24 x 24',
    '@domain x: 0..1 m, y: 0..1 m',
    // Reakcja-dyfuzja: człon `u(1-u)` łamie liniowość w polu.
    '@d u = \\alpha \\cdot \\Delta u + u \\cdot (1 - u)',
    '@init u = 0.3 \\cdot \\exp(-30 \\cdot ((x - 0.5)^2 + (y - 0.5)^2))',
    '@boundary neumann',
    '@vars u: 1, alpha: m^2/s, x: m, y: m',
  ].join('\n');

  it('nieliniowe równanie liczy się poprawnie mimo optymalizacji', () => {
    // Sprawdzian jednoznaczny: sama dyfuzja z brzegiem izolowanym **zachowuje**
    // całkę, a człon reakcji ją zwiększa. Gdyby optymalizacja zgubiła `u(1-u)`,
    // całka zostałaby stała — i to widać wprost, bez zgadywania o kształcie.
    const pde = compilePde(parseFormulaBlock('rd', NIELINIOWE));
    expect(pde.issues).toEqual([]);

    const wynik = pde.run({ alpha: 0.005 }, [0, 4], 5);
    const suma = (f: { data: Float32Array }) => f.data.reduce((a, b) => a + b, 0);

    expect(suma(wynik.frames[4]) / suma(wynik.frames[0])).toBeGreaterThan(1.5);
    // Logistyczna reakcja nasyca się przy jedynce — powyżej znaczy rozjazd.
    expect(wynik.max).toBeLessThan(1.05);
  });

  it('liniowe równanie daje ten sam wynik co odniesienie analityczne', () => {
    // Ten sam sprawdzian co wcześniej, ale po włączeniu szybkiej ścieżki —
    // pilnuje, żeby optymalizacja nie przesunęła wyniku.
    const pde = model(CIEPLO);
    const alpha = 0.01;
    const wynik = pde.run({ alpha }, [0, 2], 20);
    const ostatnia = wynik.frames[wynik.frames.length - 1];

    expect(srodek(ostatnia, pde.nx, pde.ny))
      .toBeCloseTo(Math.exp(-2 * Math.PI ** 2 * alpha * ostatnia.t), 2);
  });
});

describe('warunek początkowy narysowany piórem', () => {
  const RYSUNEK = [
    '@pde', '@field u', '@grid 48 x 48',
    '@domain x: 0..1 m, y: 0..1 m',
    '@d u = \\alpha \\cdot \\Delta u',
    '@init u = 0',
    '@strokes 0.25,0.5,0.08,1 0.75,0.5,0.08,-1',
    '@boundary neumann',
    '@vars u: K, alpha: m^2/s, x: m, y: m',
  ].join('\n');

  it('rysunek ma pierwszeństwo przed wzorem', () => {
    // `@init u = 0` dałoby pole puste. Jeśli po rysunku pole nadal jest puste,
    // znaczy że pociągnięcia nie doszły do solvera.
    const pde = compilePde(parseFormulaBlock('rysunek', RYSUNEK));
    expect(pde.issues).toEqual([]);

    const wynik = pde.run({ alpha: 0.01 }, [0, 0.1], 2);
    expect(wynik.max).toBeGreaterThan(0.5);
    expect(wynik.min).toBeLessThan(-0.5);
  });

  it('pociągnięcia trafiają tam, gdzie je postawiono', () => {
    const pde = compilePde(parseFormulaBlock('rysunek', RYSUNEK));
    const { data } = pde.run({ alpha: 0.01 }, [0, 0], 1).frames[0];

    const wartosc = (x: number, y: number) =>
      data[Math.round(y * (pde.ny - 1)) * pde.nx + Math.round(x * (pde.nx - 1))];

    expect(wartosc(0.25, 0.5)).toBeCloseTo(1, 1);
    expect(wartosc(0.75, 0.5)).toBeCloseTo(-1, 1);
    expect(Math.abs(wartosc(0.5, 0.1))).toBeLessThan(0.1);
  });

  it('pusty rysunek nie udaje, że pole ma warunek', () => {
    // Wyczyszczenie płótna zapisuje pustą dyrektywę; wtedy pole jest puste i
    // to jest poprawny stan, a nie błąd wymagający komunikatu.
    const pde = compilePde(parseFormulaBlock('puste', RYSUNEK.replace(/@strokes .*/, '@strokes')));
    expect(pde.issues).toEqual([]);
    expect(pde.run({ alpha: 0.01 }, [0, 0.1], 2).max).toBe(0);
  });
});
