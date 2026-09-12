/**
 * registerBuiltinBlocks.ts — wpięcie wbudowanych widoków bloków.
 *
 * Każdy moduł ładowany **osobno i asynchronicznie**, bo rejestracje muszą być
 * od siebie niezależne. Przy zwykłym łańcuchu importów statycznych jeden
 * nieudany import (choćby przejściowy — pakiet w trakcie przebudowy) zabiera
 * wszystkie rejestracje po nim: bloki `formula` i `sim` renderowały się jako
 * zwykły kod tylko dlatego, że moduł diagramu chwilowo się nie wczytał.
 *
 * Późna rejestracja jest bezpieczna, bo rejestr powiadamia o zmianie, a bloki
 * go subskrybują (patrz `blockRenderers.ts`).
 */
const modules: Array<[string, () => Promise<unknown>]> = [
  ['diagram (mermaid)', () => import('./DiagramBlockView')],
  ['bloki sci (formula, sim, exercise, simscript)', () => import('./sciBlocks')],
];

for (const [name, load] of modules) {
  void load().catch((error) => {
    // Awaria jednego zestawu bloków nie może wyciszyć pozostałych ani wywalić
    // edytora — zostaje w konsoli, a blok pokaże się jako zwykły kod.
    console.error(`[mdeditor] nie udało się wczytać widoków: ${name}`, error);
  });
}
