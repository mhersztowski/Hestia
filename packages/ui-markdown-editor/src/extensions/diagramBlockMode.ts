/**
 * diagramBlockMode.ts — tryb bloku diagramu w infostringu.
 *
 * ` ```mermaid ` otwiera się jako tekst, ` ```mermaid:view ` jako rysunek,
 * ` ```mermaid:edit ` jako edytor graficzny. Wzorzec jest w projekcie już
 * ustalony: tak samo ustawienia bloku `automate` (` ```automate:id:autorun:… `)
 * i `pscript` round-tripują przez parametry po dwukropku.
 *
 * Domyślny tryb **nie trafia do pliku**. Inaczej każdy diagram w bazie dostałby
 * parametr, który niczego nie zmienia, a różnica w repozytorium przestałaby
 * pokazywać, że ktoś świadomie ustawił widok.
 */

export type DiagramBlockMode = 'code' | 'view' | 'edit';

/**
 * Języki bloku diagramu — z trybem albo bez.
 *
 * Jeden widok obsługuje wszystkie, bo różnica jest wyłącznie w adapterze
 * formatu — o to chodziło w rozdzieleniu modelu od składni. `umlproj` to
 * projekt ze strony Programming → UML, `dot` to Graphviz (wyjście dziesiątek
 * narzędzi), `plantuml` — diagram klas z Confluence'a i IntelliJ.
 */
const LANGUAGE = /^(mermaid|umlproj|dot|plantuml)(?::([a-z]+))?$/;

const MODES: DiagramBlockMode[] = ['code', 'view', 'edit'];

/** Czy ten infostring należy do bloku diagramu. */
export function matchesDiagramLanguage(language: string): boolean {
  return LANGUAGE.test(language);
}

/**
 * Tryb zapisany w infostringu; `code` dla braku i dla zapisu nieznanego.
 *
 * Literówka w ręcznie pisanym infostringu zostawia blok w trybie tekstu — to
 * jedyny tryb, w którym widać, co jest napisane, więc jest właściwym miejscem
 * do wylądowania, gdy coś jest nie tak.
 */
export function readMode(language: string): DiagramBlockMode {
  const parameter = LANGUAGE.exec(language)?.[2];
  return MODES.find((mode) => mode === parameter) ?? 'code';
}

/** Infostring z zapisanym trybem. */
export function languageWithMode(language: string, mode: DiagramBlockMode): string {
  const base = language.split(':')[0] || 'mermaid';
  return mode === 'code' ? base : `${base}:${mode}`;
}
