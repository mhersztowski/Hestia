/**
 * CadSceneAdapter.ts — rysunek CAD widziany przez wspólne API.
 *
 * Trudniejszy niż scena 3D, bo model **nie jest drzewem**: `EntityRegistry` to
 * płaska mapa encji, a warstwy to osobna lista. Drzewa nie ma czego opakować —
 * trzeba je pokazać.
 *
 * Robimy to bez dokładania stanu: **warstwa jest rodzicem swoich encji**.
 * `root > warstwa > encja`. To nie jest sztuczka na potrzeby API — tak wygląda
 * panel warstw i tak myśli o rysunku osoba, która go robi. Encja i tak nosi
 * `layerId`, więc drzewo jest tylko innym widokiem tej samej informacji i nie da
 * się go rozsynchronizować.
 *
 * Czego **nie** ma: zagnieżdżania encji w encjach. W CAD 2D nic takiego nie
 * istnieje, a udawanie hierarchii, której model nie zna, kończy się API
 * obiecującym operacje bez pokrycia.
 */
import type { Entity, EntityInput, Layer, Project } from '@hestia/ui-cad/cad2d';
import type { ILayer, INode, IScene, NodeData, SceneChange, SceneKind } from './types';
import { obejdzDrzewo, sciezkaWezla, wolnaNazwa, znajdzPoSciezce, znajdzWezly } from './helpers';

/** Pola encji, które opisują jej miejsce, a nie kształt. */
const POLA_TECHNICZNE = new Set(['id', 'layerId', 'boundingBox']);

/**
 * Kształty, które rysunek zna.
 *
 * Rejestr encji przyjmuje **dowolny** obiekt z polem `type` i nie sprawdza go —
 * bez tej listy `nodeCreate({ type: 'mesh' })` tworzyłoby w rysunku 2D encję,
 * której żadne narzędzie nie umie narysować ani zapisać. Lepsza szczera odmowa
 * niż obiekt-widmo.
 */
const ZNANE_KSZTALTY = new Set<string>([
  'line', 'circle', 'polyline', 'rect', 'arc', 'ellipse', 'point',
  'text', 'image', 'dimension', 'box3d', 'cylinder3d', 'sphere3d', 'freehand',
]);

class CadEntityNode implements INode {
  constructor(private scena: CadScene, readonly id: string) {}

  private get encja(): Entity | null {
    return this.scena.project.entityRegistry.get(this.id) ?? null;
  }

  private get zywa(): Entity {
    const e = this.encja;
    if (!e) throw new Error(`Encja „${this.id}" nie istnieje już w rysunku.`);
    return e;
  }

  isAlive(): boolean { return this.encja !== null; }

  /**
   * Nazwa encji.
   *
   * Model CAD-a nie ma pola „nazwa" — encja to kształt, nie obiekt sceny.
   * Trzymamy ją więc w `metadata`, a gdy jej nie ma, składamy z rodzaju
   * i skróconego identyfikatora: `linia-4f3a`. Bez nazwy ścieżka byłaby pusta,
   * a `getNode` bezużyteczny.
   */
  getName(): string {
    const e = this.encja;
    if (!e) return '';
    const meta = (e as unknown as { metadata?: Record<string, unknown> }).metadata;
    const wlasna = meta?.name;
    return typeof wlasna === 'string' && wlasna ? wlasna : `${e.type}-${e.id.slice(0, 4)}`;
  }

  setName(name: string): void {
    const rodzic = this.getParent();
    const rodzenstwo = (rodzic?.getChildren() ?? []).filter((n) => n.id !== this.id);
    const wolna = wolnaNazwa(rodzenstwo, name);

    const e = this.zywa;
    const meta = { ...((e as unknown as { metadata?: Record<string, unknown> }).metadata ?? {}), name: wolna };
    this.scena.project.entityRegistry.update(this.id, { metadata: meta } as Partial<Entity>);
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }

  getPath(): string { return sciezkaWezla(this); }

  getParent(): INode | null {
    const e = this.encja;
    if (!e) return null;
    return this.scena.warstwaWezel(e.layerId ?? '0');
  }

  /** Przeniesienie encji = zmiana warstwy. Innego zagnieżdżenia CAD 2D nie zna. */
  setParent(parent: INode | null): void {
    const warstwaId = parent && this.scena.jestWarstwa(parent.id) ? parent.id : '0';
    this.scena.project.entityRegistry.update(this.id, { layerId: warstwaId } as Partial<Entity>);
    this.scena.powiadom({ kind: 'moved', nodeId: this.id });
  }

  /** Encja nie ma dzieci — w CAD 2D kształt nie zawiera kształtów. */
  getChildren(): INode[] { return []; }

  getData(): NodeData {
    const e = this.zywa;
    const out: NodeData = { type: e.type };
    for (const [pole, wartosc] of Object.entries(e as unknown as Record<string, unknown>)) {
      if (!POLA_TECHNICZNE.has(pole)) out[pole] = wartosc;
    }
    return out;
  }

  update(data: Partial<NodeData>): void {
    const { type, ...reszta } = data;
    // Rodzaj encji jest jej tożsamością: linia nie staje się okręgiem przez
    // podmianę pola, tylko przez usunięcie i narysowanie na nowo.
    void type;
    this.scena.project.entityRegistry.update(this.id, reszta as Partial<Entity>);
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }
}

class CadLayerNode implements ILayer {
  constructor(private scena: CadScene, readonly id: string) {}

  private get warstwa(): Layer | null {
    return this.scena.project.layerSystem.getAll().find((l) => l.id === this.id) ?? null;
  }

  isAlive(): boolean { return this.warstwa !== null; }

  getName(): string { return this.warstwa?.name ?? ''; }

  setName(name: string): void {
    const inne = this.scena.getLayers().filter((l) => l.id !== this.id);
    this.scena.project.layerSystem.update(this.id, { name: wolnaNazwa(inne, name) });
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }

  getPath(): string { return sciezkaWezla(this); }

  getParent(): INode | null { return this.scena.getRoot(); }
  setParent(): void { /* warstwa jest zawsze bezpośrednio pod korzeniem */ }

  getChildren(): INode[] {
    return this.scena.project.entityRegistry.getAll()
      .filter((e) => (e.layerId ?? '0') === this.id)
      .map((e) => this.scena.encjaWezel(e.id));
  }

  getData(): NodeData {
    const w = this.warstwa;
    return {
      type: 'layer',
      name: w?.name ?? '',
      color: w?.color ?? '',
      visible: w?.visible ?? true,
      locked: w?.locked ?? false,
    };
  }

  update(data: Partial<NodeData>): void {
    const { type, ...reszta } = data;
    void type;
    this.scena.project.layerSystem.update(this.id, reszta as Partial<Layer>);
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }

  getVisible(): boolean { return this.warstwa?.visible ?? true; }

  setVisible(visible: boolean): void {
    this.scena.project.layerSystem.update(this.id, { visible });
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }

  isLocked(): boolean { return this.warstwa?.locked ?? false; }

  setLocked(locked: boolean): void {
    this.scena.project.layerSystem.update(this.id, { locked });
    this.scena.powiadom({ kind: 'updated', nodeId: this.id });
  }

  getColor(): string | null { return this.warstwa?.color ?? null; }
}

class CadRoot implements INode {
  constructor(private scena: CadScene) {}
  readonly id = '__root__';
  isAlive(): boolean { return true; }
  getName(): string { return 'rysunek'; }
  setName(): void { /* korzeń nie wchodzi do ścieżek */ }
  getPath(): string { return ''; }
  getParent(): INode | null { return null; }
  setParent(): void { /* korzenia nie da się przenieść */ }
  getChildren(): INode[] { return this.scena.getLayers(); }
  getData(): NodeData { return { type: 'root' }; }
  update(): void { /* korzeń nie niesie danych */ }
}

export class CadScene implements IScene {
  readonly kind: SceneKind = 'cad';

  private korzen = new CadRoot(this);
  private uchwytyEncji = new Map<string, CadEntityNode>();
  private uchwytyWarstw = new Map<string, CadLayerNode>();
  private sluchacze = new Set<(z: SceneChange) => void>();

  constructor(readonly project: Project) {}

  encjaWezel(id: string): CadEntityNode {
    const istniejacy = this.uchwytyEncji.get(id);
    if (istniejacy) return istniejacy;
    const nowy = new CadEntityNode(this, id);
    this.uchwytyEncji.set(id, nowy);
    return nowy;
  }

  warstwaWezel(id: string): CadLayerNode {
    const istniejacy = this.uchwytyWarstw.get(id);
    if (istniejacy) return istniejacy;
    const nowy = new CadLayerNode(this, id);
    this.uchwytyWarstw.set(id, nowy);
    return nowy;
  }

  jestWarstwa(id: string): boolean {
    return this.project.layerSystem.getAll().some((l) => l.id === id);
  }

  powiadom(zmiana: SceneChange): void {
    for (const sluchacz of this.sluchacze) sluchacz(zmiana);
  }

  getRoot(): INode { return this.korzen; }

  getNodeById(id: string): INode | null {
    if (this.jestWarstwa(id)) return this.warstwaWezel(id);
    return this.project.entityRegistry.get(id) ? this.encjaWezel(id) : null;
  }

  getNode(path: string): INode | null { return znajdzPoSciezce(this, path); }

  getNodeIdByPath(path: string): string | null { return this.getNode(path)?.id ?? null; }

  nodeCreate(data: NodeData, parent?: INode | null): INode | null {
    const { type, ...reszta } = data;
    if (!type || type === 'root') return null;

    if (type === 'layer') {
      const istniejace = this.getLayers();
      const warstwa = this.project.layerSystem.add({
        name: wolnaNazwa(istniejace, (reszta.name as string) ?? 'Warstwa'),
        color: (reszta.color as string) ?? '#ffffff',
        lineType: 'solid',
        lineWidth: 1,
        visible: true,
        locked: false,
      });
      this.powiadom({ kind: 'created', nodeId: warstwa.id });
      return this.warstwaWezel(warstwa.id);
    }

    const warstwaId = parent && this.jestWarstwa(parent.id)
      ? parent.id
      : this.project.layerSystem.getActiveId();

    // Nieznany rodzaj kształtu to „nie umiem", a nie awaria: skrypt pisany dla
    // sceny 3D ma prawo spróbować utworzyć siatkę w rysunku 2D.
    if (!ZNANE_KSZTALTY.has(type)) return null;

    let encja: Entity;
    try {
      encja = this.project.entityRegistry.add({ ...reszta, type, layerId: warstwaId } as EntityInput);
    } catch {
      return null;
    }

    this.powiadom({ kind: 'created', nodeId: encja.id });
    return this.encjaWezel(encja.id);
  }

  nodeDelete(id: string): boolean {
    if (this.jestWarstwa(id)) {
      this.project.layerSystem.remove(id);
      // `remove` nic nie zwraca, a warstwy domyślnej usunąć się nie da —
      // pytamy więc model, czy naprawdę zniknęła, zamiast zakładać.
      if (this.jestWarstwa(id)) return false;
      this.uchwytyWarstw.delete(id);
      this.powiadom({ kind: 'deleted', nodeId: id });
      return true;
    }

    if (!this.project.entityRegistry.get(id)) return false;
    this.project.entityRegistry.remove(id);
    this.uchwytyEncji.delete(id);
    this.powiadom({ kind: 'deleted', nodeId: id });
    return true;
  }

  getAllNodes(): INode[] { return obejdzDrzewo(this.korzen); }

  find(predicate: (node: INode) => boolean): INode[] { return znajdzWezly(this, predicate); }

  getLayers(): ILayer[] {
    return this.project.layerSystem.getAll().map((l) => this.warstwaWezel(l.id));
  }

  getSelection(): INode[] {
    return this.project.selectionManager.getSelected()
      .map((id) => this.getNodeById(id))
      .filter((n): n is INode => n !== null);
  }

  setSelection(nodes: INode[]): void {
    this.project.selectionManager.clear();
    for (const node of nodes) this.project.selectionManager.select(node.id, true);
  }

  subscribe(listener: (change: SceneChange) => void): () => void {
    this.sluchacze.add(listener);
    return () => { this.sluchacze.delete(listener); };
  }
}
