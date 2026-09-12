import { describe, it, expect } from 'vitest';
import { SceneGraph } from '../scene/SceneGraph';
import { SceneSerializer } from '../serialization/SceneSerializer';
import { SceneDeserializer } from '../serialization/SceneDeserializer';
import { UiRootNode, UiWidgetNode, isUiNode } from './UiNodes';

describe('UiRootNode', () => {
  it('domyślnie nazywa się „UI Layer" i układa kotwicami', () => {
    const root = new UiRootNode();
    expect(root.name).toBe('UI Layer');
    expect(root.mode).toBe('anchor');
    expect(root.vars).toEqual({});
    expect(root.constraints).toEqual([]);
  });

  it('przyjmuje zmiany z inspektora po ścieżce „ui.*"', () => {
    const root = new UiRootNode();
    expect(root.setProperty('ui.mode', 'flow')).toBe(true);
    expect(root.mode).toBe('flow');
    expect(root.setProperty('ui.vars', { margines: 12 })).toBe(true);
    expect(root.vars.margines).toBe(12);
  });

  it('odrzuca tryb, którego nie zna — zamiast zapisać śmieć', () => {
    const root = new UiRootNode();
    root.setProperty('ui.mode', 'kwadratura-kola');
    expect(root.mode).toBe('anchor');
  });
});

describe('UiWidgetNode', () => {
  it('bierze nazwę od rodzaju widżetu', () => {
    expect(new UiWidgetNode({ kind: 'button' }).name).toBe('Button');
    expect(new UiWidgetNode({ kind: 'bar' }).name).toBe('Bar');
  });

  it('trzyma położenie jako tekst, bo to może być wyrażenie', () => {
    const w = new UiWidgetNode({ kind: 'panel', x: 'margines * 2', w: '120' });
    expect(w.x).toBe('margines * 2');
    expect(w.w).toBe('120');
  });

  it('przyjmuje zmiany pól i kotwicy z inspektora', () => {
    const w = new UiWidgetNode({ kind: 'button' });
    expect(w.setProperty('ui.x', 'parent.w - 120')).toBe(true);
    expect(w.x).toBe('parent.w - 120');
    expect(w.setProperty('ui.anchor.minX', 1)).toBe(true);
    expect(w.anchor?.minX).toBe(1);
    expect(w.setProperty('ui.flow.grow', 2)).toBe(true);
    expect(w.flow?.grow).toBe(2);
  });

  it('ustawienie kotwicy zakłada komplet pól — połowa kotwicy nie znaczy nic', () => {
    const w = new UiWidgetNode({ kind: 'panel' });
    w.setProperty('ui.anchor.maxY', 1);
    expect(w.anchor).toEqual({
      minX: 0, maxX: 0, minY: 0, maxY: 1,
      offsetLeft: 0, offsetTop: 0, offsetRight: 0, offsetBottom: 0,
    });
  });
});

describe('zapis razem ze sceną', () => {
  it('warstwa interfejsu przeżywa zapis i odczyt', () => {
    const graph = new SceneGraph();
    const root = new UiRootNode({ id: 'ui', mode: 'constraint', vars: { odstep: 24 } });
    root.constraints = [{ id: 'c1', type: 'alignLeft', refs: ['a', 'b'] }];
    graph.addNode(root);

    const panel = new UiWidgetNode({ id: 'a', kind: 'panel', x: '10', y: '10', w: '200', h: '80' });
    const guzik = new UiWidgetNode({ id: 'b', kind: 'button', text: 'OK', color: '#2f6fb0' });
    guzik.anchor = { minX: 1, maxX: 1, minY: 1, maxY: 1, offsetLeft: -120, offsetTop: -48, offsetRight: -16, offsetBottom: -16 };
    graph.addNode(panel, 'ui');
    graph.addNode(guzik, 'ui');

    const odczytany = SceneDeserializer.deserialize(SceneSerializer.serialize(graph));
    const r = odczytany.findNode('ui') as UiRootNode;
    const b = odczytany.findNode('b') as UiWidgetNode;

    expect(r).toBeInstanceOf(UiRootNode);
    expect(r.mode).toBe('constraint');
    expect(r.vars.odstep).toBe(24);
    expect(r.constraints[0].refs).toEqual(['a', 'b']);

    expect(b).toBeInstanceOf(UiWidgetNode);
    expect(b.kind).toBe('button');
    expect(b.text).toBe('OK');
    expect(b.anchor?.offsetRight).toBe(-16);
    // Hierarchia interfejsu jest hierarchią sceny — nie ma drugiego drzewa.
    expect(b.parent?.id).toBe('ui');
    expect(r.children).toHaveLength(2);
  });
});

describe('rozpoznawanie węzłów interfejsu', () => {
  it('odróżnia je od reszty sceny', () => {
    expect(isUiNode(new UiRootNode())).toBe(true);
    expect(isUiNode(new UiWidgetNode({ kind: 'label' }))).toBe(true);
    expect(isUiNode(new SceneGraph().root)).toBe(false);
  });
});
