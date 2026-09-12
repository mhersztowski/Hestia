/**
 * sample.ts — zamiana funkcji na punkty do narysowania.
 *
 * Próbkowanie ze stałym krokiem jest albo za rzadkie w zakrętach, albo
 * marnotrawne na prostych odcinkach. Dzielimy więc rekurencyjnie: dopóki trzy
 * kolejne punkty nie leżą prawie na jednej prostej, wstawiamy między nie
 * następne.
 *
 * ## Trzy rzeczy, które psują wykres po cichu
 *
 *  • **Wartość nieokreślona.** `\sqrt{x}` dla ujemnych x nie ma wartości
 *    rzeczywistej i `compileExpression` zwraca tam `NaN`. Narysowanie zera
 *    dołożyłoby do wykresu poziomą półprostą, której w funkcji nie ma —
 *    krzywa musi się urwać.
 *  • **Asymptota.** `1/x` bez wykrycia nieciągłości zostaje połączone pionową
 *    kreską przez cały ekran: gałąź spod zera z gałęzią nad zerem. To pierwsza
 *    rzecz, którą widać na źle napisanym wykresie.
 *  • **Funkcja gęsto oscylująca.** `sin(1/x)` przy zerze nie stanie się gładka
 *    nigdy, więc podział bez twardego limitu zawiesza kartę.
 *
 * Wynikiem jest **lista odcinków**, nie jedna lista punktów. Odcinek to
 * kawałek krzywej rysowany jedną ścieżką; przerwa między odcinkami znaczy, że
 * krzywej tam nie ma.
 */

export interface Segment {
  points: Array<[number, number]>;
}

export interface SampleOptions {
  xMin: number;
  xMax: number;
  /**
   * Zakres y widoku.
   *
   * Potrzebny do dwóch rzeczy: rozpoznania, czy skok wartości jest
   * nieciągłością (a nie stromym, ale ciągłym wzrostem), i do przycięcia
   * wartości, które i tak są poza kadrem.
   */
  yMin: number;
  yMax: number;
  /** Ile odcinków wstępnych przed podziałem adaptacyjnym. */
  initialSamples?: number;
  /** Ile razy wolno podzielić odcinek. */
  maxDepth?: number;
  /** Twardy limit wywołań funkcji — ochrona przed funkcją gęsto oscylującą. */
  maxEvaluations?: number;
}

const DEFAULTS = {
  /*
   * Siatka wstępna jest **rzadka** celowo.
   *
   * Przy dwustu punktach na zakres wszystko jest już gładkie i podział
   * adaptacyjny nie ma czego poprawiać — prosta dostaje wtedy tyle samo
   * punktów co sinus, czyli płacimy pełną cenę bez zysku. Rzadka siatka plus
   * zagęszczanie w zakrętach daje ten sam obraz mniejszym kosztem, a przy
   * kilkunastu krzywotach naraz to już widać.
   */
  initialSamples: 64,
  maxDepth: 12,
  maxEvaluations: 12000,
};

/**
 * Ile wysokości widoku może przeskoczyć krzywa między sąsiednimi punktami,
 * zanim uznamy to za nieciągłość.
 *
 * Wartość dobrana z jednego kompromisu: przy zbyt małej dzielimy strome, ale
 * ciągłe wzrosty (`x^5` przy krawędzi kadru); przy zbyt dużej przepuszczamy
 * asymptotę i dostajemy kreskę przez ekran.
 */
const JUMP_FACTOR = 2;

/**
 * Kiedy odcinek jest tak stromy, że musi być nieciągłością.
 *
 * Sam próg wysokości nie wystarczy: skok schodka o połowę widoku jest mniejszy
 * niż strome, ale ciągłe zbocze `x^5` przy krawędzi kadru. Rozróżnia je
 * **stromizna**: po zagęszczeniu odcinek funkcji ciągłej robi się krótszy
 * także w pionie, a skok zostaje tak samo wysoki na coraz węższym kawałku osi.
 *
 * Warunek czytamy więc jako „prawie pionowy, a przy tym wysoki".
 */
const STEEP_DX = 0.004;
const STEEP_DY = 0.15;

/**
 * Do jakiej wielokrotności wysokości widoku przycinamy wartości.
 *
 * Punkt o wartości 10⁹ rozciąga ścieżkę tak, że przeglądarka rysuje ją
 * milisekundami, a widać z niej i tak tylko fragment przy krawędzi. Zostawiamy
 * zapas, żeby krzywa dochodziła do kadru, a nie urywała się w powietrzu.
 */
const CLAMP_FACTOR = 1000;

export function sampleFunction(f: (x: number) => number, options: SampleOptions): Segment[] {
  const xMin = Math.min(options.xMin, options.xMax);
  const xMax = Math.max(options.xMin, options.xMax);
  if (!(xMax > xMin)) return [];

  const initialSamples = options.initialSamples ?? DEFAULTS.initialSamples;
  const maxDepth = options.maxDepth ?? DEFAULTS.maxDepth;
  const maxEvaluations = options.maxEvaluations ?? DEFAULTS.maxEvaluations;

  const height = Math.abs(options.yMax - options.yMin) || 1;
  const maxJump = height * JUMP_FACTOR;
  const clamp = height * CLAMP_FACTOR;

  let evaluations = 0;
  const evaluate = (x: number): number => {
    if (evaluations >= maxEvaluations) return Number.NaN;
    evaluations += 1;
    const y = f(x);
    return Number.isFinite(y) ? y : Number.NaN;
  };

  /** Punkty wstępne — siatka, na której dopiero szukamy miejsc do zagęszczenia. */
  const step = (xMax - xMin) / initialSamples;
  const coarse: Array<[number, number]> = [];
  for (let i = 0; i <= initialSamples; i += 1) {
    const x = xMin + i * step;
    coarse.push([x, evaluate(x)]);
  }

  /**
   * Czy trzy punkty leżą na tyle blisko prostej, że podział niczego nie doda.
   *
   * Miarą jest odległość punktu środkowego od cięciwy — w jednostkach ekranu,
   * bo to o wygląd chodzi. Porównanie kątów dawałoby ten sam efekt, ale ze
   * zbędną trygonometrią w pętli wywoływanej dziesiątki tysięcy razy.
   */
  const gladkie = (a: [number, number], m: [number, number], b: [number, number]): boolean => {
    const przewidywane = a[1] + ((m[0] - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    return Math.abs(m[1] - przewidywane) < height * 0.002;
  };

  const out: Array<[number, number]> = [];

  /** Dokłada punkty między `a` i `b`, dopóki odcinek nie jest gładki. */
  const refine = (a: [number, number], b: [number, number], depth: number): void => {
    if (depth >= maxDepth || evaluations >= maxEvaluations) return;

    const mx = (a[0] + b[0]) / 2;
    const m: [number, number] = [mx, evaluate(mx)];

    // Jeden z końców nieokreślony: podział ma sens, bo szukamy krawędzi dziedziny.
    const nieokreslony = Number.isNaN(a[1]) || Number.isNaN(m[1]) || Number.isNaN(b[1]);
    if (!nieokreslony && gladkie(a, m, b)) return;

    refine(a, m, depth + 1);
    if (!Number.isNaN(m[1])) out.push(m);
    refine(m, b, depth + 1);
  };

  for (let i = 0; i < coarse.length; i += 1) {
    const point = coarse[i];
    if (!Number.isNaN(point[1])) out.push(point);
    if (i + 1 < coarse.length) refine(point, coarse[i + 1], 0);
  }

  out.sort((p, q) => p[0] - q[0]);

  /*
   * Podział na odcinki.
   *
   * Przerwa powstaje w dwóch przypadkach: gdy między punktami była wartość
   * nieokreślona (przerwa w dziedzinie) i gdy wartość przeskoczyła więcej niż
   * `maxJump` (asymptota albo skok). Drugi warunek jest heurystyką — musi być,
   * bo funkcja nie mówi o sobie, gdzie jest nieciągła.
   */
  const segments: Segment[] = [];
  let current: Array<[number, number]> = [];

  for (let i = 0; i < out.length; i += 1) {
    const [x, y] = out[i];
    const clamped: [number, number] = [x, Math.max(-clamp, Math.min(clamp, y))];

    if (current.length > 0) {
      const previous = current[current.length - 1];
      const dziura = x - previous[0] > step * 1.5;
      const dy = Math.abs(clamped[1] - previous[1]);
      const dx = x - previous[0];
      const stromy = dx < (xMax - xMin) * STEEP_DX && dy > height * STEEP_DY;
      const skok = dy > maxJump || stromy;

      if (dziura || skok) {
        if (current.length > 1) segments.push({ points: current });
        current = [];
      }
    }
    current.push(clamped);
  }
  if (current.length > 1) segments.push({ points: current });

  return segments;
}
