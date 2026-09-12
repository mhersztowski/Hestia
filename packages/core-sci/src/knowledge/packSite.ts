/**
 * packSite.ts — plan archiwum z bazą wiedzy.
 *
 * `exportSite` daje strony, ale działająca baza to strony **plus** bundel:
 * `sci.js` i fonty składu wzorów. Z linii poleceń bundel leży już na dysku;
 * z przeglądarki trzeba go dociągnąć z serwera. Ten moduł opisuje, co ma
 * wejść do archiwum i skąd to wziąć — samo pobieranie i pakowanie należy do
 * hosta, bo `fetch` i ZIP to jego sprawa, nie rdzenia.
 *
 * Rozdzielenie planu od wykonania ma jeden konkretny skutek: brak bundla
 * wychodzi **przed** pobraniem czegokolwiek, a nie po rozpakowaniu archiwum
 * przez czytelnika.
 */
import { exportSite, type ExportOptions, type SourceDocument } from './exportSite';

export interface PackEntry {
  path: string;
  /** `text` — treść jest tutaj; `fetch` — host ma ją pobrać spod tej ścieżki. */
  kind: 'text' | 'fetch';
  content?: string;
}

export interface PackPlan {
  entries: PackEntry[];
  /** Nazwa pliku do pobrania. */
  filename: string;
  /**
   * Powody, dla których archiwum nie byłoby użyteczne.
   *
   * Niepuste znaczy „nie pakuj" — archiwum z samymi stronami wygląda na
   * kompletne i dopiero po otwarciu okazuje się listą akapitów bez symulacji.
   */
  issues: string[];
}

/** Nazwa archiwum wyprowadzona z tytułu bazy. */
function slug(title: string): string {
  const bez = title
    .toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/[żź]/g, 'z');
  const oczyszczony = bez.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return oczyszczony || 'baza-wiedzy';
}

/**
 * Buduje plan archiwum.
 *
 * @param documents dokumenty bazy — źródło stron
 * @param assets ścieżki plików bundla widziane przez hosta (`assets/sci.js`…)
 */
export function planPack(
  documents: SourceDocument[],
  assets: string[],
  options: ExportOptions,
): PackPlan {
  const issues: string[] = [];
  if (!documents.length) issues.push('Baza nie ma żadnego dokumentu — nie ma czego pakować.');

  const bundel = assets.find((path) => path.endsWith('sci.js'));
  if (!bundel) {
    issues.push(
      'Brakuje bundla sci.js — bez niego strony pokażą sam tekst, bez symulacji i wzorów. '
      + 'Zbuduj go poleceniem `pnpm --filter @hestia/ui-core export:static`.',
    );
  }

  const strony = exportSite(documents, {
    ...options,
    script: bundel,
    stylesheet: assets.find((path) => path.endsWith('.css')),
  });

  return {
    entries: [
      ...strony.map((file): PackEntry => ({ path: file.path, kind: 'text', content: file.content })),
      ...assets.map((path): PackEntry => ({ path, kind: 'fetch' })),
    ],
    filename: `${slug(options.title)}.zip`,
    issues,
  };
}
