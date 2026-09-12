/**
 * implicit.ts — krzywe uwikłane i nierówności.
 *
 * `y = f(x)` da się przebiec po osi; `x² + y² = 4` nie — to warunek na całej
 * płaszczyźnie, a nie przepis na wartość. Metoda jest więc inna: dzielimy okno
 * na komórki, liczymy `f` w rogach i szukamy tych komórek, w których funkcja
 * zmienia znak. Przez taką komórkę przechodzi krzywa, a miejsce przejścia
 * wyznaczamy z proporcji wartości w rogach.
 *
 * ## Dwie rzeczy, które trzeba zrobić dobrze
 *
 * **Zagęszczanie tylko przy krawędzi.** Siatka o rozdzielczości wystarczającej
 * do gładkiego okręgu liczona na całym oknie to setki tysięcy wywołań, z czego
 * 99% w miejscach, gdzie nic się nie dzieje. Zaczynamy więc rzadko i dzielimy
 * wyłącznie komórki, przez które krzywa przechodzi.
 *
 * **Odrzucenie nieciągłości.** `1/x − y` zmienia znak przy x = 0, bo skacze
 * z minus nieskończoności do plus — a nie dlatego, że przecina zero. Bez
 * sprawdzenia dostalibyśmy pionową prostą przez cały ekran, której w równaniu
 * nie ma. To ta sama pułapka, co asymptota przy `y = f(x)`, tylko trudniejsza
 * do zauważenia, bo nie widać jej w zapisie.
 */

export interface ImplicitWindow {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface ImplicitOptions {
  /** Ile komórek na krótszym boku przed zagęszczaniem. */
  resolution?: number;
  /** Ile razy wolno podzielić komórkę przy krawędzi. */
  maxDepth?: number;
  /** Twardy limit wywołań funkcji. */
  maxEvaluations?: number;
  /**
   * Wypełnienie obszaru dla nierówności.
   *
   * `negative` to `f < 0`, `positive` to `f > 0`. Brak = sam kontur.
   */
  fill?: 'negative' | 'positive';
}

export interface FillCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImplicitResult {
  /** Odcinki konturu — pary punktów, każda rysowana osobno. */
  segments: Array<[[number, number], [number, number]]>;
  /** Kawałki obszaru spełniającego nierówność. */
  fills: FillCell[];
}

const DEFAULTS = {
  resolution: 48,
  maxDepth: 4,
  maxEvaluations: 50000,
};

/**
 * Ile razy wartość może przeskoczyć między rogami komórki, zanim uznamy zmianę
 * znaku za nieciągłość, a nie za przecięcie zera.
 *
 * Miarą jest stosunek do typowej wartości w okolicy: przy przejściu przez zero
 * wartości w rogach są **małe** i porównywalne, przy asymptocie jedna z nich
 * jest ogromna. Próg dobrany tak, żeby przepuścić strome, ale ciągłe krzywe.
 */
const DISCONTINUITY_RATIO = 100;

export function marchImplicit(
  f: (x: number, y: number) => number,
  window: ImplicitWindow,
  options: ImplicitOptions = {},
): ImplicitResult {
  const xMin = Math.min(window.xMin, window.xMax);
  const xMax = Math.max(window.xMin, window.xMax);
  const yMin = Math.min(window.yMin, window.yMax);
  const yMax = Math.max(window.yMin, window.yMax);
  if (!(xMax > xMin) || !(yMax > yMin)) return { segments: [], fills: [] };

  const resolution = options.resolution ?? DEFAULTS.resolution;
  const maxDepth = options.maxDepth ?? DEFAULTS.maxDepth;
  const maxEvaluations = options.maxEvaluations ?? DEFAULTS.maxEvaluations;

  let evaluations = 0;
  const evaluate = (x: number, y: number): number => {
    if (evaluations >= maxEvaluations) return Number.NaN;
    evaluations += 1;
    const v = f(x, y);
    return Number.isFinite(v) ? v : Number.NaN;
  };

  const segments: ImplicitResult['segments'] = [];
  const fills: FillCell[] = [];

  /** Punkt przecięcia krawędzi z zerem — z proporcji wartości w końcach. */
  const crossing = (
    ax: number, ay: number, av: number,
    bx: number, by: number, bv: number,
  ): [number, number] => {
    const t = av / (av - bv);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  };

  /**
   * Czy zmiana znaku w komórce jest przejściem przez zero, czy skokiem.
   *
   * Przy przecięciu zera wartości w rogach są małe względem siebie; przy
   * asymptocie jedna wystrzeliwuje. Porównujemy więc rozpiętość wartości
   * z ich najmniejszym modułem.
   */
  const ciagla = (values: number[]): boolean => {
    const skonczone = values.filter((v) => Number.isFinite(v));
    if (skonczone.length < values.length) return false;

    const najmniejszy = Math.min(...skonczone.map(Math.abs));
    const rozpietosc = Math.max(...skonczone) - Math.min(...skonczone);
    // Gdy najmniejsza wartość jest bliska zeru, rozpiętość i tak musi być
    // skończona i niewielka względem samych wartości.
    const skala = Math.max(najmniejszy, 1e-12);
    return rozpietosc / skala < DISCONTINUITY_RATIO || rozpietosc < 1;
  };

  /**
   * Przetwarza komórkę: rysuje kontur albo dzieli ją na cztery.
   *
   * Podział tylko przy krawędzi — komórka o jednolitym znaku nie kryje krzywej
   * i nie ma powodu jej oglądać dokładniej.
   */
  const cell = (
    x0: number, y0: number, x1: number, y1: number,
    v00: number, v10: number, v01: number, v11: number,
    depth: number,
  ): void => {
    const values = [v00, v10, v01, v11];
    const nieokreslone = values.some((v) => Number.isNaN(v));

    if (nieokreslone) {
      // Komórka bez wartości w którymś rogu nie mówi nic pewnego — ani
      // o krzywej, ani o obszarze nierówności.
      return;
    }

    const dodatnie = values.filter((v) => v > 0).length;
    const jednolita = dodatnie === 0 || dodatnie === 4;

    if (jednolita) {
      if (options.fill) {
        const spelnia = options.fill === 'negative' ? dodatnie === 0 : dodatnie === 4;
        if (spelnia) fills.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      }
      return;
    }

    if (depth < maxDepth && evaluations < maxEvaluations) {
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const vm0 = evaluate(mx, y0);
      const vm1 = evaluate(mx, y1);
      const v0m = evaluate(x0, my);
      const v1m = evaluate(x1, my);
      const vmm = evaluate(mx, my);

      cell(x0, y0, mx, my, v00, vm0, v0m, vmm, depth + 1);
      cell(mx, y0, x1, my, vm0, v10, vmm, v1m, depth + 1);
      cell(x0, my, mx, y1, v0m, vmm, v01, vm1, depth + 1);
      cell(mx, my, x1, y1, vmm, v1m, vm1, v11, depth + 1);
      return;
    }

    // Najgłębszy poziom: rysujemy odcinek przez komórkę.
    if (!ciagla(values)) return;

    /*
     * Marching squares w wersji krawędziowej: zbieramy przecięcia na czterech
     * bokach i łączymy je parami. Przy dwóch przecięciach jest to jeden
     * odcinek; przy czterech (komórka siodłowa) łączymy sąsiadujące, co daje
     * dwa odcinki zamiast krzyża.
     */
    const cross: Array<[number, number]> = [];
    if ((v00 > 0) !== (v10 > 0)) cross.push(crossing(x0, y0, v00, x1, y0, v10));
    if ((v10 > 0) !== (v11 > 0)) cross.push(crossing(x1, y0, v10, x1, y1, v11));
    if ((v01 > 0) !== (v11 > 0)) cross.push(crossing(x0, y1, v01, x1, y1, v11));
    if ((v00 > 0) !== (v01 > 0)) cross.push(crossing(x0, y0, v00, x0, y1, v01));

    for (let i = 0; i + 1 < cross.length; i += 2) {
      segments.push([cross[i], cross[i + 1]]);
    }

    // Komórka na krawędzi też należy do obszaru — w połowie. Bez tego wnętrze
    // koła kończyłoby się widoczną szczerbą tuż przy konturze.
    if (options.fill) {
      const spelnia = options.fill === 'negative' ? dodatnie <= 2 : dodatnie >= 2;
      if (spelnia) fills.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    }
  };

  // Siatka wstępna — proporcjonalna do kształtu okna, żeby komórki były zbliżone
  // do kwadratów niezależnie od tego, jak rozciągnięty jest widok.
  const width = xMax - xMin;
  const height = yMax - yMin;
  const nx = width >= height ? Math.round((resolution * width) / height) : resolution;
  const ny = height > width ? Math.round((resolution * height) / width) : resolution;

  const dx = width / nx;
  const dy = height / ny;

  // Wiersz wartości trzymamy między przebiegami: każdy punkt siatki liczymy
  // raz, a nie cztery razy (po jednym na każdą sąsiadującą komórkę).
  let previousRow = new Array(nx + 1);
  for (let i = 0; i <= nx; i += 1) previousRow[i] = evaluate(xMin + i * dx, yMin);

  for (let j = 1; j <= ny; j += 1) {
    const y = yMin + j * dy;
    const row = new Array(nx + 1);
    for (let i = 0; i <= nx; i += 1) row[i] = evaluate(xMin + i * dx, y);

    for (let i = 0; i < nx; i += 1) {
      cell(
        xMin + i * dx, y - dy, xMin + (i + 1) * dx, y,
        previousRow[i], previousRow[i + 1], row[i], row[i + 1],
        0,
      );
    }
    previousRow = row;
  }

  return { segments, fills };
}
