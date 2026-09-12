/**
 * linalg.ts — tyle algebry, ile potrzebuje solver więzów.
 *
 * Świadomie na miejscu, a nie z zewnątrz: to trzydzieści wierszy, a zależność
 * od pakietu numerycznego kosztowałaby pakiet layoutu jego niezależność.
 */

/** Rozwiązuje `A x = b` eliminacją Gaussa z wyborem elementu głównego. */
export function solveLinear(A: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const M = A.map((wiersz, i) => [...wiersz, b[i]]);

  for (let k = 0; k < n; k++) {
    let glowny = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[glowny][k])) glowny = i;
    if (Math.abs(M[glowny][k]) < 1e-12) return undefined;
    [M[k], M[glowny]] = [M[glowny], M[k]];

    for (let i = k + 1; i < n; i++) {
      const w = M[i][k] / M[k][k];
      if (w === 0) continue;
      for (let j = k; j <= n; j++) M[i][j] -= w * M[k][j];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/**
 * Rząd macierzy — ile spośród wierszy jest naprawdę niezależnych.
 *
 * To jest liczba, z której bierze się „ile stopni swobody zostało". Progu nie da
 * się pominąć: dwa więzy mówiące prawie to samo dają wiersze prawie zależne,
 * a arytmetyka zmiennoprzecinkowa zostawia po eliminacji śmieć rzędu 1e-16.
 */
export function matrixRank(A: number[][], eps = 1e-9): number {
  if (!A.length) return 0;
  const M = A.map((w) => [...w]);
  const wierszy = M.length;
  const kolumn = M[0].length;
  const skala = Math.max(1, ...M.flat().map(Math.abs));

  let rzad = 0;
  for (let kol = 0; kol < kolumn && rzad < wierszy; kol++) {
    let glowny = rzad;
    for (let i = rzad + 1; i < wierszy; i++) if (Math.abs(M[i][kol]) > Math.abs(M[glowny][kol])) glowny = i;
    if (Math.abs(M[glowny][kol]) < eps * skala) continue;

    [M[rzad], M[glowny]] = [M[glowny], M[rzad]];
    for (let i = rzad + 1; i < wierszy; i++) {
      const w = M[i][kol] / M[rzad][kol];
      if (w === 0) continue;
      for (let j = kol; j < kolumn; j++) M[i][j] -= w * M[rzad][j];
    }
    rzad++;
  }
  return rzad;
}
