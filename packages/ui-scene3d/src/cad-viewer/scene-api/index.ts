/**
 * Wspólne API sceny — jeden sposób mówienia o CAD-zie, scenie 3D i reszcie.
 *
 * Punkt wejścia dla narzędzi, które mają działać na dowolnej scenie: skryptów,
 * agenta, szablonów, eksportu.
 */
export type {
  IEditor,
  IScene,
  INode,
  INode3D,
  ILayer,
  NodeData,
  SceneChange,
  SceneKind,
  Transform,
} from './types';
export { isNode3D, isLayer } from './types';

export { sciezkaWezla, obejdzDrzewo, znajdzPoSciezce, znajdzWezly, wolnaNazwa } from './helpers';

export { Scene3dScene } from './Scene3dAdapter';
export { CadScene } from './CadSceneAdapter';

/*
  `kontrakt.ts` **nie wychodzi tędy z premedytacją.** Importuje `vitest`, więc
  wystawienie go w głównym wejściu wciągało bibliotekę testową do bundla
  produkcyjnego — 54 wystąpienia w `dist/index.js`. Testy sięgają po niego
  ścieżką: `@hestia/ui-scene3d/src/cad-viewer/scene-api/kontrakt`.
*/
