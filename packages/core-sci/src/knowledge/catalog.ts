/**
 * catalog.ts — nawigacja po bazie wiedzy: wyszukiwanie i układ grafu.
 *
 * Raport (4) mówi o katalogu z wyszukiwaniem i grafie prerekwizytów tworzącym
 * „DAG nauki". Obie rzeczy da się policzyć z indeksu, więc mieszkają w rdzeniu,
 * a nie w widoku — dzięki temu ta sama funkcja obsłuży stronę katalogu,
 * podpowiadanie przy pisaniu i przyszły eksport statyczny.
 *
 * Wyszukiwanie jest celowo proste i **wyjaśnialne**: wynik niesie informację,
 * gdzie trafiono (tytuł, tag, wzór, treść), bo w bazie wiedzy „czemu to
 * wyskoczyło" jest równie ważne jak sam wynik. Rozmyte dopasowanie i wagi
 * TF-IDF dołożyłyby trafności, ale odebrały tę własność — i wtedy trzeba by je
 * dokładać przy pierwszym pytaniu użytkownika, a nie na zapas.
 */
import type { KnowledgeDocument, KnowledgeIndex } from './index';
import { learningGraph } from './index';

export type MatchKind = 'title' | 'tag' | 'formula' | 'exercise' | 'text';

export interface SearchHit {
  document: KnowledgeDocument;
  /** Im wyżej, tym lepiej — trafienie w tytuł waży więcej niż w treść. */
  score: number;
  /** Gdzie trafiono — pokazywane przy wyniku. */
  matches: Array<{ kind: MatchKind; detail: string }>;
}

const WEIGHTS: Record<MatchKind, number> = {
  title: 10,
  tag: 6,
  formula: 4,
  exercise: 3,
  text: 1,
};

/** Porównanie bez rozróżniania wielkości liter i polskich znaków diakrytycznych. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // `ł` nie rozkłada się przez NFD — trzeba go podmienić wprost, inaczej
    // „wahadlo" nie znajdzie „wahadło", co jest najczęstszym zapytaniem.
    .replace(/ł/g, 'l');
}

/**
 * Szuka w bazie wiedzy.
 *
 * `bodies` to treści dokumentów — indeks trzyma tylko strukturę, a szukanie po
 * tekście wymaga oryginału. Rozdzielone świadomie: strona katalogu ma indeks
 * zawsze, a treści dopiero po wczytaniu plików.
 */
export function search(
  index: KnowledgeIndex,
  query: string,
  bodies: Record<string, string> = {},
): SearchHit[] {
  const needle = normalize(query.trim());
  if (!needle) return [];

  const hits: SearchHit[] = [];

  for (const document of index.documents) {
    const matches: SearchHit['matches'] = [];

    if (normalize(document.meta.title ?? '').includes(needle)) {
      matches.push({ kind: 'title', detail: document.meta.title! });
    }
    for (const tag of document.meta.tags) {
      if (normalize(tag).includes(needle)) matches.push({ kind: 'tag', detail: tag });
    }
    for (const formula of document.formulas) {
      if (normalize(formula.id).includes(needle) || normalize(formula.expression ?? '').includes(needle)) {
        matches.push({ kind: 'formula', detail: formula.id });
      }
    }
    for (const exercise of document.exercises) {
      if (normalize(exercise.id).includes(needle) || normalize(exercise.prompt).includes(needle)) {
        matches.push({ kind: 'exercise', detail: exercise.id });
      }
    }

    // Nagłówek YAML odcinamy: to metadane, a nie treść, i pokazany jako
    // fragment wyniku mówi czytelnikowi dokładnie nic.
    const body = bodies[document.path]?.replace(/^---\n[\s\S]*?\n---\n?/, '');
    if (body) {
      const normalized = normalize(body);
      const position = normalized.indexOf(needle);
      if (position >= 0) {
        // Fragment wokół trafienia — czytelnik ma zobaczyć kontekst, a nie
        // samo słowo wyrwane ze zdania.
        const from = Math.max(0, position - 40);
        matches.push({ kind: 'text', detail: `…${body.slice(from, from + 120).trim()}…` });
      }
    }

    if (!matches.length) continue;
    const score = matches.reduce((sum, match) => sum + WEIGHTS[match.kind], 0);
    hits.push({ document, score, matches });
  }

  return hits.sort((a, b) => b.score - a.score);
}

export interface GraphNodePosition {
  path: string;
  title: string;
  /** Warstwa — im dalej, tym więcej trzeba poznać wcześniej. */
  level: number;
  /** Miejsce w warstwie. */
  index: number;
  tags: string[];
  formulaCount: number;
  exerciseCount: number;
  scriptCount: number;
}

export interface GraphLayout {
  nodes: GraphNodePosition[];
  edges: Array<{ from: string; to: string; kind: 'requires' | 'derivedFrom' }>;
  /** Ile jest warstw — po tym widok dobiera rozmiar. */
  levels: number;
}

/**
 * Układa graf wiedzy w warstwy.
 *
 * Poziom dokumentu to długość najdłuższej ścieżki prerekwizytów prowadzącej do
 * niego. Najdłuższej, a nie najkrótszej: żeby dokument stał **za** wszystkim,
 * czego wymaga, wystarczy jeden długi łańcuch — a przy najkrótszej ścieżce
 * strzałka potrafiłaby biec do tyłu.
 *
 * Cykl (błąd bazy, zgłaszany przy walidacji) nie może zapętlić układu, więc
 * liczymy z ograniczeniem głębokości równym liczbie dokumentów.
 */
export function layoutKnowledgeGraph(index: KnowledgeIndex): GraphLayout {
  const edges = learningGraph(index);
  const documents = index.documents;

  const requiredBy = new Map<string, string[]>();
  for (const edge of edges) {
    const list = requiredBy.get(edge.to) ?? [];
    list.push(edge.from);
    requiredBy.set(edge.to, list);
  }

  const levels = new Map<string, number>();
  const levelOf = (path: string, depth = 0): number => {
    if (levels.has(path)) return levels.get(path)!;
    if (depth > documents.length) return 0;

    const sources = requiredBy.get(path) ?? [];
    const level = sources.length
      ? Math.max(...sources.map((source) => levelOf(source, depth + 1) + 1))
      : 0;
    levels.set(path, level);
    return level;
  };

  for (const document of documents) levelOf(document.path);

  const perLevel = new Map<number, number>();
  const nodes = documents.map((document) => {
    const level = levels.get(document.path) ?? 0;
    const index_ = perLevel.get(level) ?? 0;
    perLevel.set(level, index_ + 1);

    return {
      path: document.path,
      title: document.meta.title ?? document.path,
      level,
      index: index_,
      tags: document.meta.tags,
      formulaCount: document.formulas.length,
      exerciseCount: document.exercises.length,
      scriptCount: document.scriptCount,
    };
  });

  return { nodes, edges, levels: Math.max(...nodes.map((n) => n.level), 0) + 1 };
}

/**
 * Kolejność nauki: dokumenty ułożone tak, by każdy stał po swoich prerekwizytach.
 *
 * To jest ta sama myśl co walkthrough wewnątrz dokumentu, tylko o piętro wyżej —
 * i tak samo wychodzi z grafu za darmo.
 */
export function learningOrder(index: KnowledgeIndex): KnowledgeDocument[] {
  const layout = layoutKnowledgeGraph(index);
  const byPath = new Map(index.documents.map((d) => [d.path, d] as const));

  return [...layout.nodes]
    .sort((a, b) => (a.level - b.level) || a.title.localeCompare(b.title, 'pl'))
    .map((node) => byPath.get(node.path)!)
    .filter(Boolean);
}

/**
 * Polska odmiana rzeczownika przy liczebniku.
 *
 * „1 wzór", „2 wzory", „5 wzorów" — reguła jest ta sama dla wszystkich
 * rzeczowników, więc formy podaje wołający, a wybór należy tutaj. Bez tego
 * każdy widok robiłby to po swojemu i prędzej czy później napisałby
 * „1 zadań".
 */
export function odmiana(n: number, formy: [string, string, string]): string {
  if (n === 1) return formy[0];
  const reszta = n % 10;
  const dziesiatki = n % 100;
  const maloMnoga = reszta >= 2 && reszta <= 4 && (dziesiatki < 10 || dziesiatki >= 20);
  return maloMnoga ? formy[1] : formy[2];
}

/** Wszystkie tagi w bazie z liczbą dokumentów — do chmury tagów. */
export function tagCounts(index: KnowledgeIndex): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const document of index.documents) {
    for (const tag of document.meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pl'));
}
