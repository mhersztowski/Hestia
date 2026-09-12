/**
 * linsolve.ts — układ równań liniowych rozwiązywany na potrzeby solvera.
 *
 * Metoda niejawna w każdym kroku musi rozwiązać układ z macierzą `I − γhJ`.
 * To jest cała różnica w koszcie wobec metod jawnych — i cała różnica
 * w stabilności.
 *
 * Pakiet ma już eliminację Gaussa w `linalg/procedures.ts`, ale tamta zwraca
 * **listę kroków z opisem**, bo tam treścią lekcji jest droga. Tutaj potrzeba
 * odwrotności: samego wyniku, liczonego kilkaset razy na sekundę, bez alokacji
 * na każdy krok pośredni. Dwie różne potrzeby, dwie różne funkcje.
 */

/**
 * Rozwiązuje `A · x = b` eliminacją Gaussa z częściowym wyborem elementu głównego.
 *
 * Wybór elementu głównego nie jest ozdobą: bez niego zero na przekątnej kończy
 * się dzieleniem przez zero, a mała wartość — utratą cyfr znaczących. Macierz
 * `I − γhJ` bywa źle uwarunkowana właśnie wtedy, gdy układ jest sztywny, czyli
 * dokładnie w przypadku, dla którego ta metoda powstała.
 *
 * Zwraca `undefined` dla macierzy osobliwej — wołający ma wtedy zmniejszyć krok
 * albo powiedzieć wprost, że nie umie policzyć.
 */
export function solveLinear(A: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  // Kopia, bo eliminacja niszczy macierz, a wołający trzyma w niej jakobian
  // używany jeszcze w kolejnych stopniach tego samego kroku.
  const M = A.map((row) => [...row]);
  const x = [...b];

  for (let k = 0; k < n; k += 1) {
    let pivot = k;
    for (let i = k + 1; i < n; i += 1) {
      if (Math.abs(M[i][k]) > Math.abs(M[pivot][k])) pivot = i;
    }
    if (!Number.isFinite(M[pivot][k]) || M[pivot][k] === 0) return undefined;

    if (pivot !== k) {
      [M[k], M[pivot]] = [M[pivot], M[k]];
      [x[k], x[pivot]] = [x[pivot], x[k]];
    }

    for (let i = k + 1; i < n; i += 1) {
      const factor = M[i][k] / M[k][k];
      if (factor === 0) continue;
      for (let j = k; j < n; j += 1) M[i][j] -= factor * M[k][j];
      x[i] -= factor * x[k];
    }
  }

  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = x[i];
    for (let j = i + 1; j < n; j += 1) sum -= M[i][j] * x[j];
    if (M[i][i] === 0) return undefined;
    x[i] = sum / M[i][i];
  }

  return x.every(Number.isFinite) ? x : undefined;
}
