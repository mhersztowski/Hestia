/**
 * frontMatter.ts — blok `---` na początku diagramu Mermaida.
 *
 * Mermaid pozwala poprzedzić diagram blokiem YAML (`title`, `config`), ale
 * czyta go **wyłącznie wtedy, gdy jest pierwszy**. Nierozpoznane linie wracają u
 * nas na koniec diagramu, więc bez osobnej obsługi zapis z edytora graficznego
 * przesuwałby ten blok i psuł plik: Mermaid próbuje wtedy czytać `---` jako
 * krawędź i kończy błędem składni.
 */

export interface FrontMatterSplit {
  /** Treść bloku razem z ogranicznikami `---`, albo pusty string. */
  frontMatter: string;
  /** Diagram bez bloku — to trafia do parsera. */
  body: string;
  /** Ile linii zajmował blok (numeracja `unknown` musi pozostać zgodna ze źródłem). */
  offset: number;
}

/** Oddziela front matter od reszty. Blok musi zaczynać pierwszą linię. */
export function splitFrontMatter(text: string): FrontMatterSplit {
  const lines = text.split('\n');
  let first = 0;
  // Puste linie przed blokiem są dopuszczalne i nie zmieniają jego znaczenia.
  while (first < lines.length && lines[first].trim() === '') first++;
  if (lines[first]?.trim() !== '---') return { frontMatter: '', body: text, offset: 0 };

  const closing = lines.findIndex((line, index) => index > first && line.trim() === '---');
  if (closing === -1) return { frontMatter: '', body: text, offset: 0 };

  return {
    frontMatter: lines.slice(first, closing + 1).join('\n'),
    body: lines.slice(closing + 1).join('\n'),
    offset: closing + 1,
  };
}

/** Skleja z powrotem — blok zawsze pierwszy. */
export function withFrontMatter(frontMatter: string | undefined, body: string): string {
  return frontMatter ? `${frontMatter}\n${body}` : body;
}
