/**
 * GLTFImporter.ts — wczytanie modelu glTF/GLB jako **poddrzewa sceny**.
 *
 * Format glTF opisuje scenę, nie bryłę: model samochodu to podwozie, cztery
 * koła i szyby, każde z własnym miejscem i materiałem. Import, który bierze
 * z tego jedną siatkę albo zastępuje geometrię prymitywem, oddaje coś, czego
 * autor modelu nigdy nie narysował.
 *
 * Poprzednia wersja tej klasy robiła obie te rzeczy naraz: przepisywała drzewo,
 * ale każdej siatce wpisywała `geometry: { type: 'box' }`, więc każdy model
 * wchodził jako zestaw sześcianów. Nie była nigdzie używana, więc nikt tego nie
 * zauważył.
 *
 * Dwie rzeczy są tu nieuniknione i widoczne w API:
 *
 *  • **Wczytywanie jest asynchroniczne.** `GLTFLoader.parse` woła callback, bo
 *    plik może odsyłać do zasobów zewnętrznych.
 *  • **`.gltf` bywa niekompletny.** Wariant tekstowy trzyma geometrię
 *    i tekstury w osobnych plikach obok; przy imporcie jednego pliku z dysku
 *    tych sąsiadów nie ma. Mówimy o tym wprost, zamiast pokazać pusty model.
 *    `.glb` niesie wszystko w sobie i tego problemu nie ma.
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { SceneGraph } from '../scene/SceneGraph';
import { MeshNode } from '../nodes/MeshNode';
import { LightNode } from '../nodes/LightNode';
import { GroupNode } from '../nodes/GroupNode';
import type { BufferGeometryData, MaterialDescriptor, MaterialMaps } from '../nodes/MeshNode';
import { dataUrlZObrazu, type OpcjeTekstury } from './textureData';
import { odczytajUstawienia } from './textureSettings';

export interface GLTFImportResult {
  graph: SceneGraph;
  /** Ile węzłów powstało — import bez informacji zwrotnej wygląda jak brak reakcji. */
  nodeCount: number;
  meshCount: number;
  animationCount: number;
  animationNames: string[];
  warnings: string[];
}

export function opiszMaterial(
  mat: THREE.Material | null | undefined,
  opcje: OpcjeTekstury,
  ostrzez: (tekst: string) => void,
): Partial<MaterialDescriptor> {
  if (!mat) return { color: '#cccccc', opacity: 1, wireframe: false };

  const standard = mat as THREE.MeshStandardMaterial;

  /*
    Mapa koloru z pliku.

    `.glb` niesie obraz w swoim buforze — po wczytaniu istnieje wyłącznie
    w pamięci i nie ma ścieżki ani adresu, którym dałoby się go wskazać.
    Przepisujemy go więc na `data:`, żeby scena była samowystarczalna tak samo
    jak plik, z którego przyszła. Bez tego model wchodzi biały, bez śladu po
    teksturze i bez wyjaśnienia.
  */
  const nazwaMat = mat.name || 'bez nazwy';
  let lacznieKb = 0;

  /** Przepisuje jedną mapę; `undefined`, gdy jej nie ma albo się nie udało. */
  const przepisz = (tekstura: THREE.Texture | null | undefined, opis: string): string | undefined => {
    if (!tekstura) return undefined;
    const wynik = dataUrlZObrazu(tekstura.image as { width?: number; height?: number } | undefined, opcje);
    if (!wynik.dataUrl) {
      ostrzez(`Nie udało się przenieść mapy ${opis} materiału „${nazwaMat}": ${wynik.powod ?? 'nieznany powód'}`);
      return undefined;
    }
    lacznieKb += wynik.kb;
    return wynik.dataUrl;
  };

  const textureDataUrl = przepisz(standard.map, 'koloru');

  // Pozostałe mapy PBR. Bez normalnej model wygląda płasko, bez chropowatości —
  // jednolicie błyszcząco; obie zmieniają wygląd bardziej niż sam kolor.
  const maps: MaterialMaps = {};
  const normal = przepisz(standard.normalMap, 'normalnych');
  const roughness = przepisz(standard.roughnessMap, 'chropowatości');
  const metalness = przepisz(standard.metalnessMap, 'metaliczności');
  const emissiveMap = przepisz(standard.emissiveMap, 'emisji');
  const ao = przepisz(standard.aoMap, 'przesłonięcia otoczenia');
  if (normal) maps.normal = normal;
  if (roughness) maps.roughness = roughness;
  if (metalness) maps.metalness = metalness;
  if (emissiveMap) maps.emissive = emissiveMap;
  if (ao) maps.ao = ao;

  // Waga liczona **łącznie**: pojedyncza mapa bywa niewinna, a pięć naraz
  // potrafi zamienić scenę w plik, którego nie da się otworzyć.
  if (lacznieKb > 2048) {
    ostrzez(
      `Materiał „${nazwaMat}" wnosi ${Math.round(lacznieKb / 1024)} MB tekstur do zapisu sceny. `
      + 'Rozważ mniejsze obrazy albo tekstury z plików na dysku.',
    );
  }
  // `getHexString()` zwraca „ff0000" bez krzyżyka — bez niego CSS i edytor
  // barwy w inspektorze dostają wartość, której nie rozumieją.
  const kolor = standard.color instanceof THREE.Color ? `#${standard.color.getHexString()}` : '#cccccc';

  return {
    color: kolor,
    opacity: mat.opacity ?? 1,
    transparent: mat.transparent ?? false,
    wireframe: false,
    // glTF opisuje powierzchnię metalicznością i chropowatością — pominięcie
    // ich zamienia lakier i metal w matowy plastik.
    ...(typeof standard.metalness === 'number' ? { metalness: standard.metalness } : {}),
    ...(typeof standard.roughness === 'number' ? { roughness: standard.roughness } : {}),
    ...(standard.emissive instanceof THREE.Color && standard.emissive.getHex() !== 0
      ? { emissive: `#${standard.emissive.getHexString()}` }
      : {}),
    ...(textureDataUrl ? { textureDataUrl } : {}),
    ...(Object.keys(maps).length ? { maps } : {}),
    /*
      Sposób nakładania bierzemy z **mapy koloru** — to ona rządzi wyglądem,
      a pliki nakładają pozostałe mapy tak samo.

      Bez tego ginie żądanie „powtórz obraz na ścianie": współrzędne powyżej 1
      trafiają wtedy na piksel brzegu i model wychodzi jednolity, mimo poprawnie
      wczytanej tekstury.
    */
    ...(() => {
      const ustawienia = odczytajUstawienia(standard.map);
      return ustawienia ? { textureSettings: ustawienia } : {};
    })(),
  };
}

function opiszGeometrie(mesh: THREE.Mesh): BufferGeometryData | null {
  const geo = mesh.geometry as THREE.BufferGeometry | undefined;
  const pos = geo?.getAttribute('position');
  if (!geo || !pos) return null;

  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const idx = geo.getIndex();

  return {
    positions: Array.from(pos.array as Float32Array),
    ...(norm ? { normals: Array.from(norm.array as Float32Array) } : {}),
    ...(uv ? { uvs: Array.from(uv.array as Float32Array) } : {}),
    ...(idx ? { indices: Array.from(idx.array as Uint16Array | Uint32Array) } : {}),
  };
}

function zbuduj(
  gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] },
  fileName: string,
  opcjeTekstur: OpcjeTekstury = {},
): GLTFImportResult {
  const graph = new SceneGraph();
  const warnings: string[] = [];
  let nodeCount = 0;
  let meshCount = 0;

  const przejdz = (obj: THREE.Object3D, parentId?: string): void => {
    const position: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
    const rotation: [number, number, number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
    const scale: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];

    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const bufferData = opiszGeometrie(mesh);

      if (!bufferData) {
        warnings.push(`Siatka „${obj.name || '(bez nazwy)'}" nie ma współrzędnych wierzchołków.`);
        // Węzeł zostaje grupą, żeby jego dzieci nie wypadły z drzewa.
        if (obj.children.length) {
          const grupa = new GroupNode({ name: obj.name || 'Grupa', position, rotation, scale });
          graph.addNode(grupa, parentId);
          nodeCount += 1;
          obj.children.forEach((dziecko) => przejdz(dziecko, grupa.id));
        }
        return;
      }

      if (Array.isArray(mesh.material) && mesh.material.length > 1) {
        warnings.push(
          `Siatka „${obj.name || '(bez nazwy)'}" ma ${mesh.material.length} materiałów; wzięty został pierwszy.`,
        );
      }

      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const node = new MeshNode({
        name: obj.name || 'Siatka',
        position,
        rotation,
        scale,
        geometry: { type: 'custom', bufferData, fileName },
        material: opiszMaterial(material, opcjeTekstur, (t) => warnings.push(t)),
      });
      graph.addNode(node, parentId);
      nodeCount += 1;
      meshCount += 1;
      obj.children.forEach((dziecko) => przejdz(dziecko, node.id));
      return;
    }

    if ((obj as THREE.Light).isLight) {
      const light = obj as THREE.Light;
      const lightType = light.type === 'AmbientLight' ? 'ambient'
        : light.type === 'PointLight' ? 'point'
          : light.type === 'SpotLight' ? 'spot'
            : 'directional';

      const node = new LightNode({
        name: obj.name || 'Światło',
        position,
        lightType,
        color: `#${light.color.getHexString()}`,
        intensity: light.intensity,
      });
      graph.addNode(node, parentId);
      nodeCount += 1;
      return;
    }

    // Węzeł pośredni zostaje nawet bez dzieci, o ile ma nazwę: w glTF puste
    // węzły bywają punktami zaczepienia (miejsce montażu, cel kamery).
    if (obj.children.length || obj.name) {
      const grupa = new GroupNode({ name: obj.name || 'Grupa', position, rotation, scale });
      graph.addNode(grupa, parentId);
      nodeCount += 1;
      obj.children.forEach((dziecko) => przejdz(dziecko, grupa.id));
    }
  };

  gltf.scene.children.forEach((dziecko) => przejdz(dziecko));

  if (meshCount === 0) {
    warnings.push(
      `W pliku „${fileName}" nie ma ani jednej siatki. `
      + (fileName.toLowerCase().endsWith('.gltf')
        ? 'Wariant tekstowy glTF trzyma geometrię w osobnym pliku „.bin" obok — '
          + 'zaimportuj „.glb", który niesie wszystko w sobie.'
        : 'Model może zawierać wyłącznie światła albo puste węzły.'),
    );
  }

  const animations = gltf.animations ?? [];

  return {
    graph,
    nodeCount,
    meshCount,
    animationCount: animations.length,
    animationNames: animations.map((a) => a.name),
    warnings,
  };
}

export class GLTFImporter {
  /**
   * @param buffer Zawartość pliku — `.glb` (binarny) albo `.gltf` (JSON).
   * @param fileName Nazwa pliku; stąd bierze się rozpoznanie wariantu w komunikatach.
   */
  static importFromBuffer(
    buffer: ArrayBuffer,
    fileName = 'model.glb',
    opcjeTekstur: OpcjeTekstury = {},
  ): Promise<GLTFImportResult> {
    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
      loader.parse(
        buffer,
        // Ścieżka zasobów pusta: importujemy pojedynczy plik z dysku, więc
        // odwołania do sąsiednich plików i tak nie mają dokąd trafić.
        '',
        (gltf) => resolve(zbuduj(gltf, fileName, opcjeTekstur)),
        (error) => reject(new Error(
          `Nie udało się wczytać glTF „${fileName}": ${(error as { message?: string })?.message ?? String(error)}`,
        )),
      );
    });
  }

  /** Wariant dla modelu spod adresu — zasoby zewnętrzne rozwiązują się względem niego. */
  static async importFromUrl(url: string, opcjeTekstur: OpcjeTekstury = {}): Promise<GLTFImportResult> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    return zbuduj(gltf, url.split('/').pop() ?? url, opcjeTekstur);
  }
}
