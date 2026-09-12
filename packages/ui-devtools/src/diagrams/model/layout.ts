/**
 * layout.ts — pozycje dla diagramów, które ich nie niosą.
 *
 * Składnie tekstowe (Mermaid, PlantUML) nie zapisują współrzędnych — układ
 * wylicza renderer. Edytor graficzny musi od czegoś zacząć, więc liczymy układ
 * warstwowy: węzły bez wejść trafiają do warstwy 0, każdy kolejny o jedną dalej.
 *
 * **Układ jest hierarchiczny.** Diagram ze stanami złożonymi (`state X { … }`)
 * to graf grafów: najpierw układamy wnętrze każdej grupy, z niego bierzemy jej
 * rozmiar, a dopiero potem układamy poziom nadrzędny, traktując grupę jak jedno
 * duże pudełko. Pozycje wewnątrz grupy są **lokalne** — tego wymaga React Flow
 * dla węzłów z rodzicem i bez tego dzieci lądują poza swoją ramką, obszar
 * diagramu puchnie, a `fitView` oddala widok do maksimum.
 *
 * Algorytm jest celowo prosty (bez minimalizacji przecięć): ma dać czytelny
 * punkt startowy, a nie zastąpić dot/elk. Pozycję ustawioną przez użytkownika
 * zostawiamy nietkniętą.
 */
import type { DiagramDocument, DiagramDirection, DiagramGroup, DiagramNode } from './diagram';
import { estimateNodeSize } from './nodeSize';

export interface LayoutOptions {
  /** Odstęp między warstwami (wzdłuż kierunku przepływu). */
  rankGap?: number;
  /** Odstęp między elementami w tej samej warstwie. */
  nodeGap?: number;
  direction?: DiagramDirection;
}

/** Rozmiar zastępczy — używany tylko wtedy, gdy element zniknął z mapy rozmiarów. */
const FALLBACK_NODE = { width: 150, height: 52 };
/** Margines wewnątrz grupy; górny większy, bo mieści podpis. */
const GROUP_PADDING = 36;
const GROUP_HEADER = 34;

interface Box { width: number; height: number }

/**
 * Krawędzie wsteczne — te, które zamykają cykl.
 *
 * Wyznaczamy je przeglądaniem w głąb: krawędź prowadząca do wierzchołka
 * będącego na aktualnym stosie DFS domyka cykl. Kolejność startów jest
 * deterministyczna (najpierw wierzchołki bez wejść, potem reszta w kolejności
 * podania), żeby układ nie zmieniał się między uruchomieniami.
 */
function findBackEdges(
  ids: string[],
  edges: Array<{ source: string; target: string }>,
): Set<number> {
  const outgoing = new Map<string, Array<{ index: number; target: string }>>();
  ids.forEach((id) => outgoing.set(id, []));
  edges.forEach((e, index) => outgoing.get(e.source)?.push({ index, target: e.target }));

  const back = new Set<number>();
  const state = new Map<string, 0 | 1 | 2>(); // 0 = nietknięty, 1 = na stosie, 2 = zamknięty

  const visit = (start: string) => {
    // Iteracyjnie, bo diagramy bywają głębokie, a rekurencja w przeglądarce
    // ma twardy limit stosu.
    const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const list = outgoing.get(frame.id) ?? [];
      if (frame.next >= list.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const { index, target } = list[frame.next++];
      if (target === frame.id) { back.add(index); continue; }   // pętla własna
      const st = state.get(target) ?? 0;
      if (st === 1) back.add(index);                            // domyka cykl
      else if (st === 0) { state.set(target, 1); stack.push({ id: target, next: 0 }); }
    }
  };

  const hasIncoming = new Set(edges.map((e) => e.target));
  for (const id of ids) if (!hasIncoming.has(id) && (state.get(id) ?? 0) === 0) visit(id);
  for (const id of ids) if ((state.get(id) ?? 0) === 0) visit(id);
  return back;
}

/**
 * Numer warstwy dla każdego elementu.
 *
 * Cykle są w diagramach stanów normalne (`DeepSleep --> Boot`), a naiwne
 * liczenie najdłuższej ścieżki spychałoby po nich węzły coraz niżej: stan tuż
 * za startem lądował kilkanaście warstw w dół i diagram rozciągał się na
 * tysiące pikseli. Dlatego krawędzie domykające cykl są przy rankingu
 * pomijane — dokładnie jak w układzie warstwowym Sugiyamy. W widoku i tak są
 * rysowane, tyle że jako powroty w górę.
 */
export function computeRanks(
  ids: string[],
  edges: Array<{ source: string; target: string }>,
): Map<string, number> {
  const rank = new Map<string, number>(ids.map((id) => [id, 0]));
  const back = findBackEdges(ids, edges);
  const forward = edges.filter((_, index) => !back.has(index));

  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const edge of forward) {
      if (edge.source === edge.target) continue;
      const from = rank.get(edge.source);
      const to = rank.get(edge.target);
      if (from === undefined || to === undefined) continue;
      if (to < from + 1) { rank.set(edge.target, from + 1); changed = true; }
    }
    if (!changed) break;
  }
  return rank;
}

/** Ile razy przechodzimy diagram, wygładzając rozmieszczenie w warstwach. */
const BARYCENTER_PASSES = 4;

/**
 * Rozmieszcza elementy o znanych rozmiarach w warstwach.
 * Zwraca pozycje lewego górnego rogu, liczone od (0, 0).
 *
 * Pozycja w poprzek warstwy jest wyznaczana **barycentrycznie**: element ciąży
 * ku środkowi swoich sąsiadów z sąsiedniej warstwy. Bez tego kroku wszystko
 * ustawiało się w jednej kolumnie — rozgałęzienia nie rozchodziły się na boki, a
 * strzałki krzyżowały bez potrzeby. To ten sam pomysł, którego używa dagre pod
 * spodem Mermaida.
 */
function placeInRanks(
  items: Array<{ id: string; box: Box }>,
  edges: Array<{ source: string; target: string }>,
  direction: DiagramDirection,
  rankGap: number,
  nodeGap: number,
): Map<string, { x: number; y: number }> {
  const ranks = computeRanks(items.map((i) => i.id), edges);
  const byRank = new Map<number, Array<{ id: string; box: Box }>>();
  for (const item of items) {
    const r = ranks.get(item.id) ?? 0;
    const list = byRank.get(r) ?? [];
    list.push(item);
    byRank.set(r, list);
  }

  const horizontal = direction === 'LR' || direction === 'RL';
  const flip = direction === 'BT' || direction === 'RL' ? -1 : 1;
  const sizeAcross = (box: Box) => (horizontal ? box.height : box.width);

  const rankNumbers = [...byRank.keys()].sort((a, b) => a - b);
  /** Środek elementu w poprzek warstwy — na tym pracuje wygładzanie. */
  const center = new Map<string, number>();

  // Start: elementy warstwy ustawione po kolei.
  for (const rank of rankNumbers) {
    let cursor = 0;
    for (const item of byRank.get(rank)!) {
      center.set(item.id, cursor + sizeAcross(item.box) / 2);
      cursor += sizeAcross(item.box) + nodeGap;
    }
  }

  const neighbours = (id: string, otherRank: number): string[] => {
    const out: string[] = [];
    for (const edge of edges) {
      if (edge.source === edge.target) continue;
      if (edge.source === id && ranks.get(edge.target) === otherRank) out.push(edge.target);
      if (edge.target === id && ranks.get(edge.source) === otherRank) out.push(edge.source);
    }
    return out;
  };

  /** Jedno przejście: ustaw środki wg sąsiadów, potem rozsuń kolizje. */
  const relax = (order: number[], neighbourOffset: number) => {
    for (const rank of order) {
      const list = byRank.get(rank)!;
      const wanted = new Map<string, number>();
      for (const item of list) {
        const near = neighbours(item.id, rank + neighbourOffset)
          .map((id) => center.get(id))
          .filter((v): v is number => v !== undefined);
        // Brak sąsiadów w tamtej warstwie = zostaw tam, gdzie jest.
        wanted.set(item.id, near.length ? near.reduce((a, b) => a + b, 0) / near.length : center.get(item.id)!);
      }

      const sorted = [...list].sort((a, b) => wanted.get(a.id)! - wanted.get(b.id)!);
      // Rozsuwanie od lewej: element nie może zacząć się przed końcem poprzednika.
      let edgeOfPrevious = -Infinity;
      for (const item of sorted) {
        const half = sizeAcross(item.box) / 2;
        const target = Math.max(wanted.get(item.id)!, edgeOfPrevious + nodeGap + half);
        center.set(item.id, target);
        edgeOfPrevious = target + half;
      }

      // Rozsuwanie spycha wszystko w prawo, więc warstwa jako całość odjeżdża od
      // celu: dwoje dzieci jednego rodzica lądowało obok niego, a nie wokół
      // niego. Cofamy blok o średnie odchylenie — kolejność i odstępy zostają.
      const drift = sorted.reduce((sum, item) => sum + (center.get(item.id)! - wanted.get(item.id)!), 0) / sorted.length;
      if (drift !== 0) for (const item of sorted) center.set(item.id, center.get(item.id)! - drift);
    }
  };

  for (let pass = 0; pass < BARYCENTER_PASSES; pass++) {
    // Na przemian w dół i w górę — pojedynczy kierunek zostawia skrajną
    // warstwę bez wpływu na resztę.
    relax(rankNumbers, -1);
    relax([...rankNumbers].reverse(), +1);
  }
  // Domknięcie przebiegiem w dół: przejście w górę ustawia warstwy według
  // NASTĘPNIKÓW, więc kończąc na nim rozjeżdżamy to, co przed chwilą ustawiły
  // poprzedniki (zejście dwóch gałęzi przestaje trafiać na środek).
  relax(rankNumbers, -1);

  // Normalizacja: najmniejszy element trafia na 0, żeby diagram nie zaczynał się
  // od ujemnych współrzędnych (React Flow to zniesie, ale czyta się gorzej).
  let minAcross = Infinity;
  for (const item of items) minAcross = Math.min(minAcross, center.get(item.id)! - sizeAcross(item.box) / 2);
  const shift = Number.isFinite(minAcross) ? -minAcross : 0;

  const positions = new Map<string, { x: number; y: number }>();
  let along = 0;
  for (const rank of rankNumbers) {
    const list = byRank.get(rank)!;
    let thickest = 0;
    for (const item of list) {
      const across = center.get(item.id)! - sizeAcross(item.box) / 2 + shift;
      positions.set(item.id, horizontal
        ? { x: along * flip, y: across }
        : { x: across, y: along * flip });
      thickest = Math.max(thickest, horizontal ? item.box.width : item.box.height);
    }
    // Warstwy odsuwamy o rozmiar najgrubszego elementu — inaczej grupa (duże
    // pudełko) nachodziłaby na sąsiednie warstwy.
    along += thickest + rankGap;
  }
  return positions;
}

/** Rozmiar grupy wyliczony z rozmieszczonych dzieci. */
function boxOfChildren(positions: Map<string, { x: number; y: number }>, boxes: Map<string, Box>): Box {
  let maxX = 0;
  let maxY = 0;
  for (const [id, pos] of positions) {
    const box = boxes.get(id) ?? FALLBACK_NODE;
    maxX = Math.max(maxX, pos.x + box.width);
    maxY = Math.max(maxY, pos.y + box.height);
  }
  return {
    width: Math.max(maxX + GROUP_PADDING * 2, 180),
    height: Math.max(maxY + GROUP_PADDING + GROUP_HEADER, 120),
  };
}

/**
 * Uzupełnia brakujące pozycje węzłów oraz pozycje i rozmiary grup.
 * Istniejące pozycje zostają nietknięte — to one są pracą użytkownika.
 */
export function autoLayout(doc: DiagramDocument, options: LayoutOptions = {}): DiagramDocument {
  const { rankGap = 90, nodeGap = 40 } = options;
  const direction = options.direction ?? doc.direction;

  const nodePositions = new Map<string, { x: number; y: number }>();
  const groupPositions = new Map<string, { x: number; y: number }>();
  const groupBoxes = new Map<string, Box>();

  /** Elementy bezpośrednio w danym pojemniku (grupa albo płótno). */
  const childNodes = (parentId?: string) => doc.nodes.filter((n) => n.parentId === parentId);
  const childGroups = (parentId?: string) => doc.groups.filter((g) => g.parentId === parentId);

  /**
   * Element najwyższego poziomu w obrębie pojemnika: węzeł albo grupa go zawierająca.
   *
   * Sam koniec krawędzi też bywa grupą (`Wifi --> Mqtt` w diagramie stanów).
   * Szukanie wyłącznie wśród węzłów odrzucało takie przejście, więc wnętrze
   * stanu złożonego traciło zależności i układało się w jednym rzędzie.
   */
  const containerOf = (id: string, within: string | undefined): string | undefined => {
    const node = doc.nodes.find((n) => n.id === id);
    const self = doc.groups.find((g) => g.id === id);
    if (!node && !self) return undefined;
    let current = node ? node.parentId : self!.parentId;
    if (current === within) return id;
    while (current) {
      const group = doc.groups.find((g) => g.id === current);
      if (!group) return undefined;
      if (group.parentId === within) return group.id;
      current = group.parentId;
    }
    return undefined;
  };

  /**
   * Układa zawartość jednego pojemnika i zwraca jego rozmiar.
   * Rekurencja idzie od środka: rozmiar grupy znamy dopiero po ułożeniu wnętrza.
   */
  const layoutContainer = (parentId: string | undefined, dir: DiagramDirection): Box => {
    const groups = childGroups(parentId);
    // Najpierw wnętrza grup — stąd biorą się ich rozmiary.
    for (const group of groups) {
      // Kierunek NIE dziedziczy się po grupie nadrzędnej: `direction LR`
      // postawiony w stanie złożonym dotyczy tylko jego własnej zawartości, a
      // stan zagnieżdżony głębiej wraca do kierunku diagramu — tak układa to
      // Mermaid. Dziedziczenie kładło wnętrze poziomo, choć w podglądzie
      // biegło w dół.
      groupBoxes.set(group.id, layoutContainer(group.id, group.direction ?? direction));
    }

    const items: Array<{ id: string; box: Box }> = [
      ...childNodes(parentId).map((n) => ({ id: n.id, box: sizeOfNode(n) })),
      ...groups.map((g) => ({ id: g.id, box: groupBoxes.get(g.id)! })),
    ];

    // Krawędzie rzutowane na poziom pojemnika: przejście do węzła w grupie
    // przyciąga całą grupę, a nie pojedynczy stan w środku.
    const edges = doc.edges
      .map((e) => ({ source: containerOf(e.source, parentId), target: containerOf(e.target, parentId) }))
      .filter((e): e is { source: string; target: string } => Boolean(e.source && e.target && e.source !== e.target));

    const placed = placeInRanks(items, edges, dir, rankGap, nodeGap);
    const offset = parentId ? GROUP_PADDING : 0;
    const offsetTop = parentId ? GROUP_HEADER : 0;

    for (const [id, pos] of placed) {
      const point = { x: pos.x + offset, y: pos.y + offsetTop };
      if (doc.groups.some((g) => g.id === id)) groupPositions.set(id, point);
      else nodePositions.set(id, point);
    }

    return boxOfChildren(placed, new Map(items.map((i) => [i.id, i.box])));
  };

  layoutContainer(undefined, direction);

  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.position ? n : { ...n, position: nodePositions.get(n.id) ?? { x: 0, y: 0 } })),
    groups: doc.groups.map((g): DiagramGroup => ({
      ...g,
      position: g.position ?? groupPositions.get(g.id) ?? { x: 0, y: 0 },
      size: g.size ?? groupBoxes.get(g.id) ?? { width: 200, height: 140 },
    })),
  };
}

/**
 * Rozmiar używany przy rozsuwaniu.
 *
 * Liczony z długości etykiety (`estimateNodeSize`), a nie stały: przy stałej
 * szerokości stany z dłuższym opisem nachodziły na sąsiadów.
 */
function sizeOfNode(node: DiagramNode): Box {
  return estimateNodeSize(node);
}
