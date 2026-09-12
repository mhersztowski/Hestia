/**
 * Sposób nakładania tekstury musi przeżyć drogę z pliku na model.
 *
 * Testy pilnują tej jednej rzeczy, która realnie zawiodła: tekstura wchodziła
 * poprawnie, a bryła i tak była jednolicie szara, bo zgubiliśmy `REPEAT`
 * i wszystkie współrzędne powyżej 1 lądowały na tym samym pikselu brzegu.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { odczytajUstawienia, zastosujUstawienia } from './textureSettings';

describe('ustawienia tekstury', () => {
  it('zapisuje powtarzanie, bo bez niego model wychodzi jednolity', () => {
    const t = new THREE.Texture();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;

    expect(odczytajUstawienia(t)).toEqual({ wrapS: 'repeat', wrapT: 'repeat' });
  });

  it('milczy, gdy wszystko jest domyślne', () => {
    // Pusty obiekt w każdym materiale rozdmuchiwałby zapis sceny bez treści.
    expect(odczytajUstawienia(new THREE.Texture())).toBeUndefined();
  });

  it('zapisuje odbicie w pionie, którego wymaga glTF', () => {
    const t = new THREE.Texture();
    t.flipY = false;

    expect(odczytajUstawienia(t)).toEqual({ flipY: false });
  });

  it('zapisuje krotność i przesunięcie', () => {
    const t = new THREE.Texture();
    t.repeat.set(4, 2);
    t.offset.set(0.5, 0.25);

    expect(odczytajUstawienia(t)).toEqual({ repeat: [4, 2], offset: [0.5, 0.25] });
  });

  it('nakłada powtarzanie na wczytaną teksturę', () => {
    const t = new THREE.Texture();
    zastosujUstawienia(t, { wrapS: 'repeat', wrapT: 'mirror' });

    expect(t.wrapS).toBe(THREE.RepeatWrapping);
    expect(t.wrapT).toBe(THREE.MirroredRepeatWrapping);
  });

  it('przechodzi tam i z powrotem bez zmiany znaczenia', () => {
    const zrodlo = new THREE.Texture();
    zrodlo.wrapS = THREE.RepeatWrapping;
    zrodlo.wrapT = THREE.RepeatWrapping;
    zrodlo.flipY = false;
    zrodlo.repeat.set(6, 6);

    const cel = new THREE.Texture();
    zastosujUstawienia(cel, odczytajUstawienia(zrodlo));

    expect(cel.wrapS).toBe(zrodlo.wrapS);
    expect(cel.wrapT).toBe(zrodlo.wrapT);
    expect(cel.flipY).toBe(false);
    expect([cel.repeat.x, cel.repeat.y]).toEqual([6, 6]);
  });

  it('nie rusza tekstury, gdy nie ma czego nałożyć', () => {
    const t = new THREE.Texture();
    zastosujUstawienia(t, undefined);

    expect(t.wrapS).toBe(THREE.ClampToEdgeWrapping);
  });
});
