import { describe, it, expect } from 'vitest';
import { Project } from '@hestia/ui-cad/cad2d';
import { CadScene } from './CadSceneAdapter';
import { sprawdzKontraktSceny } from './kontrakt';

sprawdzKontraktSceny('rysunek CAD', {
  fabryka: () => new CadScene(new Project()),
  przykladowyObiekt: () => ({ type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
  przykladowaZmiana: () => ({ end: { x: 20, y: 5 } }),
  maWarstwy: true,
});

describe('rysunek CAD — poza kontraktem', () => {
  it('encja leży pod swoją warstwą, a nie luzem w korzeniu', () => {
    const scena = new CadScene(new Project());
    const linia = scena.nodeCreate({ type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })!;

    const warstwa = scena.getLayers()[0];
    expect(linia.getParent()?.id).toBe(warstwa.id);
    expect(warstwa.getChildren().map((n) => n.id)).toContain(linia.id);
  });

  it('przeniesienie encji to zmiana warstwy — innego zagnieżdżenia CAD nie zna', () => {
    const scena = new CadScene(new Project());
    const druga = scena.nodeCreate({ type: 'layer', name: 'Pomocnicza' })!;
    const linia = scena.nodeCreate({ type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })!;

    linia.setParent(druga);
    expect(linia.getParent()?.id).toBe(druga.id);
    expect(linia.getData().layerId).toBeUndefined();
  });

  it('encja bez nazwy dostaje czytelną, złożoną z rodzaju', () => {
    const scena = new CadScene(new Project());
    const linia = scena.nodeCreate({ type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })!;
    expect(linia.getName()).toMatch(/^line-/);
  });

  it('warstwy da się blokować — tego scena 3D nie ma', () => {
    const warstwa = new CadScene(new Project()).getLayers()[0];
    warstwa.setLocked(true);
    expect(warstwa.isLocked()).toBe(true);
  });

  it('kształt nieznany rysunkowi to `null`', () => {
    expect(new CadScene(new Project()).nodeCreate({ type: 'mesh' })).toBeNull();
  });

  it('encja nie ma dzieci — kształt nie zawiera kształtów', () => {
    const scena = new CadScene(new Project());
    const linia = scena.nodeCreate({ type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })!;
    expect(linia.getChildren()).toEqual([]);
  });
});
