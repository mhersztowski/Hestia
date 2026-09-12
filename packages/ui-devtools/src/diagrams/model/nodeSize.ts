/**
 * nodeSize.ts — szacowany rozmiar węzła dla potrzeb układu.
 *
 * Układ musi znać rozmiary, zanim cokolwiek trafi na ekran, więc mierzymy
 * szacunkowo z długości tekstu. Stała szerokość (tak było wcześniej) sprawiała,
 * że stany z dłuższym opisem nachodziły na sąsiadów — najbardziej w układzie
 * poziomym, gdzie sąsiedzi stoją tuż obok.
 *
 * Szacunek jest celowo ostrożny: lepiej zostawić trochę powietrza niż pozwolić,
 * by pudełka na siebie wchodziły.
 */
import type { DiagramNode, NodeShape } from './diagram';

/** Przybliżona szerokość znaku przy foncie 13 px używanym w węzłach. */
const CHAR_WIDTH = 7.2;
const PADDING_X = 28;
const LINE_HEIGHT = 18;
const PADDING_Y = 20;

const MIN_WIDTH = 96;
/** Powyżej tej szerokości tekst zawijamy zamiast rozciągać pudełko. */
const MAX_WIDTH = 320;

export interface NodeSize { width: number; height: number }

/** Kształty rysowane jako punkt — ich rozmiar nie zależy od tekstu. */
const FIXED: Partial<Record<NodeShape, NodeSize>> = {
  start: { width: 30, height: 30 },
  end: { width: 30, height: 30 },
  fork: { width: 110, height: 16 },
  join: { width: 110, height: 16 },
};

/** Wysokość nagłówka klasy (nazwa + ewentualna adnotacja) i wiersza składowej. */
const CLASS_HEADER = 34;
const MEMBER_LINE = 17;
const CLASS_PADDING_Y = 12;

export function estimateNodeSize(node: DiagramNode): NodeSize {
  const fixed = FIXED[node.shape];
  if (fixed) return fixed;

  // Encja: nagłówek + wiersz na atrybut, szerokość z najdłuższego zapisu.
  // Atrybuty stoją w kolumnach (typ / nazwa / klucz / komentarz), więc wiersz
  // zajmuje więcej niż sam `raw` — stąd zapas na odstępy między kolumnami.
  if (node.attributes) {
    const rows = node.attributes.map((a) => `${a.raw}    `);
    const longest = Math.max(node.label.length + 2, ...rows.map((r) => r.length), 0);
    const width = Math.min(Math.max(longest * CHAR_WIDTH + PADDING_X, MIN_WIDTH), MAX_WIDTH);
    const height = CLASS_HEADER + rows.length * MEMBER_LINE + CLASS_PADDING_Y;
    return { width: Math.round(width), height: Math.round(height) };
  }

  // Klasa ma ciało, więc rozmiar bierze się z listy składowych, nie z etykiety.
  // Szacunek z samej nazwy dawał pudełko wysokości jednej linii, w którym miało
  // się zmieścić kilkanaście pól — klasy nachodziły na siebie od pierwszej klatki.
  if (node.members) {
    const rows = node.members.map((m) => m.raw);
    const longest = Math.max(node.label.length + 2, ...rows.map((r) => r.length), 0);
    const width = Math.min(Math.max(longest * CHAR_WIDTH + PADDING_X, MIN_WIDTH), MAX_WIDTH);
    const height = CLASS_HEADER + rows.length * MEMBER_LINE
      + (node.stereotype ? MEMBER_LINE : 0) + CLASS_PADDING_Y;
    return { width: Math.round(width), height: Math.round(height) };
  }

  const text = node.label || node.id;
  const naturalWidth = text.length * CHAR_WIDTH + PADDING_X;
  const width = Math.min(Math.max(naturalWidth, MIN_WIDTH), MAX_WIDTH);

  // Ile linii zajmie tekst po zawinięciu do wyliczonej szerokości.
  const perLine = Math.max(Math.floor((width - PADDING_X) / CHAR_WIDTH), 1);
  const lines = Math.max(Math.ceil(text.length / perLine), 1);
  const height = lines * LINE_HEIGHT + PADDING_Y;

  // Kształty, w których tekst leży w figurze wpisanej, potrzebują zapasu:
  // romb i sześciokąt obcinają rogi, koło musi być kwadratem.
  if (node.shape === 'rhombus') return { width: Math.round(width * 1.45), height: Math.round(height * 1.6) };
  if (node.shape === 'hexagon' || node.shape === 'parallelogram' || node.shape === 'parallelogramAlt'
    || node.shape === 'trapezoid' || node.shape === 'trapezoidAlt' || node.shape === 'asymmetric') {
    return { width: Math.round(width * 1.2), height: Math.round(height * 1.15) };
  }
  // Walec ma wieńczącą elipsę u góry i dołu — tekst potrzebuje na nie miejsca.
  if (node.shape === 'cylinder') return { width: Math.round(width), height: Math.round(height * 1.5) };
  if (node.shape === 'circle' || node.shape === 'doubleCircle') {
    const side = Math.round(Math.max(width, height) * 1.05);
    return { width: side, height: side };
  }
  return { width: Math.round(width), height: Math.round(height) };
}
