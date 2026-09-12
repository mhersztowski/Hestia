/**
 * Atrapa `monaco-editor` dla testów uruchamianych w Node.
 *
 * Prawdziwy pakiet nie daje się wczytać poza przeglądarką (jego `exports`
 * wskazują wejście ESM zależne od `window`), więc bez tej podmianki nie da się
 * przetestować **niczego**, co go importuje — w tym analizy C++, która jest
 * czystym przetwarzaniem tekstu i o edytorze nie wie nic poza numerami rodzajów
 * symboli.
 */

const kinds = new Proxy({} as Record<string, number>, { get: () => 0 });

export const languages = {
    CompletionItemKind: kinds,
    CompletionItemInsertTextRule: kinds,
    registerCompletionItemProvider: () => ({ dispose() { /* atrapa */ } }),
    registerHoverProvider: () => ({ dispose() { /* atrapa */ } }),
    registerSignatureHelpProvider: () => ({ dispose() { /* atrapa */ } }),
};

export const editor = { getModels: () => [] as unknown[] };

export class Range {}

export default { languages, editor, Range };
