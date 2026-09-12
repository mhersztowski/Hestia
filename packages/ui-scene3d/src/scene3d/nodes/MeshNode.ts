import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';
import type { GeoNodeGraph } from '../geometry-nodes/types';
import { DEFAULT_GEO_NODE_GRAPH } from '../geometry-nodes/types';

export type GeometryType = 'box' | 'sphere' | 'cylinder' | 'plane' | 'cone' | 'torus' | 'custom' | 'procedural' | 'nodes';

export const DEFAULT_PROCEDURAL_CODE = `// Return a THREE.BufferGeometry
const geo = new THREE.SphereGeometry(1, 32, 16);
return geo;`;

export interface BufferGeometryData {
  positions: number[];
  normals?: number[];
  /**
   * Współrzędne tekstury, po dwie na wierzchołek.
   *
   * Bez nich mapa koloru nie ma się na czym położyć — model wchodzi biały mimo
   * poprawnie wczytanej tekstury, co wygląda na usterkę tekstury, a nie
   * geometrii.
   */
  uvs?: number[];
  indices?: number[];
}

export interface GeometryDescriptor {
  /** Stable UUID that identifies this geometry data-block. Shared between objects that use the same mesh. */
  id?: string;
  type: GeometryType;
  params?: Record<string, number>;
  bufferData?: BufferGeometryData;
  fileName?: string;
  code?: string;
  nodesGraph?: GeoNodeGraph;
}

// ─── Material ─────────────────────────────────────────────────────

export type MaterialType =
  | 'MeshBasicMaterial'
  | 'MeshDepthMaterial'
  | 'MeshNormalMaterial'
  | 'MeshLambertMaterial'
  | 'MeshMatcapMaterial'
  | 'MeshPhongMaterial'
  | 'MeshToonMaterial'
  | 'MeshStandardMaterial'
  | 'MeshPhysicalMaterial'
  | 'ShadowMaterial';

export type MaterialSide = 'front' | 'back' | 'double';
export type MaterialBlending = 'normal' | 'additive' | 'subtractive' | 'multiply';

export interface MaterialDescriptor {
  /** UUID of the material data-block. */
  id?: string;
  type: MaterialType;

  // ── Universal ────────────────────────────────────────────────
  color: string;
  opacity: number;
  transparent: boolean;
  wireframe: boolean;
  side: MaterialSide;
  blending: MaterialBlending;
  depthTest: boolean;
  depthWrite: boolean;
  alphaTest: number;
  vertexColors: boolean;
  forceSinglePass: boolean;

  // ── Standard / Physical / Lambert / Phong / Toon ──────────
  emissive?: string;
  emissiveIntensity?: number;

  // ── Basic / Lambert / Phong ───────────────────────────────
  reflectivity?: number;

  // ── Normal / Lambert / Phong / Matcap / Standard / Physical
  flatShading?: boolean;

  // ── Phong ─────────────────────────────────────────────────
  specular?: string;
  shininess?: number;

  // ── Standard / Physical ──────────────────────────────────
  roughness?: number;
  metalness?: number;

  // ── Physical ─────────────────────────────────────────────
  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  dispersion?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  thinFilmThicknessMin?: number;
  thinFilmThicknessMax?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: string;
  transmission?: number;
  attenuationDistance?: number;
  attenuationColor?: string;
  thickness?: number;

  // ── Depth ─────────────────────────────────────────────────
  depthPacking?: 'basic' | 'rgba';

  // ── Texture map (data URL or HTTP URL) ────────────────────
  textureDataUrl?: string;
  /**
   * Ścieżka tekstury w VFS, np. `/users/marcin/tekstury/cegla.png`.
   *
   * Odrębna od `textureDataUrl`, bo to co innego: tam stoi **gotowy adres**
   * (data URL z importu mapy, link http), tu — miejsce pliku na dysku
   * użytkownika. Ścieżka przeżywa zapis i otwarcie na innym komputerze; adres
   * `blob:` żyje tyle, co karta przeglądarki, a data URL potrafi rozdąć plik
   * sceny do megabajtów.
   *
   * Rozwiązaniem ścieżki na coś, co przeglądarka wczyta, zajmuje się host
   * (`resolveTextureSrc`) — rdzeń nie wie, skąd biorą się pliki.
   */
  texturePath?: string;

  /**
   * Pozostałe mapy PBR jako `data:`-URL.
   *
   * Osobno od `textureDataUrl`, bo mapa koloru jest tą jedną, którą ustawia się
   * ręcznie w inspektorze; reszta przychodzi **z pliku** i tam ma zostać.
   * Jedno pole na zbiór zamiast pięciu pól obok siebie: dołożenie kolejnej mapy
   * nie każe wtedy ruszać modelu, serializacji i widoku naraz.
   *
   * Bez mapy normalnych model z sieci wygląda płasko — i to jest pierwsza
   * rzecz, którą widać po imporcie, gdy jej brakuje.
   */
  maps?: MaterialMaps;

  /**
   * Jak nakładać teksturę — osobno od tego, **co** ona przedstawia.
   *
   * Plik potrafi żądać, żeby obraz powtórzył się na ścianie kilka razy; bez
   * przeniesienia tego ustawienia współrzędne powyżej 1 pobierają piksel
   * z brzegu i model wychodzi jednolity, choć tekstura wczytała się poprawnie.
   *
   * Jedno ustawienie na materiał, nie na każdą mapę z osobna: pliki praktycznie
   * zawsze nakładają wszystkie mapy tego samego materiału tak samo, a pięć
   * niezależnych zestawów byłoby pięcioma miejscami na tę samą informację.
   */
  textureSettings?: TextureSettings;
}

export type TextureWrap = 'clamp' | 'repeat' | 'mirror';

/** Co dzieje się poza brzegiem tekstury i jak jest ona ułożona. */
export interface TextureSettings {
  wrapS?: TextureWrap;
  wrapT?: TextureWrap;
  /** Ile razy obraz mieści się w zakresie 0–1 współrzędnych. */
  repeat?: [number, number];
  offset?: [number, number];
  /** glTF liczy współrzędne od górnego rogu i wymaga `false`. */
  flipY?: boolean;
}

/** Mapy materiału inne niż kolor bazowy. */
export interface MaterialMaps {
  normal?: string;
  roughness?: string;
  metalness?: string;
  emissive?: string;
  /** Przesłonięcie otoczenia — wymaga drugiego zestawu UV. */
  ao?: string;
}

export const DEFAULT_MATERIAL: MaterialDescriptor = {
  type: 'MeshStandardMaterial',
  color: '#4fc3f7',
  opacity: 1,
  transparent: false,
  wireframe: false,
  side: 'front',
  blending: 'normal',
  depthTest: true,
  depthWrite: true,
  alphaTest: 0,
  vertexColors: false,
  forceSinglePass: false,
  emissive: '#000000',
  emissiveIntensity: 1,
  roughness: 1,
  metalness: 0,
  flatShading: false,
};

export interface MeshNodeData extends SceneNodeData {
  type: 'mesh';
  geometry: GeometryDescriptor;
  /** Partial is accepted for backward-compatibility with old serialized scenes. */
  material: Partial<MaterialDescriptor>;
}

export class MeshNode extends SceneNode {
  geometry: GeometryDescriptor;
  material: MaterialDescriptor;

  constructor(data?: Partial<MeshNodeData>) {
    super({ ...data, type: 'mesh' });

    const geo = data?.geometry ?? { type: 'box' };
    this.geometry = geo.id ? geo : { ...geo, id: crypto.randomUUID() };

    const mat = data?.material;
    this.material = mat
      ? { ...DEFAULT_MATERIAL, ...mat, type: mat.type ?? 'MeshStandardMaterial', id: mat.id ?? crypto.randomUUID() }
      : { ...DEFAULT_MATERIAL, id: crypto.randomUUID() };
  }

  // ── Live-update helpers (patch THREE object directly for smooth dragging) ──

  setMaterialColor(color: string): void {
    this.material = { ...this.material, color };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mat = (this._threeObject as any)?.material;
    if (mat?.color?.set) mat.color.set(color);
    this.notifyChange();
  }

  setMaterialOpacity(opacity: number): void {
    const transparent = opacity < 1 || this.material.transparent;
    this.material = { ...this.material, opacity, transparent };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mat = (this._threeObject as any)?.material;
    if (mat) { mat.opacity = opacity; mat.transparent = transparent; }
    this.notifyChange();
  }

  setMaterialWireframe(wireframe: boolean): void {
    this.material = { ...this.material, wireframe };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mat = (this._threeObject as any)?.material;
    if (mat) mat.wireframe = wireframe;
    this.notifyChange();
  }

  setGeometry(geometry: GeometryDescriptor): void {
    this.geometry = geometry.id ? geometry : { ...geometry, id: crypto.randomUUID() };
    this.notifyChange();
  }

  override setProperty(property: string, value: unknown): boolean {
    if (property.startsWith('geometry.params.')) {
      const key = property.slice('geometry.params.'.length);
      this.geometry = { ...this.geometry, params: { ...(this.geometry.params ?? {}), [key]: value as number } };
      this.notifyChange();
      return true;
    }

    switch (property) {
      case 'geometry.id':
        this.geometry = { ...this.geometry, id: value as string };
        this.notifyChange();
        return true;
      case 'material.id':
        this.material = { ...this.material, id: value as string };
        this.notifyChange();
        return true;
      case 'geometry.type':
        this.geometry = {
          id: crypto.randomUUID(),
          type: value as GeometryType,
          ...(value === 'procedural' ? { code: this.geometry.code ?? DEFAULT_PROCEDURAL_CODE } : {}),
          ...(value === 'nodes' ? { nodesGraph: this.geometry.nodesGraph ?? DEFAULT_GEO_NODE_GRAPH } : {}),
        };
        this.notifyChange();
        return true;
      case 'geometry.code':
        this.geometry = { ...this.geometry, code: value as string };
        this.notifyChange();
        return true;
      case 'geometry.nodesGraph':
        this.geometry = { ...this.geometry, nodesGraph: value as GeoNodeGraph };
        this.notifyChange();
        return true;

      // ── Material: live-update for smooth slider dragging ──────
      case 'material.color':
        this.setMaterialColor(value as string);
        return true;
      case 'material.opacity':
        this.setMaterialOpacity(value as number);
        return true;
      case 'material.wireframe':
        this.setMaterialWireframe(value as boolean);
        return true;

      default:
        // Generic material property — just update the descriptor and let R3F re-render
        if (property.startsWith('material.')) {
          const key = property.slice('material.'.length);
          // Live-update numeric props on the THREE material where possible
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mat = (this._threeObject as any)?.material;
          if (mat) {
            if (key === 'roughness' && mat.roughness !== undefined) mat.roughness = value as number;
            else if (key === 'metalness' && mat.metalness !== undefined) mat.metalness = value as number;
            else if (key === 'emissive' && mat.emissive?.set) mat.emissive.set(value as string);
            else if (key === 'emissiveIntensity' && mat.emissiveIntensity !== undefined) mat.emissiveIntensity = value as number;
            else if (key === 'shininess' && mat.shininess !== undefined) mat.shininess = value as number;
          }
          this.material = { ...this.material, [key]: value };
          this.notifyChange();
          return true;
        }
        return super.setProperty(property, value);
    }
  }

  override toData(): MeshNodeData {
    return {
      ...super.toData(),
      type: 'mesh',
      geometry: { ...this.geometry },
      material: { ...this.material },
    };
  }
}
