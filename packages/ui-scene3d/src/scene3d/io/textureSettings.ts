/**
 * textureSettings.ts — sposób nakładania tekstury, przeniesiony razem z obrazem.
 *
 * Obraz to nie wszystko, co plik mówi o teksturze. Mówi jeszcze, **co robić
 * poza jej brzegiem** — a to bywa różnica między modelem pokrytym wzorem
 * a modelem w jednolitym kolorze.
 *
 * Tak przepadał `BoxTextured.glb`: jego współrzędne biegną od 0 do 6, bo obraz
 * ma się powtórzyć sześć razy na ścianie. Plik zapisuje przy teksturze
 * `wrapS/wrapT = REPEAT`, ale `THREE.TextureLoader` domyślnie **przycina do
 * krawędzi**. Przy przycinaniu każda współrzędna powyżej 1 pobiera piksel
 * z brzegu obrazu — a że brzeg był tam jednolicie szary, cała bryła wychodziła
 * gładko szara. Tekstura nakładała się przez cały czas; tylko w kółko ten sam
 * narożny piksel. Objaw nie do odróżnienia od „tekstura się nie wczytała",
 * i dlatego szukaliśmy jej wcześniej w zupełnie innym miejscu.
 *
 * `flipY` z tego samego powodu: glTF liczy współrzędne od górnego rogu i loader
 * ustawia `flipY = false`. Przepisując obraz zachowujemy jego orientację, więc
 * ustawienie trzeba przenieść razem z nim — inaczej tekstura wchodzi odbita
 * w pionie.
 */
import * as THREE from 'three';
import type { TextureSettings, TextureWrap } from '../nodes/MeshNode';

const NA_THREE: Record<TextureWrap, THREE.Wrapping> = {
  clamp: THREE.ClampToEdgeWrapping,
  repeat: THREE.RepeatWrapping,
  mirror: THREE.MirroredRepeatWrapping,
};

const Z_THREE = new Map<THREE.Wrapping, TextureWrap>([
  [THREE.ClampToEdgeWrapping, 'clamp'],
  [THREE.RepeatWrapping, 'repeat'],
  [THREE.MirroredRepeatWrapping, 'mirror'],
]);

/**
 * Zdejmuje z wczytanej tekstury to, czego nie niesie sam obraz.
 *
 * Zwraca `undefined`, gdy wszystko jest domyślne — pusty obiekt w każdym
 * materiale rozdmuchiwałby zapis sceny bez żadnej treści.
 */
export function odczytajUstawienia(t: THREE.Texture | null | undefined): TextureSettings | undefined {
  if (!t) return undefined;

  const u: TextureSettings = {};

  const wrapS = Z_THREE.get(t.wrapS);
  const wrapT = Z_THREE.get(t.wrapT);
  if (wrapS && wrapS !== 'clamp') u.wrapS = wrapS;
  if (wrapT && wrapT !== 'clamp') u.wrapT = wrapT;

  if (t.repeat && (t.repeat.x !== 1 || t.repeat.y !== 1)) u.repeat = [t.repeat.x, t.repeat.y];
  if (t.offset && (t.offset.x !== 0 || t.offset.y !== 0)) u.offset = [t.offset.x, t.offset.y];

  // Zapisujemy tylko odstępstwo od domyślnego `true`, bo tylko ono coś znaczy.
  if (t.flipY === false) u.flipY = false;

  return Object.keys(u).length ? u : undefined;
}

/** Nakłada zapisane ustawienia na świeżo wczytaną teksturę. */
export function zastosujUstawienia(t: THREE.Texture, u: TextureSettings | undefined): void {
  if (!u) return;

  if (u.wrapS) t.wrapS = NA_THREE[u.wrapS];
  if (u.wrapT) t.wrapT = NA_THREE[u.wrapT];
  if (u.repeat) t.repeat.set(u.repeat[0], u.repeat[1]);
  if (u.offset) t.offset.set(u.offset[0], u.offset[1]);
  if (u.flipY !== undefined) t.flipY = u.flipY;

  t.needsUpdate = true;
}
