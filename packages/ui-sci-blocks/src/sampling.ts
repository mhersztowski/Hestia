/**
 * sampling.ts — przygotowanie danych do rysowania.
 *
 * Dwa problemy, które pojawiają się dopiero przy długich symulacjach (orbita
 * liczona przez godziny czasu modelowego ma setki tysięcy próbek):
 *
 *  • **`Math.min(...tablica)` przepełnia stos.** Rozwinięcie kilkuset tysięcy
 *    argumentów przekracza limit wywołania — i to nie jest sytuacja brzegowa,
 *    tylko zwykły dokument o orbicie.
 *  • **Rysowanie każdej próbki jest marnotrawstwem.** Canvas ma kilkaset
 *    pikseli szerokości; setki tysięcy odcinków nie dodają ani jednego
 *    widocznego szczegółu, a kosztują całą płynność.
 */

/** Minimum bez rozwijania tablicy w listę argumentów. */
export function minOf(values: readonly number[]): number {
  let result = Number.POSITIVE_INFINITY;
  for (const value of values) if (value < result) result = value;
  return result;
}

/** Maksimum bez rozwijania tablicy w listę argumentów. */
export function maxOf(values: readonly number[]): number {
  let result = Number.NEGATIVE_INFINITY;
  for (const value of values) if (value > result) result = value;
  return result;
}

/**
 * Przerzedza punkty do rysowania.
 *
 * Zachowuje pierwszy i ostatni, więc krzywa nie urywa się przed końcem.
 * Świadomie zwykłe co n-te, a nie uśrednianie: dla toru w przestrzeni
 * uśrednienie ścięłoby zakręty, a to one niosą kształt.
 */
export function decimate<T>(points: readonly T[], limit = 2000): T[] {
  if (points.length <= limit) return [...points];

  const step = points.length / limit;
  const out: T[] = [];
  for (let i = 0; i < limit; i += 1) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}
