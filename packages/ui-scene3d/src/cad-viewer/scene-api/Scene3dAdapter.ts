/**
 * Scene3dAdapter.ts — `SceneGraph` widziany przez wspólne API.
 *
 * Najprostszy z adapterów, bo model jest już drzewem: adapter tylko tłumaczy
 * nazwy metod i **nie trzyma własnego stanu**. Każde pytanie idzie do grafu,
 * więc zmiana zrobiona z pominięciem adaptera (przez edytor, przez wczytanie
 * pliku) jest natychmiast widoczna — nie ma czego synchronizować.
 */
import { SceneGraph, SceneNode, MeshNode, LightNode, GroupNode, CameraNode } from '../../scene3d';
import type {
  ILayer,
  INode,
  INode3D,
  IScene,
  NodeData,
  SceneChange,
  SceneKind,
  Transform,
} from './types';
import { obejdzDrzewo, sciezkaWezla, wolnaNazwa, znajdzPoSciezce, znajdzWezly } from './helpers';

/** Pola węzła sceny, które nie są danymi obiektu, tylko jego miejscem w drzewie. */
const POLA_DRZEWA = new Set([
  'id',
  'name',
  'type',
  'children',
  'parent',
  'position',
  'rotation',
  'scale',
]);

class Scene3dNode implements INode3D {
  constructor(
    private scena: Scene3dScene,
    readonly id: string
  ) {}

  private get node(): SceneNode | null {
    return this.scena.graph.findNode(this.id) ?? null;
  }

  /** Węzeł albo wyjątek — wołane tam, gdzie brak węzła znaczy błąd wołającego. */
  private get zywy(): SceneNode {
    const n = this.node;
    if (!n) throw new Error(`Węzeł „${this.id}" nie istnieje już w scenie.`);
    return n;
  }

  isAlive(): boolean {
    return this.node !== null;
  }

  getName(): string {
    return this.node?.name ?? '';
  }

  setName(name: string): void {
    const n = this.zywy;
    const rodzenstwo = (n.parent?.children ?? []).filter((c) => c.id !== n.id);
    n.setProperty(
      'name',
      wolnaNazwa(
        rodzenstwo.map((c) => this.scena.wezel(c.id)),
        name
      )
    );
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }

  getPath(): string {
    return sciezkaWezla(this);
  }

  getParent(): INode | null {
    const rodzic = this.node?.parent;
    // Korzeń grafu jest korzeniem sceny — poza drzewem obiektów.
    if (!rodzic) return null;
    return rodzic.id === this.scena.graph.root.id
      ? this.scena.getRoot()
      : this.scena.wezel(rodzic.id);
  }

  setParent(parent: INode | null): void {
    this.scena.graph.moveNode(
      this.id,
      parent && parent.id !== this.scena.getRoot().id ? parent.id : undefined
    );
    this.scena.powiadom({ kind: 'moved', nodeId: this.id });
  }

  getChildren(): INode[] {
    return (this.node?.children ?? []).map((c) => this.scena.wezel(c.id));
  }

  getData(): NodeData {
    const n = this.zywy;
    const dane = n.toData() as unknown as Record<string, unknown>;
    const out: NodeData = { type: n.type };
    for (const [pole, wartosc] of Object.entries(dane)) {
      if (!POLA_DRZEWA.has(pole)) out[pole] = wartosc;
    }
    return out;
  }

  update(data: Partial<NodeData>): void {
    const n = this.zywy;
    for (const [pole, wartosc] of Object.entries(data)) {
      // `type` opisuje rodzaj węzła, a nie jego własność — zmiana rodzaju to
      // usunięcie i utworzenie na nowo, nie podmiana pola.
      if (pole === 'type') continue;
      n.setProperty(pole, wartosc);
    }
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }

  getTransform(): Transform {
    const n = this.zywy;
    return { position: [...n.position], rotation: [...n.rotation], scale: [...n.scale] };
  }

  setTransform(transform: Partial<Transform>): void {
    const n = this.zywy;
    // Przez `setProperty`, a nie zapisem do pól: to publiczne wejście modelu
    // i ono odpowiada za powiadomienie widoku o zmianie.
    if (transform.position) n.setProperty('position', [...transform.position]);
    if (transform.rotation) n.setProperty('rotation', [...transform.rotation]);
    if (transform.scale) n.setProperty('scale', [...transform.scale]);
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }

  getVisible(): boolean {
    return this.node?.visible ?? false;
  }

  setVisible(visible: boolean): void {
    this.zywy.setProperty('visible', visible);
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }

  getTag(): string | null {
    const meta = this.node?.metadata as Record<string, unknown> | undefined;
    return typeof meta?.tag === 'string' ? meta.tag : null;
  }

  setTag(tag: string | null): void {
    const n = this.zywy;
    n.metadata = { ...n.metadata, ...(tag === null ? { tag: undefined } : { tag }) };
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }
}

/** Korzeń: istnieje, żeby drzewo miało jeden początek, ale nie jest obiektem sceny. */
class Scene3dRoot implements INode {
  constructor(private scena: Scene3dScene) {}
  get id(): string {
    return this.scena.graph.root.id;
  }
  isAlive(): boolean {
    return true;
  }
  getName(): string {
    return this.scena.graph.root.name || 'scene';
  }
  setName(): void {
    /* korzeń nie ma nazwy do zmiany — nie wchodzi do ścieżek */
  }
  getPath(): string {
    return '';
  }
  getParent(): INode | null {
    return null;
  }
  setParent(): void {
    /* korzenia nie da się przenieść */
  }
  getChildren(): INode[] {
    return this.scena.graph.root.children.map((c) => this.scena.wezel(c.id));
  }
  getData(): NodeData {
    return { type: 'root' };
  }
  update(): void {
    /* korzeń nie niesie danych */
  }
}

export class Scene3dScene implements IScene {
  readonly kind: SceneKind;

  private korzen = new Scene3dRoot(this);
  private uchwyty = new Map<string, Scene3dNode>();
  private sluchacze = new Set<(z: SceneChange) => void>();
  private zaznaczenie: string[] = [];

  constructor(
    readonly graph: SceneGraph,
    kind: SceneKind = 'scene3d'
  ) {
    this.kind = kind;
  }

  /**
   * Uchwyt węzła — **ten sam obiekt dla tego samego identyfikatora**.
   *
   * Bez tego `scena.getNodeById(x) === scena.getNodeById(x)` byłoby fałszem
   * i porównania w kodzie wołającego przestałyby działać bez żadnego ostrzeżenia.
   */
  wezel(id: string): Scene3dNode {
    const istniejacy = this.uchwyty.get(id);
    if (istniejacy) return istniejacy;
    const nowy = new Scene3dNode(this, id);
    this.uchwyty.set(id, nowy);
    return nowy;
  }

  powiadom(zmiana: SceneChange): void {
    for (const sluchacz of this.sluchacze) sluchacz(zmiana);
  }

  getRoot(): INode {
    return this.korzen;
  }

  getNodeById(id: string): INode | null {
    return this.graph.findNode(id) ? this.wezel(id) : null;
  }

  getNode(path: string): INode | null {
    return znajdzPoSciezce(this, path);
  }

  getNodeIdByPath(path: string): string | null {
    return this.getNode(path)?.id ?? null;
  }

  nodeCreate(data: NodeData, parent?: INode | null): INode | null {
    const { type, ...reszta } = data;
    const wspolne = { ...reszta } as Record<string, unknown>;

    let node: SceneNode;
    switch (type) {
      case 'mesh':
        node = new MeshNode(wspolne as never);
        break;
      case 'light':
        node = new LightNode(wspolne as never);
        break;
      case 'camera':
        node = new CameraNode(wspolne as never);
        break;
      case 'group':
        node = new GroupNode(wspolne as never);
        break;
      default:
        return null;
    }

    const rodzicId = parent && parent.id !== this.korzen.id ? parent.id : undefined;
    this.graph.addNode(node, rodzicId);

    // Nazwa jednoznaczna wśród rodzeństwa — ścieżka ma wskazywać jeden węzeł.
    // Nadajemy ją wprost, bez `setName`: utworzenie obiektu jest **jednym**
    // zdarzeniem, a nie utworzeniem i zaraz po nim zmianą.
    const rodzenstwo = (node.parent?.children ?? []).filter((c) => c.id !== node.id);
    node.setProperty(
      'name',
      wolnaNazwa(
        rodzenstwo.map((c) => this.wezel(c.id)),
        node.name
      )
    );

    const uchwyt = this.wezel(node.id);
    this.powiadom({ kind: 'created', nodeId: node.id });
    return uchwyt;
  }

  nodeDelete(id: string): boolean {
    if (!this.graph.findNode(id)) return false;
    this.graph.removeNode(id);
    this.uchwyty.delete(id);
    this.zaznaczenie = this.zaznaczenie.filter((z) => z !== id);
    this.powiadom({ kind: 'deleted', nodeId: id });
    return true;
  }

  getAllNodes(): INode[] {
    return obejdzDrzewo(this.korzen);
  }

  find(predicate: (node: INode) => boolean): INode[] {
    return znajdzWezly(this, predicate);
  }

  /**
   * Scena 3D nie ma warstw w rozumieniu CAD-a.
   *
   * Grupy pełnią podobną rolę porządkującą, ale nie mają blokady ani barwy
   * warstwy — podawanie ich jako warstw obiecywałoby zachowanie, którego nie ma.
   */
  getLayers(): ILayer[] {
    return [];
  }

  getSelection(): INode[] {
    return this.zaznaczenie.map((id) => this.getNodeById(id)).filter((n): n is INode => n !== null);
  }

  setSelection(nodes: INode[]): void {
    this.zaznaczenie = nodes.map((n) => n.id);
  }

  subscribe(listener: (change: SceneChange) => void): () => void {
    this.sluchacze.add(listener);
    return () => {
      this.sluchacze.delete(listener);
    };
  }
}
