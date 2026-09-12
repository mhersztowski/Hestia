/**
 * uiLayout.ts — tłumaczenie poddrzewa interfejsu na dokument layoutu.
 *
 * Węzły sceny opisują **intencję**, a the layout solver liczy z niej pozycje.
 * Ten plik jest jedynym miejscem, gdzie te dwa światy się spotykają, i dlatego
 * jedynym, które trzeba poprawić, gdy dojdzie nowa własność widżetu.
 *
 * Najważniejsza decyzja jest tu jedna: **identyfikatorem kształtu jest nazwa
 * węzła**, a nie jego identyfikator techniczny. Bez tego wyrażenie musiałoby
 * brzmieć `4f3a9c12-….x` — czyli nie dałoby się go napisać ręcznie, a cała
 * warstwa wyrażeń byłaby ozdobą. Nazwa nadaje się do tego tylko wtedy, gdy jest
 * jednoznaczna i wygląda jak identyfikator; w pozostałych przypadkach wracamy do
 * identyfikatora technicznego i **mówimy o tym wprost**, zamiast po cichu
 * wybierać jeden z dwóch widżetów o tej samej nazwie.
 */
import {
  applyDrag, expr, lit, previewDrag, snapToGrid, solveLayout,
  type Constraint, type LayoutDoc, type LayoutResult, type ParamValue, type Shape,
} from '../../layout';
import type { SceneNode } from '../scene/SceneNode';
import { UiRootNode, UiWidgetNode } from './UiNodes';

export interface UiDocResult {
  doc: LayoutDoc;
  /** Kształt → węzeł. Potrzebne przy zapisie wyniku przeciągania z powrotem do sceny. */
  nodeIdByShape: Record<string, string>;
  /** Węzeł → kształt. Potrzebne, gdy zaznaczenie przychodzi z drzewa. */
  shapeByNodeId: Record<string, string>;
  issues: string[];
}

const IDENTYFIKATOR = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Liczba albo wyrażenie — rozstrzygamy przy budowie dokumentu, nie przy edycji. */
function wartosc(tekst: string): ParamValue {
  const t = (tekst ?? '').trim();
  if (t === '') return lit(0);
  const liczba = Number(t);
  return Number.isFinite(liczba) ? lit(liczba) : expr(t);
}

/** Widoczne dzieci-widżety, w kolejności z drzewa — przepływ tej kolejności używa. */
function widzety(node: SceneNode): UiWidgetNode[] {
  return node.children.filter((c): c is UiWidgetNode => c instanceof UiWidgetNode && c.visible);
}

function wszystkie(root: UiRootNode): UiWidgetNode[] {
  const out: UiWidgetNode[] = [];
  const zejdz = (n: SceneNode) => {
    for (const w of widzety(n)) {
      out.push(w);
      zejdz(w);
    }
  };
  zejdz(root);
  return out;
}

export function buildUiDoc(root: UiRootNode, viewport: { width: number; height: number }): UiDocResult {
  const issues: string[] = [];
  const lista = wszystkie(root);

  // Nazwa staje się identyfikatorem tylko wtedy, gdy wskazuje jednoznacznie.
  const ile = new Map<string, number>();
  for (const w of lista) ile.set(w.name, (ile.get(w.name) ?? 0) + 1);

  const shapeByNodeId: Record<string, string> = {};
  const nodeIdByShape: Record<string, string> = {};
  const zgloszone = new Set<string>();

  for (const w of lista) {
    const nadajeSie = IDENTYFIKATOR.test(w.name) && ile.get(w.name) === 1 && w.name !== 'parent' && w.name !== 'viewport';
    if (!nadajeSie && (ile.get(w.name) ?? 0) > 1 && !zgloszone.has(w.name)) {
      zgloszone.add(w.name);
      issues.push(`Nazwa „${w.name}" powtarza się, więc nie da się jej użyć w wyrażeniu. Zmień jedną z nich.`);
    }
    const id = nadajeSie ? w.name : w.id;
    shapeByNodeId[w.id] = id;
    nodeIdByShape[id] = w.id;
  }

  const shapes: Shape[] = lista.map((w) => {
    const rodzic = w.parent && w.parent instanceof UiWidgetNode ? shapeByNodeId[w.parent.id] : undefined;
    return {
      id: shapeByNodeId[w.id],
      ...(rodzic ? { parent: rodzic } : {}),
      label: w.name,
      x: wartosc(w.x),
      y: wartosc(w.y),
      w: wartosc(w.w),
      h: wartosc(w.h),
      ...(w.anchor ? { anchor: { ...w.anchor } } : {}),
      ...(w.flow ? { flow: { ...w.flow } } : {}),
      ...(w.container ? { container: { ...w.container } } : {}),
      data: {
        kind: w.kind,
        ...(w.text !== undefined ? { text: w.text } : {}),
        ...(w.color !== undefined ? { color: w.color } : {}),
        ...(w.value !== undefined ? { value: w.value } : {}),
      },
    };
  });

  const constraints: Constraint[] = [];
  for (const c of root.constraints) {
    const refs = c.refs.map((r) => shapeByNodeId[r] ?? r);
    const brak = refs.find((r) => !nodeIdByShape[r]);
    if (brak) {
      issues.push(`Więz „${c.id}" wskazuje widżet, którego już nie ma w warstwie.`);
      continue;
    }
    constraints.push({
      id: c.id,
      type: c.type as Constraint['type'],
      refs,
      ...(c.value !== undefined ? { value: wartosc(c.value) } : {}),
    });
  }

  return {
    doc: { mode: root.mode, viewport, vars: { ...root.vars }, shapes, constraints },
    nodeIdByShape,
    shapeByNodeId,
    issues,
  };
}

export interface UiLayoutResult extends LayoutResult {
  nodeIdByShape: Record<string, string>;
  shapeByNodeId: Record<string, string>;
  /** Prostokąty pod identyfikatorem **węzła** — tak pyta o nie drzewo i inspektor. */
  rectsByNodeId: Record<string, LayoutResult['rects'][string]>;
}

export function solveUiLayout(root: UiRootNode, viewport: { width: number; height: number }): UiLayoutResult {
  const { doc, nodeIdByShape, shapeByNodeId, issues } = buildUiDoc(root, viewport);
  const wynik = solveLayout(doc);

  const rectsByNodeId: UiLayoutResult['rectsByNodeId'] = {};
  for (const [shapeId, rect] of Object.entries(wynik.rects)) {
    const nodeId = nodeIdByShape[shapeId];
    if (nodeId) rectsByNodeId[nodeId] = rect;
  }

  return { ...wynik, issues: [...issues, ...wynik.issues], nodeIdByShape, shapeByNodeId, rectsByNodeId };
}

/** Pierwsza warstwa interfejsu w scenie — edytor prawie zawsze pyta o tę jedną. */
export function findUiRoot(node: SceneNode): UiRootNode | null {
  if (node instanceof UiRootNode) return node;
  for (const dziecko of node.children) {
    const znalezione = findUiRoot(dziecko);
    if (znalezione) return znalezione;
  }
  return null;
}

export function findAllUiRoots(node: SceneNode): UiRootNode[] {
  const out: UiRootNode[] = [];
  const zejdz = (n: SceneNode) => {
    if (n instanceof UiRootNode) out.push(n);
    else n.children.forEach(zejdz);
  };
  zejdz(node);
  return out;
}

/**
 * Przeciągnięcie widżetu w widoku.
 *
 * Ruch myszą znaczy co innego w każdym trybie — nową liczbę, zmianę odstępu
 * kotwicy, nic (w przepływie) albo nowy stan całego układu (przy więzach).
 * Rozstrzyga to `applyDrag` w pakiecie layoutu; tutaj zostaje **zapisanie
 * wyniku z powrotem do węzłów**, żeby scena i widok nie rozjechały się o jeden
 * ruch.
 *
 * Zapisujemy tylko te wielkości, które w węźle są liczbą. Pole opisane
 * wyrażeniem ma swoje źródło i nadpisanie go liczbą zerwałoby po cichu
 * powiązanie, którego autor nie kazał zrywać — dlatego takie pole zostaje, a
 * widżet nie idzie za ręką. To jest informacja, nie usterka.
 */
export interface UiDragResult {
  rects: Record<string, LayoutResult['rects'][string]>;
  /** Gdy ruch nie ma prawa nic zmienić — powód, zamiast cichego zignorowania. */
  odmowa?: string;
  /** Gdy ruch zmienił mniej, niż wskazywał kursor — wynik i tak jest zapisany. */
  uwaga?: string;
}

const LICZBA = /^\s*-?(\d+\.?\d*|\.\d+)\s*$/;

export function applyUiDrag(
  root: UiRootNode,
  nodeId: string,
  cel: { x: number; y: number },
  viewport: { width: number; height: number },
  opcje: { preview?: boolean; grid?: number } = {},
): UiDragResult {
  const { doc, nodeIdByShape, shapeByNodeId } = buildUiDoc(root, viewport);
  const shapeId = shapeByNodeId[nodeId];
  if (!shapeId) return { rects: solveLayout(doc).rects };

  const punkt = snapToGrid(cel, opcje.grid ?? 0);
  const biezace = solveLayout(doc).rects;

  if (opcje.preview) {
    return { rects: previewDrag(doc, shapeId, punkt, biezace) };
  }

  const skutek = applyDrag(doc, shapeId, punkt, biezace);
  if (skutek.odmowa) return { rects: biezace, odmowa: skutek.odmowa };

  const wynik = solveLayout(skutek.doc);
  // Adnotacja krotki jest konieczna: bez niej TS wnioskuje `(string | Shape)[]`
  // zamiast `[string, Shape]`, przez co wartość Mapy degeneruje się do `{}`
  // i znikają pola `anchor`/`x`/`y`/`w`/`h` (błąd dts builda w tsup).
  const poId = new Map(skutek.doc.shapes.map((s): [string, Shape] => [s.id, s]));

  for (const [shape, node] of Object.entries(nodeIdByShape)) {
    const nowy = poId.get(shape);
    const wezel = znajdzWidzet(root, node);
    if (!nowy || !wezel) continue;

    if (nowy.anchor) {
      wezel.setProperty('ui.anchor', nowy.anchor);
      continue;
    }
    for (const pole of ['x', 'y', 'w', 'h'] as const) {
      const wartoscNowa = nowy[pole];
      // Wyrażenie zostaje wyrażeniem: literał w wyniku bierze się z tego, że
      // solver liczbę wyliczył, a nie z tego, że autor kazał ją wpisać.
      if (wartoscNowa.src !== 'literal' || !LICZBA.test(wezel[pole])) continue;
      const zaokraglona = String(Math.round(wartoscNowa.value * 100) / 100);
      if (zaokraglona !== wezel[pole]) wezel.setProperty(`ui.${pole}`, zaokraglona);
    }
  }

  return { rects: wynik.rects, ...(skutek.uwaga ? { uwaga: skutek.uwaga } : {}) };
}

function znajdzWidzet(root: UiRootNode, id: string): UiWidgetNode | null {
  let znaleziony: UiWidgetNode | null = null;
  const zejdz = (n: SceneNode) => {
    for (const dziecko of n.children) {
      if (dziecko.id === id && dziecko instanceof UiWidgetNode) znaleziony = dziecko;
      zejdz(dziecko);
    }
  };
  zejdz(root);
  return znaleziony;
}
