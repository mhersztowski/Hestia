import { describe, it, expect } from 'vitest';
import { SceneGraph } from '../scene/SceneGraph';
import { UiRootNode, UiWidgetNode } from './UiNodes';
import { applyUiDrag, buildUiDoc, solveUiLayout } from './uiLayout';

const OBSZAR = { width: 800, height: 600 };

function warstwa(mode: 'static' | 'anchor' | 'flow' | 'constraint' = 'static') {
  const graph = new SceneGraph();
  const root = new UiRootNode({ id: 'ui', mode });
  graph.addNode(root);
  return { graph, root };
}

describe('graf sceny → dokument layoutu', () => {
  it('nazwa węzła jest identyfikatorem, po którym odwołują się wyrażenia', () => {
    const { root } = warstwa();
    const naglowek = new UiWidgetNode({ id: 'n1', name: 'naglowek', kind: 'label', x: '10', y: '10', w: '200', h: '24' });
    const guzik = new UiWidgetNode({ id: 'n2', name: 'guzik', kind: 'button', x: 'naglowek.x', y: 'naglowek.y + naglowek.h + 8', w: '120', h: '32' });
    root.addChild(naglowek);
    root.addChild(guzik);

    const wynik = solveUiLayout(root, OBSZAR);
    expect(wynik.issues).toEqual([]);
    // Prostokąty pod identyfikatorem węzła — w `rects` kluczem jest nazwa,
    // bo to ona jest identyfikatorem kształtu.
    expect(wynik.rectsByNodeId.n2.y).toBe(42);
    expect(wynik.rectsByNodeId.n2.x).toBe(10);
  });

  it('powtórzona nazwa nie może być identyfikatorem — mówi to wprost', () => {
    const { root } = warstwa();
    root.addChild(new UiWidgetNode({ id: 'a', name: 'guzik', kind: 'button' }));
    root.addChild(new UiWidgetNode({ id: 'b', name: 'guzik', kind: 'button' }));

    const { doc, issues } = buildUiDoc(root, OBSZAR);
    // Obydwa dostają identyfikator techniczny: gdyby jeden dostał nazwę, wybór
    // byłby przypadkowy, a wyrażenie wskazywałoby raz na ten, raz na tamten.
    expect(doc.shapes.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(issues.join(' ')).toMatch(/guzik/);
  });

  it('nazwa ze spacją nie jest identyfikatorem — używamy technicznego', () => {
    const { root } = warstwa();
    root.addChild(new UiWidgetNode({ id: 'x', name: 'pasek górny', kind: 'panel' }));
    expect(buildUiDoc(root, OBSZAR).doc.shapes[0].id).toBe('x');
  });

  it('zagnieżdżenie w drzewie jest zagnieżdżeniem w layoucie', () => {
    const { root } = warstwa();
    const panel = new UiWidgetNode({ id: 'p', name: 'panel', kind: 'panel', x: '0', y: '0', w: '400', h: '300' });
    const dziecko = new UiWidgetNode({ id: 'd', name: 'dziecko', kind: 'button', x: 'parent.w / 2', y: '0', w: '10', h: '10' });
    root.addChild(panel);
    panel.addChild(dziecko);

    expect(buildUiDoc(root, OBSZAR).doc.shapes.find((s) => s.id === 'dziecko')?.parent).toBe('panel');
    expect(solveUiLayout(root, OBSZAR).rectsByNodeId.d.x).toBe(200);
  });

  it('obszar jest rodzicem widżetów najwyższego poziomu', () => {
    const { root } = warstwa();
    root.addChild(new UiWidgetNode({ id: 'x', name: 'pas', kind: 'panel', x: '0', y: '0', w: 'parent.w', h: '40' }));
    expect(solveUiLayout(root, OBSZAR).rectsByNodeId.x.w).toBe(800);
  });

  it('parametry warstwy widać w polach widżetów', () => {
    const { root } = warstwa();
    root.vars = { margines: 16 };
    root.addChild(new UiWidgetNode({ id: 'x', name: 'p', kind: 'panel', x: 'margines', y: 'margines * 2', w: '10', h: '10' }));
    const r = solveUiLayout(root, OBSZAR).rectsByNodeId.x;
    expect([r.x, r.y]).toEqual([16, 32]);
  });

  it('więzy odwołują się do widżetów tak samo jak wyrażenia', () => {
    const { root } = warstwa('constraint');
    root.addChild(new UiWidgetNode({ id: 'a', name: 'a', kind: 'panel', x: '0', y: '0', w: '100', h: '40' }));
    root.addChild(new UiWidgetNode({ id: 'b', name: 'b', kind: 'button', x: '300', y: '200', w: '100', h: '40' }));
    root.constraints = [
      { id: 'c0', type: 'fixed', refs: ['a'] },
      { id: 'c1', type: 'alignLeft', refs: ['a', 'b'] },
    ];

    const wynik = solveUiLayout(root, OBSZAR);
    expect(wynik.rectsByNodeId.b.x).toBeCloseTo(0, 3);
    expect(wynik.dof).toBeGreaterThan(0);
  });

  it('rodzaj widżetu jedzie obok layoutu i nie wpływa na pozycję', () => {
    const { root } = warstwa();
    root.addChild(new UiWidgetNode({ id: 'x', name: 'g', kind: 'bar', x: '5', y: '5', w: '80', h: '12', value: 0.5, color: '#abc' }));
    const shape = buildUiDoc(root, OBSZAR).doc.shapes[0];
    expect(shape.data).toMatchObject({ kind: 'bar', value: 0.5, color: '#abc' });
    expect(shape.x).toEqual({ src: 'literal', value: 5 });
  });

  it('puste pole nie wywraca dokumentu — czytamy je jako zero', () => {
    const { root } = warstwa();
    root.addChild(new UiWidgetNode({ id: 'x', name: 'g', kind: 'panel', x: '', y: '0', w: '10', h: '10' }));
    expect(solveUiLayout(root, OBSZAR).rectsByNodeId.x.x).toBe(0);
  });

  it('niewidoczny widżet nie wchodzi do układu', () => {
    const { root } = warstwa('flow');
    const panel = new UiWidgetNode({ id: 'p', name: 'p', kind: 'panel', x: '0', y: '0', w: '300', h: '100' });
    panel.container = { direction: 'row', gap: 10, padding: 0 };
    root.addChild(panel);
    const a = new UiWidgetNode({ id: 'a', name: 'a', kind: 'button', w: '50', h: '20' });
    const b = new UiWidgetNode({ id: 'b', name: 'b', kind: 'button', w: '50', h: '20' });
    b.visible = false;
    panel.addChild(a);
    panel.addChild(b);

    const { doc } = buildUiDoc(root, OBSZAR);
    // Ukryty widżet zajmowałby miejsce w rzędzie, mimo że go nie widać —
    // wyglądałoby to jak dziura bez przyczyny.
    expect(doc.shapes.map((s) => s.id)).toEqual(['p', 'a']);
  });
});

describe('przeciąganie widżetu zapisuje się do węzłów', () => {
  const widzet = (id: string, dane: Record<string, unknown> = {}) =>
    new UiWidgetNode({ id, name: id, kind: 'panel', x: '0', y: '0', w: '100', h: '40', ...dane });

  it('w układzie statycznym zapisuje nowe położenie', () => {
    const { root } = warstwa();
    const w = widzet('a');
    root.addChild(w);

    applyUiDrag(root, 'a', { x: 120, y: 60 }, OBSZAR);
    expect([w.x, w.y]).toEqual(['120', '60']);
  });

  it('nie nadpisuje pola opisanego wyrażeniem', () => {
    const { root } = warstwa();
    root.vars = { m: 10 };
    const w = widzet('a', { x: 'm * 2' });
    root.addChild(w);

    applyUiDrag(root, 'a', { x: 300, y: 50 }, OBSZAR);
    expect(w.x).toBe('m * 2');
    expect(w.y).toBe('50');
  });

  it('siatka dosuwa cel, a nie rysunek', () => {
    const { root } = warstwa();
    const w = widzet('a');
    root.addChild(w);

    applyUiDrag(root, 'a', { x: 123, y: 47 }, OBSZAR, { grid: 10 });
    expect([w.x, w.y]).toEqual(['120', '50']);
  });

  it('podgląd nic nie zapisuje', () => {
    const { root } = warstwa();
    const w = widzet('a');
    root.addChild(w);

    const wynik = applyUiDrag(root, 'a', { x: 200, y: 100 }, OBSZAR, { preview: true });
    expect(wynik.rects.a.x).toBe(200);
    expect(w.x).toBe('0');
  });

  it('w przepływie odmawia i tłumaczy dlaczego', () => {
    const { root } = warstwa('flow');
    const panel = widzet('p', { w: '300', h: '100' });
    panel.container = { direction: 'row', gap: 8, padding: 0 };
    const dziecko = widzet('a', { w: '50', h: '20' });
    root.addChild(panel);
    panel.addChild(dziecko);

    const wynik = applyUiDrag(root, 'a', { x: 200, y: 200 }, OBSZAR);
    expect(wynik.odmowa).toMatch(/przepływ/);
    expect(dziecko.x).toBe('0');
  });

  it('przy kotwicach zmienia odstępy, a przypięcie zostaje przypięciem', () => {
    const { root } = warstwa('anchor');
    const w = widzet('a');
    w.anchor = { minX: 1, maxX: 1, minY: 0, maxY: 0, offsetLeft: -120, offsetTop: 10, offsetRight: -20, offsetBottom: 50 };
    root.addChild(w);

    applyUiDrag(root, 'a', { x: 600, y: 80 }, OBSZAR);
    expect(w.anchor!.minX).toBe(1);
    expect(solveUiLayout(root, OBSZAR).rectsByNodeId.a.x).toBeCloseTo(600, 6);
  });

  it('przy więzach zapisuje także sąsiada, który poszedł za nim', () => {
    const { root } = warstwa('constraint');
    const a = widzet('a');
    const b = widzet('b', { y: '200' });
    root.addChild(a);
    root.addChild(b);
    root.constraints = [{ id: 'c', type: 'distanceY', refs: ['a', 'b'], value: '200' }];

    applyUiDrag(root, 'a', { x: 0, y: 50 }, OBSZAR);
    expect(Number(b.y) - Number(a.y)).toBeCloseTo(200, 3);
    expect(Number(a.y)).toBeGreaterThan(0);
  });
});
