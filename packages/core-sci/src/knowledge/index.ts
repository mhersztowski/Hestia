/**
 * knowledge/index.ts — indeks bazy wiedzy ze skanu dokumentów.
 *
 * Kierunek z raportu (3.6): **dokument jest źródłem prawdy, a rejestr wzorów to
 * indeks budowany ze skanowania**. Nie ma osobnej bazy, do której dokumenty się
 * odwołują — jest skan plików i to, co z niego wynika.
 *
 * Skan daje trzy rzeczy, których pojedynczy dokument nie zna:
 *
 *  • **Walidację globalną.** Duplikat identyfikatora wzoru między dokumentami
 *    jest błędem tak samo jak w jednym pliku — tylko widać go dopiero z góry.
 *  • **Powiązania.** `@derivedFrom` sięgające do innego dokumentu buduje graf
 *    wiedzy; `@uses` w zadaniu wpina je w ten sam graf.
 *  • **Katalog.** Lista tematów, prerekwizytów i zadań powstaje sama, więc nie
 *    ma czego aktualizować ręcznie.
 */
import { parseFormulaBlock, type FormulaBlock } from '../formula/parseFormula';
import { parseExerciseBlock, type ExerciseBlock } from '../exercise/parseExercise';
import { parseTermBlock, type TermBlock } from './glossary';
import { parseFigureBlock, parseTableBlock, type FigureBlock, type TableBlock } from './blocks';
import { parseCalloutBlock, type CalloutBlock } from './callout';
import { parseLawBlock, type LawBlock } from './law';

/** Nagłówek YAML dokumentu — tagi, prerekwizyty, tytuł. */
export interface DocumentMeta {
  title?: string;
  /** Identyfikator dokumentu jako celu odsyłacza („paragraf 15-1"). */
  id?: string;
  tags: string[];
  /** Tematy, które warto poznać wcześniej — z nich powstaje DAG nauki. */
  requires: string[];
}

export interface KnowledgeDocument {
  /** Ścieżka pliku — identyfikator dokumentu w bazie. */
  path: string;
  meta: DocumentMeta;
  formulas: FormulaBlock[];
  exercises: ExerciseBlock[];
  /** Hasła słownika zagadnień — pełne tylko w pliku słownika książki. */
  terms: TermBlock[];
  figures: FigureBlock[];
  tables: TableBlock[];
  /** Notki kontekstowe — jedyna nasza treść w dokumencie. */
  callouts: CalloutBlock[];
  /** Pozycje katalogu praw — pełne tylko w pliku `Prawa.md` książki. */
  laws: LawBlock[];
  /** Identyfikator samego dokumentu (`id:` w nagłówku) — cel odsyłacza do paragrafu. */
  anchorId?: string;
  /** Bloki `sim` — po nich widać, które dokumenty mają symulację z grafu. */
  simCount: number;
  /** Bloki `simscript` — model pisany wprost w dokumencie. */
  scriptCount: number;
}

export interface KnowledgeIssue {
  message: string;
  path?: string;
  formulaId?: string;
}

/** Co może być celem odsyłacza `((id))`. */
export type AnchorKind =
  | 'formula' | 'term' | 'figure' | 'table' | 'section' | 'callout' | 'law' | 'exercise';

export interface Anchor {
  path: string;
  kind: AnchorKind;
}

export interface KnowledgeIndex {
  documents: KnowledgeDocument[];
  /**
   * Wszystkie cele odsyłaczy w jednej mapie.
   *
   * Jedna mapa, nie pięć, bo odsyłacz rozwiązuje się po **samym
   * identyfikatorze** — a wtedy kolizja między wzorem a rysunkiem jest tak samo
   * groźna jak kolizja dwóch wzorów i musi być wykrywana w jednym miejscu.
   */
  anchors: Map<string, Anchor>;
  /** Wzór → dokument. Zachowane dla katalogu, wywodzone z `anchors`. */
  formulaHome: Map<string, string>;
  /** Hasło słownika → dokument. */
  termHome: Map<string, string>;
  issues: KnowledgeIssue[];
}

/**
 * Ogrodzenia bloków — **zakotwiczone na początku wiersza**.
 *
 * Bez `^` przykład wcięty w dokumentacji byłby czytany jak prawdziwy blok:
 * `PLAN.md` leży w tej samej bazie i pokazuje format hasła, więc zakładałby
 * hasło i rezerwował identyfikator, który potem kolidowałby z prawdziwym.
 * Markdown i tak traktuje wcięcie o cztery spacje jako blok kodu — robimy to
 * samo. Dopuszczamy do trzech spacji, bo tyle markdown wybacza w ogrodzeniu.
 */
const FORMULA_FENCE = /^ {0,3}```formula:([A-Za-z0-9_-]+)\n([\s\S]*?)```/gm;
const EXERCISE_FENCE = /^ {0,3}```exercise:([A-Za-z0-9_-]+)\n([\s\S]*?)```/gm;
const TERM_FENCE_G = /^ {0,3}```term:([A-Za-z0-9_-]+)\n([\s\S]*?)```/gm;
const FIGURE_FENCE = /^ {0,3}```figure:([A-Za-z0-9_-]+)\n([\s\S]*?)```/gm;
const TABLE_FENCE = /^ {0,3}```table:([A-Za-z0-9_-]+)\n([\s\S]*?)```/gm;
const CALLOUT_FENCE_G = /^ {0,3}```callout:([A-Za-z0-9_-]+)\n([\s\S]*?)```/gm;
const LAW_FENCE_G = /^ {0,3}```law:([A-Za-z0-9_-]+)\n([\s\S]*?)```/gm;
const SIM_FENCE = /^ {0,3}```sim(?::[A-Za-z0-9_-]+)?\n[\s\S]*?```/gm;
const SCRIPT_FENCE = /^ {0,3}```simscript(?::[A-Za-z0-9_-]+)?\n[\s\S]*?```/gm;

/**
 * Czyta nagłówek YAML z początku pliku.
 *
 * Świadomie własny, minimalny odczyt zamiast biblioteki YAML: obsługujemy trzy
 * pola o znanym kształcie, a pełny parser wciągnąłby zależność po to, żeby
 * przeczytać listę słów. Nieznane pola pomijamy — dokument może mieć własne.
 */
export function parseFrontMatter(markdown: string): { meta: DocumentMeta; body: string } {
  const meta: DocumentMeta = { tags: [], requires: [] };
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(markdown);
  if (!match) return { meta, body: markdown };

  for (const line of match[1].split('\n')) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim();
    const value = rest.join(':').trim();
    if (!value) continue;

    if (key === 'title') meta.title = value.replace(/^["']|["']$/g, '');
    else if (key === 'id') meta.id = value.replace(/^["']|["']$/g, '');
    else if (key === 'tags' || key === 'requires') {
      const list = value.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
      meta[key] = list.filter(Boolean);
    }
  }

  return { meta, body: markdown.slice(match[0].length) };
}

/** Czyta jeden dokument: nagłówek, wzory, zadania. */
export function readDocument(path: string, markdown: string): KnowledgeDocument {
  const { meta, body } = parseFrontMatter(markdown);

  const formulas: FormulaBlock[] = [];
  for (const match of body.matchAll(FORMULA_FENCE)) {
    formulas.push(parseFormulaBlock(match[1], match[2]));
  }

  const exercises: ExerciseBlock[] = [];
  for (const match of body.matchAll(EXERCISE_FENCE)) {
    exercises.push(parseExerciseBlock(match[1], match[2]));
  }

  const terms: TermBlock[] = [];
  for (const match of body.matchAll(TERM_FENCE_G)) {
    terms.push(parseTermBlock(match[1], match[2]));
  }

  const figures: FigureBlock[] = [];
  for (const match of body.matchAll(FIGURE_FENCE)) {
    figures.push(parseFigureBlock(match[1], match[2]));
  }

  const callouts: CalloutBlock[] = [];
  for (const match of body.matchAll(CALLOUT_FENCE_G)) {
    callouts.push(parseCalloutBlock(match[1], match[2]));
  }

  const laws: LawBlock[] = [];
  for (const match of body.matchAll(LAW_FENCE_G)) {
    laws.push(parseLawBlock(match[1], match[2]));
  }

  const tables: TableBlock[] = [];
  for (const match of body.matchAll(TABLE_FENCE)) {
    tables.push(parseTableBlock(match[1], match[2]));
  }

  // Tytuł z nagłówka YAML, a w jego braku z pierwszego nagłówka markdown —
  // autor nie powinien pisać tytułu dwa razy.
  if (!meta.title) {
    const heading = /^#\s+(.+)$/m.exec(body);
    if (heading) meta.title = heading[1].trim();
  }

  return {
    path,
    meta,
    formulas,
    exercises,
    terms,
    figures,
    tables,
    callouts,
    laws,
    anchorId: meta.id,
    simCount: [...body.matchAll(SIM_FENCE)].length,
    scriptCount: [...body.matchAll(SCRIPT_FENCE)].length,
  };
}

/**
 * Buduje indeks z wielu dokumentów i sprawdza spójność całości.
 *
 * Błędy nie przerywają budowy — baza wiedzy z jednym zepsutym plikiem ma się
 * otworzyć i pokazać, który to plik.
 */
export function buildIndex(files: Array<{ path: string; markdown: string }>): KnowledgeIndex {
  const documents = files.map(({ path, markdown }) => readDocument(path, markdown));
  const issues: KnowledgeIssue[] = [];
  const anchors = new Map<string, Anchor>();

  /**
   * Rejestruje cel, pilnując unikalności **w całej bazie**.
   *
   * Kolizja między rodzajami (wzór i rysunek o tym samym identyfikatorze) jest
   * tak samo groźna jak kolizja w obrębie jednego rodzaju, bo odsyłacz zna
   * tylko identyfikator.
   */
  const dodaj = (id: string, kind: AnchorKind, path: string) => {
    const zajete = anchors.get(id);
    if (zajete) {
      const rodzaje = zajete.kind === kind ? `(oba jako ${kind})` : `(jako ${zajete.kind} i ${kind})`;
      issues.push({
        message: `Identyfikator „${id}" jest użyty w dwóch dokumentach: ${zajete.path} i ${path} ${rodzaje}.`,
        path,
        formulaId: id,
      });
      return;
    }
    anchors.set(id, { path, kind });
  };

  for (const document of documents) {
    for (const formula of document.formulas) dodaj(formula.id, 'formula', document.path);
    for (const term of document.terms) {
      for (const issue of term.issues) {
        issues.push({ message: issue.message, path: document.path, formulaId: term.id });
      }
      dodaj(term.id, 'term', document.path);
    }
    for (const figure of document.figures) {
      for (const issue of figure.issues) {
        issues.push({ message: issue.message, path: document.path, formulaId: figure.id });
      }
      dodaj(figure.id, 'figure', document.path);
    }
    for (const table of document.tables) {
      for (const issue of table.issues) {
        issues.push({ message: issue.message, path: document.path, formulaId: table.id });
      }
      dodaj(table.id, 'table', document.path);
    }
    for (const callout of document.callouts) {
      for (const issue of callout.issues) {
        issues.push({ message: issue.message, path: document.path, formulaId: callout.id });
      }
      dodaj(callout.id, 'callout', document.path);
    }
    for (const law of document.laws) {
      for (const issue of law.issues) {
        issues.push({ message: issue.message, path: document.path, formulaId: law.id });
      }
      dodaj(law.id, 'law', document.path);
    }
    /*
     * Zadania są celem odsyłaczy, nie tylko ich źródłem.
     *
     * Podręcznik odsyła do nich wprost — „patrz zadanie 21, rozdział 2" —
     * a bez rejestracji taki odsyłacz prowadził w próżnię: indeks czytał
     * bloki `exercise` wyłącznie po to, by wiedzieć, czego zadanie **używa**.
     */
    for (const exercise of document.exercises) dodaj(exercise.id, 'exercise', document.path);

    if (document.anchorId) dodaj(document.anchorId, 'section', document.path);
  }

  const formulaHome = new Map(
    [...anchors].filter(([, a]) => a.kind === 'formula').map(([id, a]) => [id, a.path]),
  );
  const termHome = new Map(
    [...anchors].filter(([, a]) => a.kind === 'term').map(([id, a]) => [id, a.path]),
  );

  const documentPaths = new Set(documents.map((d) => d.path));
  const titles = new Map(documents.map((d) => [d.meta.title, d.path] as const));

  for (const document of documents) {
    for (const formula of document.formulas) {
      // Odniesienia sprawdzamy globalnie: wzór wolno wywieść z innego
      // dokumentu i to jest sedno grafu wiedzy.
      for (const reference of formula.derivedFrom) {
        if (!formulaHome.has(reference)) {
          issues.push({
            message: `Wzór „${formula.id}" wywodzi się z „${reference}", którego nie ma w całej bazie.`,
            path: document.path,
            formulaId: formula.id,
          });
        }
      }
    }

    for (const exercise of document.exercises) {
      for (const used of exercise.uses) {
        if (!formulaHome.has(used)) {
          issues.push({
            message: `Zadanie „${exercise.id}" odwołuje się do wzoru „${used}", którego nie ma w bazie.`,
            path: document.path,
          });
        }
      }
    }

    for (const required of document.meta.requires) {
      if (!documentPaths.has(required) && !titles.has(required)) {
        issues.push({
          message: `Dokument wymaga „${required}", którego nie ma w bazie.`,
          path: document.path,
        });
      }
    }
  }

  return { documents, anchors, formulaHome, termHome, issues };
}

/** Wszystkie zadania w bazie — katalog powstaje ze skanu, nie z ręcznej listy. */
export function allExercises(index: KnowledgeIndex): Array<{ path: string; exercise: ExerciseBlock }> {
  return index.documents.flatMap((document) => document.exercises.map((exercise) => ({ path: document.path, exercise })));
}

/** Zadania dotyczące danego wzoru — po `@uses`. */
export function exercisesFor(index: KnowledgeIndex, formulaId: string) {
  return allExercises(index).filter(({ exercise }) => exercise.uses.includes(formulaId));
}

/** Dokumenty oznaczone danym tagiem. */
export function documentsByTag(index: KnowledgeIndex, tag: string): KnowledgeDocument[] {
  return index.documents.filter((document) => document.meta.tags.includes(tag));
}

export interface LearningEdge {
  from: string;
  to: string;
  kind: 'requires' | 'derivedFrom';
}

/**
 * Krawędzie grafu wiedzy: prerekwizyty między dokumentami i wywody między
 * wzorami sprowadzone do dokumentów, w których mieszkają.
 *
 * Wywód w obrębie jednego dokumentu pomijamy — mówi o kolejności wewnątrz
 * wykładu, a nie o zależności między tematami, i zaśmieciłby graf pętlami.
 */
export function learningGraph(index: KnowledgeIndex): LearningEdge[] {
  const edges: LearningEdge[] = [];
  const byTitle = new Map(index.documents.map((d) => [d.meta.title, d.path] as const));

  for (const document of index.documents) {
    for (const required of document.meta.requires) {
      const from = byTitle.get(required) ?? required;
      edges.push({ from, to: document.path, kind: 'requires' });
    }

    for (const formula of document.formulas) {
      for (const reference of formula.derivedFrom) {
        const home = index.formulaHome.get(reference);
        if (!home || home === document.path) continue;
        if (edges.some((e) => e.from === home && e.to === document.path && e.kind === 'derivedFrom')) continue;
        edges.push({ from: home, to: document.path, kind: 'derivedFrom' });
      }
    }
  }

  return edges;
}
