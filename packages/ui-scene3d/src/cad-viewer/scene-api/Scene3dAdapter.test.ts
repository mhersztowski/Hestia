import { describe, it, expect } from 'vitest';
import { SceneGraph } from '../../scene3d';
import { Scene3dScene } from './Scene3dAdapter';
import { sprawdzKontraktSceny } from './kontrakt';

sprawdzKontraktSceny('scena 3D', {
  fabryka: () => new Scene3dScene(new SceneGraph()),
  przykladowyObiekt: () => ({ type: 'mesh', name: 'Kostka' }),
  przykladowaZmiana: () => ({ castShadow: true }),
  maTransformacje: true,
});

describe('scena 3D — poza kontraktem', () => {
  it('uchwyt tego samego węzła jest tym samym obiektem', () => {
    const scena = new Scene3dScene(new SceneGraph());
    const node = scena.nodeCreate({ type: 'mesh', name: 'A' })!;
    expect(scena.getNodeById(node.id)).toBe(node);
  });

  it('przeniesienie w drzewie zmienia ścieżkę', () => {
    const scena = new Scene3dScene(new SceneGraph());
    const grupa = scena.nodeCreate({ type: 'group', name: 'Grupa' })!;
    const siatka = scena.nodeCreate({ type: 'mesh', name: 'Kostka' })!;

    siatka.setParent(grupa);
    expect(siatka.getPath()).toBe('Grupa/Kostka');
    expect(scena.getNode('Grupa/Kostka')?.id).toBe(siatka.id);
  });

  it('nieznany rodzaj obiektu to `null`, a nie wyjątek', () => {
    const scena = new Scene3dScene(new SceneGraph());
    expect(scena.nodeCreate({ type: 'czegos-takiego-nie-ma' })).toBeNull();
  });

  it('scena 3D nie udaje, że ma warstwy', () => {
    // Grupy porządkują drzewo, ale nie mają blokady ani barwy warstwy.
    expect(new Scene3dScene(new SceneGraph()).getLayers()).toEqual([]);
  });
});
