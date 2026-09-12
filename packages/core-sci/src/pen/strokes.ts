/**
 * strokes.ts — warunek początkowy rysowany piórem.
 *
 * Raport (Etap 4) wymienia rysik jako sposób zadawania warunków początkowych.
 * Cała rzecz sprowadza się do jednej decyzji: **pióro nie zostawia bitmapy**.
 * Zostawia listę pociągnięć, a ta kompiluje się do zwykłego wyrażenia od `x` i
 * `y` — takiego samego, jakie autor napisałby ręcznie.
 *
 * Trzy rzeczy z tego wynikają i żadnej nie dałoby się mieć przy bitmapie:
 *
 *  • Dokument dalej trzyma **matematykę**, a nie dane obrazu. Zapis mieści się
 *    w jednej linii i da się go poprawić w edytorze tekstu.
 *  • Rysunek nie ma rozdzielczości. Ta sama lista pociągnięć działa na siatce
 *    32×32 i 128×128, bo dopiero solver ją próbkuje.
 *  • Rysowanie i pisanie wzoru to ta sama ścieżka. Autor może narysować
 *    plamkę, a potem zobaczyć wzór, który z niej powstał — i odwrotnie.
 *
 * Kształt pojedynczego pociągnięcia to gaussian: gładki, bez krawędzi, i jest
 * rozwiązaniem równania dyfuzji dla punktowego źródła — więc plamka narysowana
 * piórem zachowuje się od pierwszej klatki tak, jak powinna.
 */

export interface Stroke {
  /** Środek w jednostkach dziedziny (nie w pikselach). */
  x: number;
  y: number;
  /** Zasięg — odległość, na której wartość spada do ~1/e. */
  radius: number;
  /** Wysokość; ujemna rysuje dołek (pióro odwrócone). */
  amplitude: number;
}

/**
 * Ile pociągnięć trafia do wyrażenia.
 *
 * Każde jest liczone w każdym punkcie siatki w każdym kroku czasowym. Przy
 * 96×96 i tysiącu kroków setka pociągnięć to już miliard operacji tylko na
 * warunek początkowy — a rysunek z takiej liczby plamek i tak wygląda jak
 * plama. Przycinamy do najmocniejszych zamiast pozwolić symulacji stanąć.
 */
const MAX_POCIAGNIEC = 100;

/** Zaokrąglenie zapisu — poniżej tysięcznych rysunek i tak nie różni się na oko. */
function krotko(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** Zapis do jednej linii dyrektywy `@strokes`. */
export function serializeStrokes(strokes: Stroke[]): string {
  return strokes
    .map((s) => [s.x, s.y, s.radius, s.amplitude].map(krotko).join(','))
    .join(' ');
}

/**
 * Odczyt z dyrektywy.
 *
 * Niepełne albo nieliczbowe pociągnięcie jest pomijane, a nie uzupełniane
 * domyślnymi wartościami: ręczna edycja pliku jest normalna, a zgadywanie
 * brakującej liczby przesunęłoby rysunek w miejsce, którego autor nie wybrał.
 */
export function parseStrokes(text: string): Stroke[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((czesc) => czesc.split(',').map(Number))
    .filter((liczby) => liczby.length === 4 && liczby.every(Number.isFinite))
    .map(([x, y, radius, amplitude]) => ({ x, y, radius, amplitude }));
}

/**
 * Buduje wyrażenie LaTeX będące sumą pociągnięć.
 *
 * Wynik trafia tam, gdzie zwykły `@init`, więc solver nie musi wiedzieć, że
 * cokolwiek narysowano.
 */
export function compileStrokes(strokes: Stroke[]): string {
  if (!strokes.length) return '0';

  const wybrane = strokes.length <= MAX_POCIAGNIEC
    ? strokes
    // Zostawiamy najmocniejsze, bo to one niosą kształt rysunku; słabe
    // pociągnięcia (lekki dotyk) i tak giną w sumie.
    : [...strokes]
      .sort((a, b) => Math.abs(b.amplitude) - Math.abs(a.amplitude))
      .slice(0, MAX_POCIAGNIEC);

  return wybrane
    .map((s) => {
      const szerokosc = Math.max(s.radius, 1e-4) ** 2;
      return `${krotko(s.amplitude)} \\cdot \\exp(-((x - ${krotko(s.x)})^2 `
        + `+ (y - ${krotko(s.y)})^2) / ${krotko(szerokosc)})`;
    })
    .join(' + ');
}
