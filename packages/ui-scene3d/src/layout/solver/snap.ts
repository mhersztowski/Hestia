/**
 * snap.ts — dosuwanie do siatki.
 *
 * Zostaje osobno i celowo **poza** solverem: dosunięcie do siatki jest korektą
 * tego, dokąd celuje ręka, a nie warunkiem nałożonym na rysunek. Gdyby weszło
 * do układu równań jako więz, walczyłoby z pozostałymi i przy każdym ruchu
 * trzeba by rozstrzygać, kto ustępuje.
 *
 * Dlatego dosuwamy **cel przeciągania**, a wynik i tak przechodzi przez solver.
 * Skutek jest taki, jakiego się oczekuje: kształt swobodny ląduje na siatce,
 * a kształt związany — tam, gdzie pozwalają warunki. Bez tego rozdziału
 * dosuwanie punktu przypiętego wyglądałoby jak usterka: kursor skacze po
 * siatce, a kształt stoi.
 */
export function snapToGrid(cel: { x: number; y: number }, skok: number): { x: number; y: number } {
  if (!skok || skok <= 0) return cel;
  return { x: Math.round(cel.x / skok) * skok, y: Math.round(cel.y / skok) * skok };
}
