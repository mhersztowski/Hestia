/**
 * types.ts — wspólny sposób mówienia o scenie, niezależnie od trybu edytora.
 *
 * W aplikacji jest dziś sześć rodzajów sceny (CAD 2D, CAD 3D, scena 3D, Lego,
 * elektronika, mapa) i **każdy ma własny model danych**: płaską mapę encji,
 * drzewo węzłów, drzewo operacji. To jest w porządku — te modele są różne, bo
 * opisują różne rzeczy.
 *
 * Problem zaczyna się przy narzędziach, które mają działać na *dowolnej* scenie:
 * skrypty, agent AI, szablony, eksport, podgląd. Dziś `SceneScriptApi` jest
 * przywiązane do `SceneGraph`, więc skrypt napisany dla sceny 3D nie ma jak
 * dotknąć rysunku CAD, choć robiłby dokładnie to samo: znajdź obiekt, zmień
 * wielkość, dodaj kolejny.
 *
 * Ten plik opisuje **najmniejsze wspólne pojęcia**: scena zawiera drzewo węzłów,
 * węzeł ma nazwę, miejsce w drzewie i dane. Wszystko poza tym — układ
 * współrzędnych, materiały, historia operacji — zostaje w modelach właściwych
 * dla trybu i jest dostępne przez `getData()`.
 *
 * **Czego tu świadomie nie ma:** operacji, które nie mają sensu w każdym trybie.
 * Wspólne API, które w połowie przypadków rzuca „nieobsługiwane", jest gorsze
 * od braku wspólnego API — bo wygląda na obietnicę.
 */

/** Rodzaj sceny — po nim narzędzie poznaje, czego może się spodziewać. */
export type SceneKind = 'cad' | 'cad3d' | 'scene3d' | 'lego' | 'electronics' | 'map';

/**
 * Dane obiektu — kształt właściwy dla trybu.
 *
 * Pole `type` jest **obowiązkowe** i rozstrzyga o reszcie: `'line'` w CAD,
 * `'mesh'` w scenie 3D. Bez niego odbiorca musiałby zgadywać po obecności pól,
 * a to psuje się przy pierwszym rozszerzeniu modelu.
 */
export interface NodeData {
  type: string;
  [pole: string]: unknown;
}

/** Położenie, obrót i skala — wspólne dla wszystkiego, co stoi w przestrzeni. */
export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface INode {
  readonly id: string;

  getName(): string;
  setName(name: string): void;

  /**
   * Ścieżka od korzenia, np. `Warstwa 0/linia-3`.
   *
   * **Tylko do odczytu.** Ścieżka wynika z nazwy i miejsca w drzewie; osobny
   * setter byłby drugim źródłem prawdy i pierwszą rzeczą, która się rozjedzie.
   * Przeniesienie węzła to `setParent`, zmiana nazwy to `setName`.
   */
  getPath(): string;

  getParent(): INode | null;
  /** Przeniesienie w drzewie; `null` przenosi pod korzeń. */
  setParent(parent: INode | null): void;

  getChildren(): INode[];

  /** Dane obiektu — kopia, nie podgląd na model. */
  getData(): NodeData;
  /** Zmiana wybranych pól; pola pominięte zostają bez zmian. */
  update(data: Partial<NodeData>): void;

  /** Czy węzeł nadal istnieje w scenie — po usunięciu uchwyt zostaje w rękach skryptu. */
  isAlive(): boolean;
}

/**
 * Węzeł osadzony w przestrzeni.
 *
 * Osobno od `INode`, bo nie każdy węzeł ma położenie: warstwa CAD-a, grupa
 * porządkowa i operacja w drzewie cech go nie mają. Wciśnięcie transformacji do
 * `INode` zmusiłoby połowę implementacji do zwracania zer i udawania.
 */
export interface INode3D extends INode {
  getTransform(): Transform;
  setTransform(transform: Partial<Transform>): void;

  getVisible(): boolean;
  setVisible(visible: boolean): void;

  /** Znacznik do wyszukiwania — „lampa", „element ruchomy". */
  getTag(): string | null;
  setTag(tag: string | null): void;
}

export function isNode3D(node: INode): node is INode3D {
  return typeof (node as INode3D).getTransform === 'function';
}

/**
 * Warstwa.
 *
 * **Nie jest osobnym bytem, tylko węzłem** — w CAD warstwa jest rodzicem encji,
 * w scenie 3D tę samą rolę pełni grupa. Dwa mechanizmy na to samo znaczyłyby, że
 * narzędzie musi pytać, w którym trybie działa, zanim cokolwiek zrobi.
 */
export interface ILayer extends INode {
  getVisible(): boolean;
  setVisible(visible: boolean): void;
  isLocked(): boolean;
  setLocked(locked: boolean): void;
  getColor(): string | null;
}

export function isLayer(node: INode): node is ILayer {
  return typeof (node as ILayer).isLocked === 'function';
}

/** Co się stało ze sceną — dla narzędzi, które mają nadążać za zmianami. */
export interface SceneChange {
  kind: 'created' | 'updated' | 'deleted' | 'moved' | 'reset';
  nodeId?: string;
}

export interface IScene {
  readonly kind: SceneKind;

  /** Korzeń drzewa; sam nie jest obiektem sceny i nie da się go usunąć. */
  getRoot(): INode;

  getNodeById(id: string): INode | null;
  getNode(path: string): INode | null;
  getNodeIdByPath(path: string): string | null;

  /**
   * Nowy obiekt. `null`, gdy tryb nie umie utworzyć obiektu tego rodzaju —
   * i to jest uczciwa odpowiedź, nie wyjątek: skrypt ma prawo próbować.
   */
  nodeCreate(data: NodeData, parent?: INode | null): INode | null;
  nodeDelete(id: string): boolean;

  /** Wszystkie węzły w kolejności drzewa, bez korzenia. */
  getAllNodes(): INode[];
  /** Węzły spełniające warunek — wygodne w skryptach i w wyszukiwaniu. */
  find(predicate: (node: INode) => boolean): INode[];

  getLayers(): ILayer[];

  getSelection(): INode[];
  setSelection(nodes: INode[]): void;

  /** Powiadomienia o zmianach; zwraca funkcję odsubskrybowania. */
  subscribe(listener: (change: SceneChange) => void): () => void;
}

export interface IEditor {
  getSceneKind(): SceneKind;
  getScene(): IScene;

  /**
   * Prośba o przerysowanie widoku.
   *
   * Potrzebna, bo część edytorów rysuje na żądanie, a nie w pętli klatek —
   * po zmianie z poziomu skryptu nikt inny nie wie, że trzeba odświeżyć.
   */
  invalidate(): void;
}
