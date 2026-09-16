import {
  useRef,
  useMemo,
  useEffect,
  useCallback,
  useState,
  MutableRefObject,
  useLayoutEffect,
} from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  TransformControls,
  GizmoHelper,
  GizmoViewport,
  GizmoViewcube,
  Edges,
  PerspectiveCamera as DreiPerspectiveCamera,
  OrthographicCamera as DreiOrthographicCamera,
  Environment,
  Html,
} from '@react-three/drei';
import * as THREE from 'three';
import type { SceneGraph } from '../scene/SceneGraph';
import type { SceneNode } from '../scene/SceneNode';
import type {
  MeshNode,
  BufferGeometryData,
  MaterialDescriptor,
  TextureSettings,
} from '../nodes/MeshNode';
import { zastosujUstawienia } from '../io/textureSettings';
import type {
  GeometryPointNode,
  GeometrySegmentNode,
  GeometryLineNode,
  GeometryAngleNode,
} from '../nodes/GeometryNodes';
import type { GeoNodeGraph } from '../geometry-nodes/types';
import { evaluateGeoNodeGraph } from '../geometry-nodes/evaluate';
import type { LightNode } from '../nodes/LightNode';
import type { CameraNode } from '../nodes/CameraNode';
import type { AudioNode as SceneAudioNode } from '../nodes/AudioNode';
import type { CSSProperties, ReactElement, ReactNode, RefObject } from 'react';
import type { CameraPresetName, SceneSettings } from '../sceneTypes';
import { CAMERA_PRESETS } from './cameraPresets';

export type SceneRenderMode = 'realistic' | 'solid' | 'normal' | 'wireframe';

function toThreeSide(side: MaterialDescriptor['side']): THREE.Side {
  if (side === 'back') return THREE.BackSide;
  if (side === 'double') return THREE.DoubleSide;
  return THREE.FrontSide;
}

function toThreeBlending(blending: MaterialDescriptor['blending']): THREE.Blending {
  if (blending === 'additive') return THREE.AdditiveBlending;
  if (blending === 'subtractive') return THREE.SubtractiveBlending;
  if (blending === 'multiply') return THREE.MultiplyBlending;
  return THREE.NormalBlending;
}

/**
 * Tekstura materiału — jedna droga dla wszystkich rodzajów materiału.
 *
 * Wcześniej mapę koloru umiał tylko `MeshStandardMaterial`, bo obsługa siedziała
 * w osobnym komponencie użytym w jednej gałęzi `switch`. Ustawienie tekstury na
 * materiale fizycznym albo Phonga nie robiło **nic** — bez błędu, bez śladu.
 * Hook daje ją każdemu, kto ją potrafi pokazać.
 */
function useTeksturaZeZrodla(
  zrodlo: string | undefined,
  resolveTextureSrc?: (src: string) => Promise<string>,
  sRGB = false,
  ustawienia?: TextureSettings
): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  /*
    Ustawienia wchodzą do zależności jako **tekst**, a nie jako obiekt: opis
    materiału powstaje na nowo przy każdym renderze, więc porównanie po
    tożsamości kazałoby wczytywać ten sam obraz w kółko.
  */
  const kluczUstawien = ustawienia ? JSON.stringify(ustawienia) : '';
  const ostatnieUstawienia = useRef(ustawienia);
  ostatnieUstawienia.current = ustawienia;

  useEffect(() => {
    if (!zrodlo) {
      setTexture(null);
      return;
    }

    let active = true;

    const zaladuj = (url: string) => {
      // `TextureLoader` zamiast ręcznego `new Image()`: sam ustawia `needsUpdate`
      // i obsługuje przypadki, o których łatwo zapomnieć przy ręcznym ładowaniu.
      new THREE.TextureLoader().load(
        url,
        (t) => {
          if (!active) {
            t.dispose();
            return;
          }
          // Kolor i emisja są w przestrzeni sRGB; mapy techniczne (normalne,
          // chropowatość) niosą **liczby**, nie barwy — przepuszczenie ich przez
          // korekcję gamma rozjaśniłoby je i zepsuło oświetlenie.
          t.colorSpace = sRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          // Sposób nakładania musi wejść **przed** oddaniem tekstury: to on
          // decyduje, czy współrzędne powyżej 1 powtarzają obraz, czy pobierają
          // w kółko piksel z brzegu.
          zastosujUstawienia(t, ostatnieUstawienia.current);
          t.needsUpdate = true;
          setTexture(t);
        },
        undefined,
        () => {
          console.warn('[SimpleViewer] Nie udało się wczytać tekstury:', url.slice(0, 80));
        }
      );
    };

    // Ścieżkę VFS rozwiązuje host — rdzeń nie wie, skąd biorą się pliki.
    const zDysku = !/^(https?:|data:|blob:)/.test(zrodlo);
    if (zDysku && resolveTextureSrc) {
      void resolveTextureSrc(zrodlo)
        .then((url) => {
          if (active) zaladuj(url);
        })
        .catch((e: unknown) => {
          console.warn('[SimpleViewer] Nie udało się odczytać tekstury z dysku:', zrodlo, e);
        });
    } else {
      zaladuj(zrodlo);
    }

    /*
      Sprzątanie **nie niszczy** tekstury.

      Wcześniej `dispose()` w tym miejscu kasował obraz, który materiał właśnie
      dostał: wystarczyło, że efekt przeliczył się raz (zmiana źródła, remount
      poddrzewa), a model wracał do bieli mimo poprawnie wczytanego pliku.
      Teksturę zwalnia Three przy usuwaniu materiału.
    */
    return () => {
      active = false;
    };
  }, [zrodlo, resolveTextureSrc, sRGB, kluczUstawien]);

  return texture;
}

export interface MapyMaterialu {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  metalnessMap: THREE.Texture | null;
  emissiveMap: THREE.Texture | null;
  aoMap: THREE.Texture | null;
}

/**
 * Wymusza przebudowę shadera po dojściu map.
 *
 * Obraz wczytuje się **po** pierwszym renderze, więc materiał powstaje bez mapy.
 * Three kompiluje shader pod zestaw map z chwili powstania i samo przypisanie
 * `material.map` niczego nie zmienia — model zostaje biały, bez błędu i bez
 * ostrzeżenia. Dopiero `needsUpdate` każe zbudować shader na nowo.
 *
 * Przez `ref`, a nie przez `key` na elemencie: odbudowa materiału przez React
 * zależy od tego, jak biblioteka renderująca traktuje wymianę węzła — a to jest
 * dokładnie ta warstwa, która tu zawodziła.
 */
function useShaderPoDojsciuMap(mapy: MapyMaterialu) {
  // Typ ogólny, bo ten sam hook obsługuje wszystkie rodzaje materiału —
  // `needsUpdate` jest wspólne dla każdego z nich.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.needsUpdate = true;
  }, [
    mapy.map,
    mapy.normalMap,
    mapy.roughnessMap,
    mapy.metalnessMap,
    mapy.emissiveMap,
    mapy.aoMap,
  ]);
  return ref;
}

/** Komplet map materiału — kolor i mapy techniczne. */
function useMaterialMaps(
  mat: MaterialDescriptor,
  resolveTextureSrc?: (src: string) => Promise<string>
) {
  // Ścieżka w VFS ma pierwszeństwo przed gotowym adresem: to ona przeżywa zapis
  // sceny, a `textureDataUrl` bywa `blob:` ważnym tylko w tej karcie.
  const u = mat.textureSettings;
  const map = useTeksturaZeZrodla(
    mat.texturePath || mat.textureDataUrl,
    resolveTextureSrc,
    true,
    u
  );
  const normalMap = useTeksturaZeZrodla(mat.maps?.normal, resolveTextureSrc, false, u);
  const roughnessMap = useTeksturaZeZrodla(mat.maps?.roughness, resolveTextureSrc, false, u);
  const metalnessMap = useTeksturaZeZrodla(mat.maps?.metalness, resolveTextureSrc, false, u);
  const emissiveMap = useTeksturaZeZrodla(mat.maps?.emissive, resolveTextureSrc, true, u);
  const aoMap = useTeksturaZeZrodla(mat.maps?.ao, resolveTextureSrc, false, u);

  return { map, normalMap, roughnessMap, metalnessMap, emissiveMap, aoMap };
}

/**
 * Materiał standardowy z mapami.
 *
 * Mapy **przychodzą z zewnątrz**, a nie są ładowane tutaj: wcześniej ładował je
 * i ten komponent, i jego rodzic, więc ten sam obraz szedł przez pamięć dwa razy
 * i dwa razy trafiał na kartę graficzną.
 */
function TexturedStandardMat({
  mat,
  selEmissive,
  selEmissiveIntensity,
  side,
  blending,
  mapy,
}: {
  mat: MaterialDescriptor;
  selEmissive: string;
  selEmissiveIntensity: number;
  side: THREE.Side;
  blending: THREE.Blending;
  mapy: MapyMaterialu;
}) {
  const ref = useShaderPoDojsciuMap(mapy);

  return (
    <meshStandardMaterial
      ref={ref}
      map={mapy.map ?? undefined}
      normalMap={mapy.normalMap ?? undefined}
      roughnessMap={mapy.roughnessMap ?? undefined}
      metalnessMap={mapy.metalnessMap ?? undefined}
      emissiveMap={mapy.emissiveMap ?? undefined}
      aoMap={mapy.aoMap ?? undefined}
      color={mapy.map ? '#ffffff' : mat.color}
      emissive={selEmissive}
      emissiveIntensity={selEmissiveIntensity}
      roughness={mat.roughness ?? 1}
      metalness={mat.metalness ?? 0}
      opacity={mat.opacity}
      transparent={mat.transparent || mat.opacity < 1}
      wireframe={mat.wireframe}
      side={side}
      blending={blending}
      depthTest={mat.depthTest}
      depthWrite={mat.depthWrite}
      alphaTest={mat.alphaTest}
      vertexColors={mat.vertexColors}
      flatShading={mat.flatShading ?? false}
    />
  );
}

function RealisticMaterial({
  mat,
  isSelected,
  resolveTextureSrc,
}: {
  mat: MaterialDescriptor;
  isSelected: boolean;
  resolveTextureSrc?: (src: string) => Promise<string>;
}) {
  const side = toThreeSide(mat.side);
  const blending = toThreeBlending(mat.blending);
  // For materials that support emissive, use selection highlight via emissive channel
  const selEmissive = isSelected ? '#4fc3f7' : (mat.emissive ?? '#000000');
  const selEmissiveIntensity = isSelected ? 0.15 : (mat.emissiveIntensity ?? 1);

  // Mapa koloru dla każdego materiału, który ją obsługuje. Hook musi stać przed
  // `switch`, bo React nie pozwala wołać go warunkowo.
  const mapy = useMaterialMaps(mat, resolveTextureSrc);
  const texture = mapy.map;
  // Z teksturą barwa materiału jest **mnożnikiem** — kolor inny niż biały
  // przyciemniłby obraz i wyglądałoby to jak zła tekstura.
  const kolor = texture ? '#ffffff' : mat.color;
  const refMat = useShaderPoDojsciuMap(mapy);

  switch (mat.type) {
    case 'MeshBasicMaterial':
      return (
        <meshBasicMaterial
          ref={refMat}
          map={texture ?? undefined}
          color={kolor}
          opacity={mat.opacity}
          transparent={mat.transparent || mat.opacity < 1}
          wireframe={mat.wireframe}
          side={side}
          blending={blending}
          depthTest={mat.depthTest}
          depthWrite={mat.depthWrite}
          alphaTest={mat.alphaTest}
          vertexColors={mat.vertexColors}
          forceSinglePass={mat.forceSinglePass}
        />
      );

    case 'MeshDepthMaterial': {
      // The depth-packing constants are missing from some `three` typings we build
      // against, so they are read off an untyped view with the upstream values as
      // the fallback.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const three = THREE as any;
      return (
        <meshDepthMaterial
          wireframe={mat.wireframe}
          side={side}
          depthPacking={
            mat.depthPacking === 'rgba'
              ? (three.RGBADepthPacking ?? 3201)
              : (three.BasicDepthPacking ?? 3200)
          }
        />
      );
    }

    case 'MeshNormalMaterial':
      return (
        <meshNormalMaterial wireframe={mat.wireframe} side={side} flatShading={mat.flatShading} />
      );

    case 'MeshLambertMaterial':
      return (
        <meshLambertMaterial
          ref={refMat}
          map={texture ?? undefined}
          normalMap={mapy.normalMap ?? undefined}
          emissiveMap={mapy.emissiveMap ?? undefined}
          color={kolor}
          emissive={selEmissive}
          emissiveIntensity={selEmissiveIntensity}
          opacity={mat.opacity}
          transparent={mat.transparent || mat.opacity < 1}
          wireframe={mat.wireframe}
          side={side}
          blending={blending}
          depthTest={mat.depthTest}
          depthWrite={mat.depthWrite}
          alphaTest={mat.alphaTest}
          vertexColors={mat.vertexColors}
          flatShading={mat.flatShading}
          reflectivity={mat.reflectivity}
        />
      );

    case 'MeshMatcapMaterial':
      return (
        <meshMatcapMaterial
          color={mat.color}
          opacity={mat.opacity}
          transparent={mat.transparent || mat.opacity < 1}
          side={side}
          flatShading={mat.flatShading}
          alphaTest={mat.alphaTest}
        />
      );

    case 'MeshPhongMaterial':
      return (
        <meshPhongMaterial
          ref={refMat}
          map={texture ?? undefined}
          normalMap={mapy.normalMap ?? undefined}
          emissiveMap={mapy.emissiveMap ?? undefined}
          color={kolor}
          emissive={selEmissive}
          emissiveIntensity={selEmissiveIntensity}
          specular={mat.specular ?? '#111111'}
          shininess={mat.shininess ?? 30}
          opacity={mat.opacity}
          transparent={mat.transparent || mat.opacity < 1}
          wireframe={mat.wireframe}
          side={side}
          blending={blending}
          depthTest={mat.depthTest}
          depthWrite={mat.depthWrite}
          alphaTest={mat.alphaTest}
          vertexColors={mat.vertexColors}
          flatShading={mat.flatShading}
          reflectivity={mat.reflectivity}
        />
      );

    case 'MeshToonMaterial':
      return (
        <meshToonMaterial
          ref={refMat}
          map={texture ?? undefined}
          color={kolor}
          emissive={selEmissive}
          emissiveIntensity={selEmissiveIntensity}
          opacity={mat.opacity}
          transparent={mat.transparent || mat.opacity < 1}
          wireframe={mat.wireframe}
          side={side}
          blending={blending}
          depthTest={mat.depthTest}
          depthWrite={mat.depthWrite}
          alphaTest={mat.alphaTest}
          vertexColors={mat.vertexColors}
        />
      );

    case 'MeshPhysicalMaterial':
      return (
        <meshPhysicalMaterial
          ref={refMat}
          map={texture ?? undefined}
          normalMap={mapy.normalMap ?? undefined}
          roughnessMap={mapy.roughnessMap ?? undefined}
          metalnessMap={mapy.metalnessMap ?? undefined}
          emissiveMap={mapy.emissiveMap ?? undefined}
          aoMap={mapy.aoMap ?? undefined}
          color={kolor}
          emissive={selEmissive}
          emissiveIntensity={selEmissiveIntensity}
          roughness={mat.roughness ?? 1}
          metalness={mat.metalness ?? 0}
          ior={mat.ior ?? 1.5}
          clearcoat={mat.clearcoat ?? 0}
          clearcoatRoughness={mat.clearcoatRoughness ?? 0}
          iridescence={mat.iridescence ?? 0}
          iridescenceIOR={mat.iridescenceIOR ?? 1.3}
          iridescenceThicknessRange={[
            mat.thinFilmThicknessMin ?? 100,
            mat.thinFilmThicknessMax ?? 400,
          ]}
          sheen={mat.sheen ?? 0}
          sheenRoughness={mat.sheenRoughness ?? 1}
          sheenColor={mat.sheenColor ?? '#000000'}
          transmission={mat.transmission ?? 0}
          thickness={mat.thickness ?? 0}
          attenuationDistance={mat.attenuationDistance ?? Infinity}
          attenuationColor={mat.attenuationColor ?? '#ffffff'}
          opacity={mat.opacity}
          transparent={mat.transparent || mat.opacity < 1 || (mat.transmission ?? 0) > 0}
          wireframe={mat.wireframe}
          side={side}
          blending={blending}
          depthTest={mat.depthTest}
          depthWrite={mat.depthWrite}
          alphaTest={mat.alphaTest}
          vertexColors={mat.vertexColors}
          flatShading={mat.flatShading}
          forceSinglePass={mat.forceSinglePass}
        />
      );

    case 'ShadowMaterial':
      return (
        <shadowMaterial
          color={mat.color}
          opacity={mat.opacity}
          transparent={mat.transparent}
          side={side}
          depthTest={mat.depthTest}
          depthWrite={mat.depthWrite}
        />
      );

    case 'MeshStandardMaterial':
    default:
      if (mat.textureDataUrl || mat.texturePath) {
        return (
          <TexturedStandardMat
            mat={mat}
            selEmissive={selEmissive}
            selEmissiveIntensity={selEmissiveIntensity}
            side={side}
            blending={blending}
            mapy={mapy}
          />
        );
      }
      return (
        <meshStandardMaterial
          color={mat.color}
          emissive={selEmissive}
          emissiveIntensity={selEmissiveIntensity}
          roughness={mat.roughness ?? 1}
          metalness={mat.metalness ?? 0}
          opacity={mat.opacity}
          transparent={mat.transparent || mat.opacity < 1}
          wireframe={mat.wireframe}
          side={side}
          blending={blending}
          depthTest={mat.depthTest}
          depthWrite={mat.depthWrite}
          alphaTest={mat.alphaTest}
          vertexColors={mat.vertexColors}
          flatShading={mat.flatShading}
          forceSinglePass={mat.forceSinglePass}
        />
      );
  }
}

export interface SimpleViewerProps {
  sceneGraph?: SceneGraph;
  version?: number;
  showGrid?: boolean;
  selectedNodeId?: string | null;
  /** Additional highlighted node IDs (multi-selection). A highlighted group also
   *  highlights its descendant meshes. The gizmo still targets `selectedNodeId`. */
  selectedNodeIds?: string[];
  transformMode?: 'translate' | 'rotate' | 'scale';
  cameraPreset?: CameraPresetName;
  onNodeSelect?: (nodeId: string | null) => void;
  width?: number | string;
  height?: number | string;
  backgroundColor?: string;
  className?: string;
  style?: CSSProperties;
  /** Fit camera to encompass all scene meshes on mount / when sceneGraph changes. */
  autoFit?: boolean;
  /** Pass a ref; its `.current` will be set to a `fitScene()` function for imperative triggering. */
  fitSceneRef?: MutableRefObject<(() => void) | null>;
  /** Pass a ref; its `.current` will be set to a function returning the world-space
   *  bounding-box size [x,y,z] (scene units) of a node's subtree, or null if not found. */
  boundsRef?: MutableRefObject<((nodeId: string) => [number, number, number] | null) | null>;
  /** Show orientation gizmo in the bottom-left corner. Default true. */
  showAxesGizmo?: boolean;
  /** ID of a scene CameraNode to use as the viewport camera; null = editor camera. */
  activeCameraNodeId?: string | null;
  /** Viewport shading mode. Default 'realistic'. */
  renderMode?: SceneRenderMode;
  /** Draw crisp edge outlines on each mesh (LeoCAD-style). Skipped for nodes under
   *  a group flagged `metadata.floor`. Default false. */
  edges?: boolean;
  /** Uniform ambient/hemisphere lighting (each face lit independently) instead of
   *  the default directional key light. Default false. */
  flatLighting?: boolean;
  /** Show a clickable orientation view-cube (Top/Front/Left/…) instead of the axes
   *  gizmo. Default false. */
  viewCube?: boolean;
  /** Live grid snap for the translate gizmo, in world units (null/0 = off). */
  translationSnap?: number | null;
  /** Live angle snap for the rotate gizmo, in radians (null/0 = off). */
  rotationSnap?: number | null;
  /** Extra THREE objects rendered as-is inside the scene (e.g. a line-grid floor).
   *  Not selectable / not part of the scene graph. */
  extraObjects?: THREE.Object3D | THREE.Object3D[];
  /** React content rendered inside the R3F canvas, after the scene.
   *
   *  Different from `extraObjects`, which takes ready-made THREE objects: this is
   *  for content that has to live in the React tree to work at all — a uikit UI
   *  layer needs hooks (canvas size, pointer events) that a detached Object3D
   *  cannot have. It is deliberately not part of the scene graph: an on-screen
   *  interface is not scene content and must not appear in the tree, in exports
   *  or in picking. */
  overlay3d?: ReactNode;
  /** Draw a wireframe bounding box around the selected node(s). Default false. */
  showBoundingBox?: boolean;
  /** Scene-level settings: background, environment, fog. */
  sceneSettings?: SceneSettings;
  /** Called when the user clicks on the Y=0 floor plane (for template placement). wx/wz = world X/Z coordinates. */
  onPlaneClick?: (wx: number, wz: number) => void;
  /** Show a floating debug log overlay — useful for diagnosing gizmo / touch issues on mobile. */
  debugLog?: boolean;
  /** Resolves a VFS path (e.g. /users/default/projects/audio.mp3) to a playable URL (e.g. blob:). */
  resolveAudioSrc?: (src: string) => Promise<string>;
  /** Rozwiązuje ścieżkę tekstury z VFS (np. `/users/…/cegla.png`) na adres do wczytania. */
  resolveTextureSrc?: (src: string) => Promise<string>;
  /** Size of the transform gizmo handles. Default 0.7. */
  gizmoSize?: number;
  /** Called when a gizmo drag ends — useful for animation recording. */
  onGizmoTransformEnd?: (
    nodeId: string,
    mode: 'translate' | 'rotate' | 'scale',
    value: [number, number, number]
  ) => void;
  /** Active geometry-point gizmo edit (e.g. dragging a segment endpoint). When set
   *  for the selected node, a point gizmo replaces the whole-node gizmo. */
  geoPointEdit?: { nodeId: string; fieldKey: string } | null;
  /** Called as a geometry point is dragged — value is the new node-local point. */
  onGeoPointChange?: (nodeId: string, fieldKey: string, value: [number, number, number]) => void;
}

function SelectableMesh({
  node,
  meshNode,
  isSelected,
  renderMode = 'realistic',
  edges = false,
  resolveTextureSrc,
}: {
  node: SceneNode;
  meshNode: MeshNode;
  isSelected: boolean;
  onSelect?: (nodeId: string) => void;
  renderMode?: SceneRenderMode;
  edges?: boolean;
  resolveTextureSrc?: (src: string) => Promise<string>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    node._threeObject = meshRef.current;
    return () => {
      node._threeObject = null;
    };
  }, [node, meshNode]);

  return (
    <mesh
      ref={meshRef}
      name={node.id}
      userData={{ pickNodeId: node.id }}
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
    >
      <MeshGeometry
        type={meshNode.geometry.type}
        params={meshNode.geometry.params}
        bufferData={meshNode.geometry.bufferData}
        code={meshNode.geometry.code}
        nodesGraph={meshNode.geometry.nodesGraph}
      />
      {renderMode === 'solid' && <meshLambertMaterial color={isSelected ? '#4fc3f7' : '#888888'} />}
      {renderMode === 'normal' && <meshNormalMaterial />}
      {renderMode === 'wireframe' && (
        <meshBasicMaterial wireframe color={isSelected ? '#4fc3f7' : '#aaaaaa'} />
      )}
      {(renderMode === 'realistic' || renderMode == null) && (
        <RealisticMaterial
          mat={meshNode.material}
          isSelected={isSelected}
          resolveTextureSrc={resolveTextureSrc}
        />
      )}
      {edges && <Edges threshold={20} color={isSelected ? '#4fc3f7' : '#0b0b0b'} />}
    </mesh>
  );
}

/** Wireframe bounding box(es) around the selected node(s), kept in sync each frame
 *  (so it follows a gizmo drag). Resolves objects by node id from the live scene. */
function SelectionBoxes({ ids, color = 0x4fc3f7 }: { ids: string[]; color?: number }) {
  const { scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const helpersRef = useRef<Map<string, THREE.BoxHelper>>(new Map());
  const idsKey = ids.join(',');

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const map = helpersRef.current;
    for (const [id, h] of map) {
      if (!ids.includes(id)) {
        g.remove(h);
        h.geometry.dispose();
        (h.material as THREE.Material).dispose();
        map.delete(id);
      }
    }
    for (const id of ids) {
      if (map.has(id)) continue;
      const obj = scene.getObjectByName(id);
      if (!obj) continue;
      const h = new THREE.BoxHelper(obj, color);
      (h.material as THREE.LineBasicMaterial).depthTest = false;
      h.renderOrder = 999;
      map.set(id, h);
      g.add(h);
    }
    return () => {
      /* helpers cleaned on id change above / unmount below */
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, scene, color]);

  // Dispose everything on unmount.
  useEffect(
    () => () => {
      const g = groupRef.current;
      for (const h of helpersRef.current.values()) {
        g?.remove(h);
        h.geometry.dispose();
        (h.material as THREE.Material).dispose();
      }
      helpersRef.current.clear();
    },
    []
  );

  useFrame(() => {
    for (const [id, h] of helpersRef.current) {
      const obj = scene.getObjectByName(id);
      if (obj) h.setFromObject(obj);
    }
  });

  return <group ref={groupRef} />;
}

function GizmoControls({
  sceneGraph,
  selectedNodeId,
  version,
  transformMode,
  onObjectChange,
  onTransformEnd,
  isDraggingGizmoRef,
  addLog,
  gizmoSize = 0.7,
  translationSnap = null,
  rotationSnap = null,
}: {
  sceneGraph: SceneGraph;
  selectedNodeId: string;
  version?: number;
  transformMode: 'translate' | 'rotate' | 'scale';
  translationSnap?: number | null;
  rotationSnap?: number | null;
  onObjectChange?: (obj: THREE.Object3D) => void;
  onTransformEnd?: (
    nodeId: string,
    mode: 'translate' | 'rotate' | 'scale',
    value: [number, number, number]
  ) => void;
  isDraggingGizmoRef?: MutableRefObject<boolean>;
  addLog?: (msg: string) => void;
  gizmoSize?: number;
}) {
  const { scene } = useThree();
  const controlsRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Resolve the gizmo target in an effect (after commit) via the node's live
  // _threeObject, with a RAF retry — a useMemo during render runs *before* a
  // freshly-added+selected node's object is committed to the scene, which left
  // the gizmo with no target (targetFound=false).
  const [targetObject, setTargetObject] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let raf = 0;
    const resolve = () => {
      // Prefer the object actually in the scene (getObjectByName) — a node's cached
      // _threeObject can be stale/detached after a reparent, which makes
      // TransformControls throw "must be part of the scene graph" every frame.
      const node = sceneGraph.findNode(selectedNodeId);
      const obj =
        scene.getObjectByName(selectedNodeId) ??
        (node?._threeObject as THREE.Object3D | null) ??
        null;
      setTargetObject((prev) => (prev === obj ? prev : obj));
      if (!obj) raf = requestAnimationFrame(resolve);
    };
    resolve();
    return () => cancelAnimationFrame(raf);
    // Re-resolve on scene changes (version) too, so reparents don't leave a stale target.
  }, [scene, sceneGraph, selectedNodeId, version]);

  const handleDragEnd = useCallback(() => {
    if (!targetObject) return;
    const node = sceneGraph.findNode(selectedNodeId);
    if (!node) return;

    if (transformMode === 'translate') {
      const p = targetObject.position;
      const val: [number, number, number] = [p.x, p.y, p.z];
      node.setPosition(val);
      addLog?.(`pos saved (${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`);
      onTransformEnd?.(selectedNodeId, 'translate', val);
    } else if (transformMode === 'rotate') {
      const r = targetObject.rotation;
      const val: [number, number, number] = [r.x, r.y, r.z];
      node.setRotation(val);
      addLog?.(`rot saved (${r.x.toFixed(2)},${r.y.toFixed(2)},${r.z.toFixed(2)})`);
      onTransformEnd?.(selectedNodeId, 'rotate', val);
    } else if (transformMode === 'scale') {
      const s = targetObject.scale;
      const val: [number, number, number] = [s.x, s.y, s.z];
      node.setScale(val);
      addLog?.(`scale saved (${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)})`);
      onTransformEnd?.(selectedNodeId, 'scale', val);
    }
  }, [targetObject, sceneGraph, selectedNodeId, transformMode, addLog, onTransformEnd]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const callback = () => {
      addLog?.('gizmo mouseUp');
      handleDragEnd();
    };
    controls.addEventListener('mouseUp', callback);
    return () => controls.removeEventListener('mouseUp', callback);
  }, [handleDragEnd, addLog]);

  // Imperatively keep Three.js TransformControls in sync with the React mode prop.
  // Drei renders <primitive object={controls} mode={mode} /> which only assigns
  // the property — but Three.js needs `setMode(...)` to re-render the gizmo
  // (translate arrows ↔ rotate rings ↔ scale boxes). Without this the gizmo
  // stays stuck on whatever mode it had at mount time even though the prop changes.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (typeof controls.setMode === 'function') {
      controls.setMode(transformMode);
    } else {
      controls.mode = transformMode;
    }
  }, [transformMode]);

  // Live grid/angle snapping while dragging the gizmo (LeoCAD-style). Re-applied
  // when the gizmo re-attaches to a new target.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const t = translationSnap && translationSnap > 0 ? translationSnap : null;
    const r = rotationSnap && rotationSnap > 0 ? rotationSnap : null;
    if (typeof controls.setTranslationSnap === 'function') controls.setTranslationSnap(t);
    else controls.translationSnap = t;
    if (typeof controls.setRotationSnap === 'function') controls.setRotationSnap(r);
    else controls.rotationSnap = r;
  }, [translationSnap, rotationSnap, targetObject, transformMode]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const callback = () => {
      if (targetObject) onObjectChange?.(targetObject);
    };
    controls.addEventListener('change', callback);
    return () => controls.removeEventListener('change', callback);
  }, [onObjectChange, targetObject]);

  // Guard onPointerMissed from deselecting during drag.
  // Grace-period timeout on drag-end covers stylus/pen brief lifts between strokes.
  const dragEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onDraggingChanged = (e: { value: boolean }) => {
      addLog?.(`dragging-changed ${e.value}`);

      console.log(`[GEO] gizmo dragging=${e.value} node=${selectedNodeId.slice(0, 8)}`);
      if (e.value) {
        if (dragEndTimerRef.current) {
          clearTimeout(dragEndTimerRef.current);
          dragEndTimerRef.current = null;
        }
        if (isDraggingGizmoRef) isDraggingGizmoRef.current = true;
      } else {
        // Delay clearing so a stylus re-contact within 250ms doesn't fire onPointerMissed
        dragEndTimerRef.current = setTimeout(() => {
          if (isDraggingGizmoRef) isDraggingGizmoRef.current = false;
          dragEndTimerRef.current = null;
          addLog?.('dragging guard cleared');
        }, 250);
      }
    };
    controls.addEventListener('dragging-changed', onDraggingChanged);
    return () => {
      controls.removeEventListener('dragging-changed', onDraggingChanged);
      if (dragEndTimerRef.current) {
        clearTimeout(dragEndTimerRef.current);
        dragEndTimerRef.current = null;
      }
      if (isDraggingGizmoRef) isDraggingGizmoRef.current = false;
    };
  }, [isDraggingGizmoRef, addLog]);

  console.log(
    `[GEO] gizmo render node=${selectedNodeId.slice(0, 8)} mode=${transformMode} targetFound=${!!targetObject}`
  );

  if (!targetObject) return null;

  return (
    <TransformControls
      ref={controlsRef}
      object={targetObject}
      mode={transformMode}
      size={gizmoSize}
    />
  );
}

/**
 * Translate gizmo for a single local-space point of a geometry primitive
 * (e.g. a segment's start/end). Creates an anchor at the point's WORLD position,
 * lets the user drag it, then converts back to the node's local space and writes
 * `geo.<fieldKey>`. Used instead of the whole-node gizmo while point editing is on.
 */
function PointEditGizmo({
  sceneGraph,
  nodeId,
  fieldKey,
  onChange,
  isDraggingGizmoRef,
  gizmoSize = 0.7,
}: {
  sceneGraph: SceneGraph;
  nodeId: string;
  fieldKey: string;
  onChange?: (nodeId: string, fieldKey: string, value: [number, number, number]) => void;
  isDraggingGizmoRef?: MutableRefObject<boolean>;
  gizmoSize?: number;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const anchorRef = useRef<THREE.Object3D>(null);
  const [anchor, setAnchor] = useState<THREE.Object3D | null>(null);
  const draggingRef = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const inv = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    setAnchor(anchorRef.current);
  }, []);

  const groupOf = useCallback((): THREE.Object3D | null => {
    const node = sceneGraph.findNode(nodeId);
    return (node?._threeObject as THREE.Object3D | null) ?? null;
  }, [sceneGraph, nodeId]);

  const localPoint = useCallback((): [number, number, number] | null => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (sceneGraph.findNode(nodeId) as any)?.[fieldKey];
    return Array.isArray(v) && v.length === 3 ? [v[0], v[1], v[2]] : null;
  }, [sceneGraph, nodeId, fieldKey]);

  // Keep the anchor parked at the point's world position while not dragging.
  useFrame(() => {
    if (draggingRef.current) return;
    const a = anchorRef.current;
    const g = groupOf();
    const lp = localPoint();
    if (!a || !g || !lp) return;
    g.updateWorldMatrix(true, false);
    tmp.set(lp[0], lp[1], lp[2]).applyMatrix4(g.matrixWorld);
    a.position.copy(tmp);
  });

  const commit = useCallback(() => {
    const a = anchorRef.current;
    const g = groupOf();
    if (!a || !g) return;
    g.updateWorldMatrix(true, false);
    inv.copy(g.matrixWorld).invert();
    a.getWorldPosition(tmp).applyMatrix4(inv);
    onChange?.(nodeId, fieldKey, [tmp.x, tmp.y, tmp.z]);
  }, [groupOf, inv, tmp, onChange, nodeId, fieldKey]);

  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const onObj = () => {
      if (draggingRef.current) commit();
    };
    const onDrag = (e: { value: boolean }) => {
      draggingRef.current = e.value;
      if (isDraggingGizmoRef) isDraggingGizmoRef.current = e.value;
      if (!e.value) commit();
    };
    c.addEventListener('objectChange', onObj);
    c.addEventListener('dragging-changed', onDrag);
    return () => {
      c.removeEventListener('objectChange', onObj);
      c.removeEventListener('dragging-changed', onDrag);
    };
  }, [anchor, commit, isDraggingGizmoRef]);

  return (
    <>
      <object3D ref={anchorRef} />
      {anchor && (
        <TransformControls ref={controlsRef} object={anchor} mode="translate" size={gizmoSize} />
      )}
    </>
  );
}

function CameraGizmoShape({
  color,
  cameraType,
  fov,
  near,
  far,
  left,
  right,
  top,
  bottom,
}: {
  color: string;
  cameraType: 'perspective' | 'orthographic';
  fov: number;
  near: number;
  far: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}) {
  const frustumGeo = useMemo(() => {
    let nL: number, nR: number, nT: number, nB: number;
    let fL: number, fR: number, fT: number, fB: number;

    if (cameraType === 'orthographic') {
      nL = left;
      nR = right;
      nT = top;
      nB = bottom;
      fL = left;
      fR = right;
      fT = top;
      fB = bottom;
    } else {
      const aspect = 16 / 9;
      const tanV = Math.tan((fov * Math.PI) / 180 / 2);
      const tanH = tanV * aspect;
      nL = -near * tanH;
      nR = near * tanH;
      nT = near * tanV;
      nB = -near * tanV;
      fL = -far * tanH;
      fR = far * tanH;
      fT = far * tanV;
      fB = -far * tanV;
    }

    const verts = new Float32Array([
      // 4 corner rays near → far
      nR,
      nT,
      -near,
      fR,
      fT,
      -far,
      nL,
      nT,
      -near,
      fL,
      fT,
      -far,
      nR,
      nB,
      -near,
      fR,
      fB,
      -far,
      nL,
      nB,
      -near,
      fL,
      fB,
      -far,
      // near rect
      nR,
      nT,
      -near,
      nL,
      nT,
      -near,
      nL,
      nT,
      -near,
      nL,
      nB,
      -near,
      nL,
      nB,
      -near,
      nR,
      nB,
      -near,
      nR,
      nB,
      -near,
      nR,
      nT,
      -near,
      // far rect
      fR,
      fT,
      -far,
      fL,
      fT,
      -far,
      fL,
      fT,
      -far,
      fL,
      fB,
      -far,
      fL,
      fB,
      -far,
      fR,
      fB,
      -far,
      fR,
      fB,
      -far,
      fR,
      fT,
      -far,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    return geo;
  }, [cameraType, fov, near, far, left, right, top, bottom]);

  useEffect(() => () => frustumGeo.dispose(), [frustumGeo]);

  return (
    <>
      <mesh>
        <boxGeometry args={[0.32, 0.22, 0.14]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
      <mesh position={[0, 0, -0.09]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.05, 12]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
      <lineSegments geometry={frustumGeo}>
        <lineBasicMaterial color={color} />
      </lineSegments>
    </>
  );
}

function SceneCamera({
  node,
  cameraNode,
  isSelected,
}: {
  node: SceneNode;
  cameraNode: CameraNode;
  isSelected: boolean;
  onSelect?: (nodeId: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    node._threeObject = groupRef.current;
    return () => {
      node._threeObject = null;
    };
  }, [node]);

  return (
    <group
      ref={groupRef}
      name={node.id}
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      scale={node.scale}
      userData={{ pickNodeId: node.id }}
    >
      <CameraGizmoShape
        color={isSelected ? '#4fc3f7' : '#66aaff'}
        cameraType={cameraNode.cameraType}
        fov={cameraNode.fov}
        near={cameraNode.near}
        far={cameraNode.far}
        left={cameraNode.left}
        right={cameraNode.right}
        top={cameraNode.top}
        bottom={cameraNode.bottom}
      />
    </group>
  );
}

function SceneLight({ node, lightNode }: { node: SceneNode; lightNode: LightNode }) {
  const ref = useRef<THREE.Light>(null);

  useEffect(() => {
    node._threeObject = ref.current;
    // Name the light so the transform gizmo can target it via getObjectByName.
    if (ref.current) ref.current.name = node.id;
    return () => {
      node._threeObject = null;
    };
  }, [node]);

  // Sync shadow sub-properties imperatively after every render (point / directional lights)
  useEffect(() => {
    const light = ref.current as THREE.PointLight | THREE.DirectionalLight | null;
    if (!light?.shadow) return;
    light.shadow.bias = lightNode.shadowBias;
    light.shadow.normalBias = lightNode.shadowNormalBias;
    light.shadow.radius = lightNode.shadowRadius;
    // shadow.intensity added in Three.js r166
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('intensity' in light.shadow) (light.shadow as any).intensity = lightNode.shadowIntensity;
  });

  switch (lightNode.lightType) {
    case 'ambient':
      return (
        <ambientLight
          ref={ref as RefObject<THREE.AmbientLight>}
          color={lightNode.color}
          intensity={lightNode.intensity}
        />
      );
    case 'point':
      return (
        <pointLight
          ref={ref as RefObject<THREE.PointLight>}
          position={node.position}
          color={lightNode.color}
          intensity={lightNode.intensity}
          distance={lightNode.distance}
          decay={lightNode.decay}
          castShadow={node.castShadow}
        />
      );
    case 'spot':
      return (
        <spotLight
          ref={ref as RefObject<THREE.SpotLight>}
          position={node.position}
          color={lightNode.color}
          intensity={lightNode.intensity}
          distance={lightNode.distance}
          angle={lightNode.angle}
          penumbra={lightNode.penumbra}
          decay={lightNode.decay}
          castShadow={node.castShadow}
        />
      );
    case 'hemisphere':
      return (
        <hemisphereLight
          ref={ref as RefObject<THREE.HemisphereLight>}
          position={node.position}
          color={lightNode.color}
          groundColor={lightNode.groundColor}
          intensity={lightNode.intensity}
        />
      );
    case 'directional':
    default:
      return (
        <directionalLight
          ref={ref as RefObject<THREE.DirectionalLight>}
          position={node.position}
          color={lightNode.color}
          intensity={lightNode.intensity}
        />
      );
  }
}

// Shared AudioListener — one per browser context, attached to active camera
let _sharedAudioListener: THREE.AudioListener | null = null;
function getSharedAudioListener(): THREE.AudioListener {
  if (!_sharedAudioListener) _sharedAudioListener = new THREE.AudioListener();
  return _sharedAudioListener;
}

function AudioListenerEffect() {
  const { camera } = useThree();
  useEffect(() => {
    const listener = getSharedAudioListener();
    camera.add(listener);
    return () => {
      camera.remove(listener);
    };
  }, [camera]);
  return null;
}

function SceneAudio({
  node,
  audioNode,
  isSelected,
  resolveAudioSrc,
}: {
  node: SceneNode;
  audioNode: SceneAudioNode;
  isSelected: boolean;
  onSelect?: (nodeId: string) => void;
  resolveAudioSrc?: (src: string) => Promise<string>;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    node._threeObject = groupRef.current;
    return () => {
      node._threeObject = null;
    };
  }, [node]);

  useEffect(() => {
    if (!audioNode.src) return;
    const group = groupRef.current;
    if (!group) return;

    const listener = getSharedAudioListener();
    const positional = audioNode.positional ?? true;
    const sound: THREE.Audio<GainNode> | THREE.PositionalAudio = positional
      ? new THREE.PositionalAudio(listener)
      : new THREE.Audio<GainNode>(listener);
    let mounted = true;
    const blobRef = { url: null as string | null };

    const doLoad = async () => {
      let url = audioNode.src;
      if (resolveAudioSrc) {
        try {
          const resolved = await resolveAudioSrc(url);
          if (resolved.startsWith('blob:')) blobRef.url = resolved;
          url = resolved;
        } catch {
          /* fallback to original src */
        }
      }
      if (!mounted) {
        if (blobRef.url) {
          URL.revokeObjectURL(blobRef.url);
          blobRef.url = null;
        }
        return;
      }
      const loader = new THREE.AudioLoader();
      loader.load(
        url,
        (buffer: AudioBuffer) => {
          if (!mounted) return;
          sound.setBuffer(buffer);
          sound.setVolume(audioNode.volume);
          sound.setLoop(audioNode.loop);
          if (positional) {
            const ps = sound as unknown as THREE.PositionalAudio;
            ps.setRefDistance(audioNode.refDistance);
            ps.setRolloffFactor(audioNode.rolloffFactor);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ps as any).setDistanceModel?.(audioNode.distanceModel);
            ps.setMaxDistance(audioNode.maxDistance);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pa = ps as any;
            pa.setConeInnerAngle?.(audioNode.coneInnerAngle);
            pa.setConeOuterAngle?.(audioNode.coneOuterAngle);
            pa.setConeOuterGain?.(audioNode.coneOuterGain);
          }
          group.add(sound);
          if (audioNode.autoplay) sound.play();
        },
        undefined,
        () => {
          /* ignore load errors */
        }
      );
    };

    doLoad();

    return () => {
      mounted = false;
      if (sound.isPlaying) sound.stop();
      try {
        sound.disconnect();
      } catch {
        /* ignore */
      }
      group.remove(sound);
      if (blobRef.url) {
        URL.revokeObjectURL(blobRef.url);
        blobRef.url = null;
      }
    };
  }, [
    audioNode.src,
    audioNode.positional,
    audioNode.refDistance,
    audioNode.distanceModel,
    audioNode.maxDistance,
    audioNode.rolloffFactor,
    audioNode.volume,
    audioNode.loop,
    audioNode.autoplay,
    audioNode.coneInnerAngle,
    audioNode.coneOuterAngle,
    audioNode.coneOuterGain,
    resolveAudioSrc,
  ]);

  return (
    <group
      ref={groupRef}
      name={node.id}
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      scale={node.scale}
      userData={{ pickNodeId: node.id }}
    >
      {/* Speaker visual: wireframe octahedron */}
      <mesh>
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial color={isSelected ? '#4fc3f7' : '#ffd54f'} wireframe />
      </mesh>
      {/* Transparent fill for easier hit testing */}
      <mesh>
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial color={isSelected ? '#4fc3f7' : '#ffd54f'} transparent opacity={0.06} />
      </mesh>
    </group>
  );
}

function SceneGroup({
  node,
  isSelected,
  children,
}: {
  node: SceneNode;
  isSelected: boolean;
  onSelect?: (nodeId: string) => void;
  children?: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    node._threeObject = groupRef.current;
    return () => {
      node._threeObject = null;
    };
  }, [node]);
  return (
    <group
      ref={groupRef}
      name={node.id}
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      scale={node.scale}
      userData={{ pickNodeId: node.id }}
    >
      {/* invisible hit target so the group itself is clickable */}
      {isSelected && (
        <mesh visible={false}>
          <sphereGeometry args={[0.001]} />
        </mesh>
      )}
      {children}
    </group>
  );
}

// ─── Geometry annotation primitives ───────────────────────────────────────────
// These render points / segments / lines / angles with camera-aware sizing so
// markers stay a constant pixel size and labels stay screen-facing & legible at
// any zoom — the "intelligent display depending on camera" behaviour.

// High-contrast white highlight — distinct from every default annotation color
// (amber point, cyan segment, green line, purple angle) so selection is always visible.
const GEO_SELECT_COLOR = '#ffffff';

/**
 * Wraps children in a group whose scale is recomputed every frame so that one
 * world unit projects to `pixels` screen pixels at the group's world position.
 * Used to keep marker dots / angle arcs a constant on-screen size.
 */
function ScreenSized({
  pixels,
  position,
  children,
}: {
  pixels: number;
  position?: [number, number, number];
  children?: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const worldPos = useMemo(() => new THREE.Vector3(), []);
  const parentScale = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    g.getWorldPosition(worldPos);
    const cam = state.camera;
    let worldPerPixel: number;
    if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const pc = cam as THREE.PerspectiveCamera;
      const dist = pc.position.distanceTo(worldPos);
      worldPerPixel = (2 * Math.tan((pc.fov * Math.PI) / 360) * dist) / state.size.height;
    } else {
      const oc = cam as THREE.OrthographicCamera;
      worldPerPixel = (oc.top - oc.bottom) / (oc.zoom || 1) / state.size.height;
    }
    // Cancel any cumulative parent scale so the final on-screen size is exact.
    let pScale = 1;
    if (g.parent) {
      g.parent.getWorldScale(parentScale);
      pScale = parentScale.x || 1;
    }
    const s = (worldPerPixel * pixels) / pScale;
    g.scale.setScalar(s > 1e-9 ? s : 1e-9);
  });

  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}

/** Screen-facing, constant-size text label rendered as a DOM overlay. */
function GeoLabel({
  position,
  text,
  color,
  offsetY = 0,
}: {
  position: [number, number, number];
  text: string;
  color: string;
  offsetY?: number;
}) {
  return (
    <Html position={position} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          transform: offsetY ? `translateY(${offsetY}px)` : undefined,
          fontFamily: 'monospace',
          fontSize: 11,
          lineHeight: '14px',
          color: '#fff',
          background: 'rgba(0,0,0,0.62)',
          border: `1px solid ${color}`,
          borderRadius: 4,
          padding: '1px 5px',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {text}
      </div>
    </Html>
  );
}

/** Continuous polyline built as a THREE.Line — avoids the `<line>` JSX intrinsic
 *  which TypeScript resolves to SVGLineElement. */
function GlLine({ geometry, color }: { geometry: THREE.BufferGeometry; color: string }) {
  const obj = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false, toneMapped: false });
    return new THREE.Line(geometry, mat);
  }, [geometry, color]);
  useEffect(
    () => () => {
      (obj.material as THREE.Material).dispose();
    },
    [obj]
  );
  return <primitive object={obj} />;
}

// Shared temps for updateHitTube (single-threaded per-frame reuse).
const _htDir = new THREE.Vector3();
const _htQuat = new THREE.Quaternion();
const _htYUp = new THREE.Vector3(0, 1, 0);
const _htWorld = new THREE.Vector3();
const _htScale = new THREE.Vector3();

/**
 * Imperatively positions/orients an invisible cylinder (`tube`) along local
 * points s→e and scales its radius to ~`pixels` screen pixels. Used as a robust
 * raycast/GPU-pick hit target along thin geometry lines, refreshed every frame so
 * it follows live-updating (e.g. bound) endpoints. Tube meshes are tagged
 * `__geoHelper` + `pickNodeId` by the caller.
 */
function updateHitTube(
  tube: THREE.Mesh,
  s: THREE.Vector3,
  e: THREE.Vector3,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any,
  pixels = 16
): void {
  _htDir.copy(e).sub(s);
  const len = _htDir.length() || 1e-6;
  tube.position.set((s.x + e.x) / 2, (s.y + e.y) / 2, (s.z + e.z) / 2);
  _htQuat.setFromUnitVectors(_htYUp, _htDir.normalize());
  tube.quaternion.copy(_htQuat);
  tube.getWorldPosition(_htWorld);
  const cam = state.camera;
  let wpp: number;
  if (cam.isPerspectiveCamera) {
    wpp =
      (2 * Math.tan((cam.fov * Math.PI) / 360) * cam.position.distanceTo(_htWorld)) /
      state.size.height;
  } else {
    wpp = (cam.top - cam.bottom) / (cam.zoom || 1) / state.size.height;
  }
  let ps = 1;
  if (tube.parent) {
    tube.parent.getWorldScale(_htScale);
    ps = _htScale.x || 1;
  }
  const r = Math.max((wpp * pixels) / ps, 1e-6);
  tube.scale.set(r, len, r);
}

function GeoDot({
  pixels,
  position,
  color,
  nodeId,
  selected,
}: {
  pixels: number;
  position: [number, number, number];
  color: string;
  nodeId: string;
  selected?: boolean;
}) {
  const hit = Math.max(pixels + 20, 28);
  const visPx = selected ? Math.max(pixels * 1.6 + 4, 12) : pixels;
  return (
    <>
      {/* selection glow halo */}
      {selected && (
        <ScreenSized pixels={visPx + 10} position={position}>
          <mesh userData={{ __geoHelper: true }}>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.22}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
        </ScreenSized>
      )}
      {visPx > 0 && (
        <ScreenSized pixels={visPx} position={position}>
          <mesh userData={{ __geoHelper: true }}>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
          </mesh>
        </ScreenSized>
      )}
      {/* invisible enlarged hit target with its own handler (robust picking) */}
      <ScreenSized pixels={hit} position={position}>
        <mesh userData={{ __geoHelper: true, pickNodeId: nodeId }}>
          <sphereGeometry args={[0.5, 10, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
        </mesh>
      </ScreenSized>
    </>
  );
}

function GeometryPointObj({
  node,
  geo,
  isSelected,
}: {
  node: SceneNode;
  geo: GeometryPointNode;
  isSelected: boolean;
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    node._threeObject = ref.current;
    return () => {
      node._threeObject = null;
    };
  }, [node]);
  const color = isSelected ? GEO_SELECT_COLOR : geo.color;
  const label =
    geo.label ||
    `${node.position[0].toFixed(2)}, ${node.position[1].toFixed(2)}, ${node.position[2].toFixed(2)}`;
  return (
    <group
      ref={ref}
      name={node.id}
      userData={{ pickNodeId: node.id }}
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      scale={node.scale}
    >
      <GeoDot
        pixels={geo.pixelSize}
        position={[0, 0, 0]}
        color={color}
        nodeId={node.id}
        selected={isSelected}
      />
      {geo.showLabel && <GeoLabel position={[0, 0, 0]} text={label} color={color} offsetY={-16} />}
    </group>
  );
}

function GeometrySegmentObj({
  node,
  geo,
  isSelected,
}: {
  node: SceneNode;
  geo: GeometrySegmentNode;
  isSelected: boolean;
  onSelect?: (id: string) => void;
}) {
  const { scene } = useThree();
  const ref = useRef<THREE.Group>(null);
  const startGrp = useRef<THREE.Group>(null);
  const endGrp = useRef<THREE.Group>(null);
  const labelGrp = useRef<THREE.Group>(null);
  const labelSpan = useRef<HTMLSpanElement>(null);
  const tubeRef = useRef<THREE.Mesh>(null);
  const color = isSelected ? GEO_SELECT_COLOR : geo.color;

  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
    return g;
  }, []);
  useEffect(() => () => lineGeo.dispose(), [lineGeo]);
  useEffect(() => {
    node._threeObject = ref.current;
    return () => {
      node._threeObject = null;
    };
  }, [node]);

  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);
  const tmpW = useMemo(() => new THREE.Vector3(), []);
  const tmpS = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const yUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  // Live, binding-aware resolution of both endpoints every frame: a bound point
  // copies the target node's world position (works during animation AND while the
  // target is dragged in the editor); an unbound point uses its stored value.
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    g.updateWorldMatrix(true, false);
    const resolve = (
      binding: string | null,
      fallback: [number, number, number],
      out: THREE.Vector3
    ) => {
      if (binding) {
        const t = scene.getObjectByName(binding);
        if (t) {
          t.getWorldPosition(tmpW);
          g.worldToLocal(tmpW);
          return out.copy(tmpW);
        }
      }
      return out.set(fallback[0], fallback[1], fallback[2]);
    };
    const s = resolve(geo.startBinding, geo.start, tmpA);
    const e = resolve(geo.endBinding, geo.end, tmpB);

    const pos = lineGeo.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, s.x, s.y, s.z);
    pos.setXYZ(1, e.x, e.y, e.z);
    pos.needsUpdate = true;
    lineGeo.computeBoundingSphere();

    startGrp.current?.position.copy(s);
    endGrp.current?.position.copy(e);

    const tube = tubeRef.current;
    if (tube) {
      dir.copy(e).sub(s);
      const len = dir.length() || 1e-6;
      tube.position.set((s.x + e.x) / 2, (s.y + e.y) / 2, (s.z + e.z) / 2);
      quat.setFromUnitVectors(yUp, dir.normalize());
      tube.quaternion.copy(quat);
      tube.getWorldPosition(tmpW);
      const cam = state.camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;
      let wpp: number;
      if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
        wpp =
          (2 * Math.tan((cam.fov * Math.PI) / 360) * cam.position.distanceTo(tmpW)) /
          state.size.height;
      } else {
        wpp = (cam.top - cam.bottom) / (cam.zoom || 1) / state.size.height;
      }
      let ps = 1;
      if (tube.parent) {
        tube.parent.getWorldScale(tmpS);
        ps = tmpS.x || 1;
      }
      const r = Math.max((wpp * 16) / ps, 1e-6);
      tube.scale.set(r, len, r);
    }

    if (labelGrp.current)
      labelGrp.current.position.set((s.x + e.x) / 2, (s.y + e.y) / 2, (s.z + e.z) / 2);
    if (labelSpan.current) labelSpan.current.textContent = s.distanceTo(e).toFixed(2);
  });

  return (
    <group
      ref={ref}
      name={node.id}
      userData={{ pickNodeId: node.id }}
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      scale={node.scale}
    >
      <GlLine geometry={lineGeo} color={color} />
      <mesh ref={tubeRef} userData={{ __geoHelper: true, pickNodeId: node.id }}>
        <cylinderGeometry args={[1, 1, 1, 10, 1, false]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
      <group ref={startGrp}>
        <GeoDot
          pixels={geo.pixelSize}
          position={[0, 0, 0]}
          color={color}
          nodeId={node.id}
          selected={isSelected}
        />
      </group>
      <group ref={endGrp}>
        <GeoDot
          pixels={geo.pixelSize}
          position={[0, 0, 0]}
          color={color}
          nodeId={node.id}
          selected={isSelected}
        />
      </group>
      {geo.showLength && (
        <group ref={labelGrp}>
          <Html center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                lineHeight: '14px',
                color: '#fff',
                background: 'rgba(0,0,0,0.62)',
                border: `1px solid ${color}`,
                borderRadius: 4,
                padding: '1px 5px',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              <span ref={labelSpan}>0</span>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

function GeometryLineObj({
  node,
  geo,
  isSelected,
}: {
  node: SceneNode;
  geo: GeometryLineNode;
  isSelected: boolean;
  onSelect?: (id: string) => void;
}) {
  const { scene } = useThree();
  const ref = useRef<THREE.Group>(null);
  const originGrp = useRef<THREE.Group>(null);
  const labelGrp = useRef<THREE.Group>(null);
  const tubeRef = useRef<THREE.Mesh>(null);
  const color = isSelected ? GEO_SELECT_COLOR : geo.color;

  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
    return g;
  }, []);
  useEffect(() => () => lineGeo.dispose(), [lineGeo]);
  useEffect(() => {
    node._threeObject = ref.current;
    return () => {
      node._threeObject = null;
    };
  }, [node]);

  const o = useMemo(() => new THREE.Vector3(), []);
  const d = useMemo(() => new THREE.Vector3(), []);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const tmpW = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    g.updateWorldMatrix(true, false);
    if (geo.originBinding) {
      const t = scene.getObjectByName(geo.originBinding);
      if (t) {
        t.getWorldPosition(tmpW);
        g.worldToLocal(tmpW);
        o.copy(tmpW);
      } else o.set(geo.origin[0], geo.origin[1], geo.origin[2]);
    } else {
      o.set(geo.origin[0], geo.origin[1], geo.origin[2]);
    }
    d.set(geo.direction[0], geo.direction[1], geo.direction[2]);
    if (d.lengthSq() < 1e-9) d.set(1, 0, 0);
    d.normalize();
    const BIG = 1e4;
    a.copy(o).addScaledVector(d, -BIG);
    b.copy(o).addScaledVector(d, BIG);
    const pos = lineGeo.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    lineGeo.computeBoundingSphere();
    originGrp.current?.position.copy(o);
    labelGrp.current?.position.copy(o);
    if (tubeRef.current) updateHitTube(tubeRef.current, a, b, state, 16);
  });

  return (
    <group
      ref={ref}
      name={node.id}
      userData={{ pickNodeId: node.id }}
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      scale={node.scale}
    >
      <GlLine geometry={lineGeo} color={color} />
      <mesh ref={tubeRef} userData={{ __geoHelper: true, pickNodeId: node.id }}>
        <cylinderGeometry args={[1, 1, 1, 10, 1, false]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
      <group ref={originGrp}>
        <GeoDot
          pixels={8}
          position={[0, 0, 0]}
          color={color}
          nodeId={node.id}
          selected={isSelected}
        />
      </group>
      {geo.showLabel && (
        <group ref={labelGrp}>
          <GeoLabel position={[0, 0, 0]} text={geo.label || 'line'} color={color} offsetY={-16} />
        </group>
      )}
    </group>
  );
}

function GeometryAngleObj({
  node,
  geo,
  isSelected,
}: {
  node: SceneNode;
  geo: GeometryAngleNode;
  isSelected: boolean;
  onSelect?: (id: string) => void;
}) {
  const { scene } = useThree();
  const ref = useRef<THREE.Group>(null);
  const vertexGrp = useRef<THREE.Group>(null);
  const arcAnchor = useRef<THREE.Group>(null);
  const labelGrp = useRef<THREE.Group>(null);
  const labelSpan = useRef<HTMLSpanElement>(null);
  const tube1 = useRef<THREE.Mesh>(null);
  const tube2 = useRef<THREE.Mesh>(null);
  const color = isSelected ? GEO_SELECT_COLOR : geo.color;
  const N = 36;

  const armsGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    return g;
  }, []);
  const arcGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((N + 1) * 3), 3));
    return g;
  }, []);
  useEffect(
    () => () => {
      armsGeo.dispose();
      arcGeo.dispose();
    },
    [armsGeo, arcGeo]
  );
  useEffect(() => {
    node._threeObject = ref.current;
    return () => {
      node._threeObject = null;
    };
  }, [node]);

  const V = useMemo(() => new THREE.Vector3(), []);
  const P1 = useMemo(() => new THREE.Vector3(), []);
  const P2 = useMemo(() => new THREE.Vector3(), []);
  const u = useMemo(() => new THREE.Vector3(), []);
  const w = useMemo(() => new THREE.Vector3(), []);
  const e2 = useMemo(() => new THREE.Vector3(), []);
  const pt = useMemo(() => new THREE.Vector3(), []);
  const tmpW = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    g.updateWorldMatrix(true, false);
    const resolve = (binding: string | null, fb: [number, number, number], out: THREE.Vector3) => {
      if (binding) {
        const t = scene.getObjectByName(binding);
        if (t) {
          t.getWorldPosition(tmpW);
          g.worldToLocal(tmpW);
          return out.copy(tmpW);
        }
      }
      return out.set(fb[0], fb[1], fb[2]);
    };
    resolve(geo.vertexBinding, geo.vertex, V);
    resolve(geo.p1Binding, geo.p1, P1);
    resolve(geo.p2Binding, geo.p2, P2);

    const ap = armsGeo.attributes.position as THREE.BufferAttribute;
    ap.setXYZ(0, V.x, V.y, V.z);
    ap.setXYZ(1, P1.x, P1.y, P1.z);
    ap.setXYZ(2, V.x, V.y, V.z);
    ap.setXYZ(3, P2.x, P2.y, P2.z);
    ap.needsUpdate = true;
    armsGeo.computeBoundingSphere();

    if (tube1.current) updateHitTube(tube1.current, V, P1, state, 16);
    if (tube2.current) updateHitTube(tube2.current, V, P2, state, 16);

    u.copy(P1).sub(V);
    w.copy(P2).sub(V);
    const arcp = arcGeo.attributes.position as THREE.BufferAttribute;
    let degrees = 0,
      mdx = 1,
      mdy = 0,
      mdz = 0;
    if (u.lengthSq() > 1e-9 && w.lengthSq() > 1e-9) {
      u.normalize();
      w.normalize();
      const cos = Math.max(-1, Math.min(1, u.dot(w)));
      const ang = Math.acos(cos);
      degrees = (ang * 180) / Math.PI;
      e2.copy(w).addScaledVector(u, -cos);
      if (e2.lengthSq() < 1e-9) {
        e2.set(1, 0, 0).cross(u);
        if (e2.lengthSq() < 1e-9) e2.set(0, 1, 0).cross(u);
      }
      e2.normalize();
      for (let i = 0; i <= N; i++) {
        const t = (ang * i) / N;
        pt.copy(u).multiplyScalar(Math.cos(t)).addScaledVector(e2, Math.sin(t));
        arcp.setXYZ(i, pt.x, pt.y, pt.z);
      }
      const half = ang / 2;
      mdx = Math.cos(half) * u.x + Math.sin(half) * e2.x;
      mdy = Math.cos(half) * u.y + Math.sin(half) * e2.y;
      mdz = Math.cos(half) * u.z + Math.sin(half) * e2.z;
    } else {
      for (let i = 0; i <= N; i++) arcp.setXYZ(i, 0, 0, 0);
    }
    arcp.needsUpdate = true;
    arcGeo.computeBoundingSphere();

    arcAnchor.current?.position.copy(V);
    vertexGrp.current?.position.copy(V);
    if (labelGrp.current) labelGrp.current.position.set(mdx, mdy, mdz);
    if (labelSpan.current) labelSpan.current.textContent = `${degrees.toFixed(1)}°`;
  });

  return (
    <group
      ref={ref}
      name={node.id}
      userData={{ pickNodeId: node.id }}
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      scale={node.scale}
    >
      <lineSegments geometry={armsGeo}>
        <lineBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </lineSegments>
      <mesh ref={tube1} userData={{ __geoHelper: true, pickNodeId: node.id }}>
        <cylinderGeometry args={[1, 1, 1, 10, 1, false]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh ref={tube2} userData={{ __geoHelper: true, pickNodeId: node.id }}>
        <cylinderGeometry args={[1, 1, 1, 10, 1, false]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
      <group ref={arcAnchor}>
        <ScreenSized pixels={geo.arcPixelRadius} position={[0, 0, 0]}>
          <GlLine geometry={arcGeo} color={color} />
          {geo.showLabel && (
            <group ref={labelGrp}>
              <Html center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    lineHeight: '14px',
                    color: '#fff',
                    background: 'rgba(0,0,0,0.62)',
                    border: `1px solid ${color}`,
                    borderRadius: 4,
                    padding: '1px 5px',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  <span ref={labelSpan}>0°</span>
                </div>
              </Html>
            </group>
          )}
        </ScreenSized>
      </group>
      <group ref={vertexGrp}>
        <GeoDot
          pixels={7}
          position={[0, 0, 0]}
          color={color}
          nodeId={node.id}
          selected={isSelected}
        />
      </group>
    </group>
  );
}

type RenderCtx = {
  selectedNodeId?: string | null;
  selectedIds?: Set<string>;
  forceSelected?: boolean;
  onNodeSelect?: (id: string) => void;
  renderMode?: SceneRenderMode;
  resolveAudioSrc?: (src: string) => Promise<string>;
  resolveTextureSrc?: (src: string) => Promise<string>;
  edges?: boolean;
};

function renderSceneNode(node: SceneNode, ctx: RenderCtx): ReactElement | null {
  if (!node.visible) return null;

  if (node.type === 'group') {
    const grpSel = ctx.selectedIds?.has(node.id) ?? false;
    let childCtx = ctx;
    // A "floor" group (e.g. the Lego baseplate) opts its subtree out of edge outlines.
    if (node.metadata?.floor) childCtx = { ...childCtx, edges: false };
    // A highlighted group propagates the highlight to its descendant meshes.
    if (grpSel) childCtx = { ...childCtx, forceSelected: true };
    const children = node.children
      .map((child) => renderSceneNode(child, childCtx))
      .filter((el): el is ReactElement => el !== null);
    return (
      <SceneGroup
        key={node.id}
        node={node}
        isSelected={node.id === ctx.selectedNodeId || grpSel}
        onSelect={ctx.onNodeSelect}
      >
        {children}
      </SceneGroup>
    );
  }

  if (node.type === 'mesh') {
    const sel =
      node.id === ctx.selectedNodeId ||
      (ctx.forceSelected ?? false) ||
      (ctx.selectedIds?.has(node.id) ?? false);
    return (
      <SelectableMesh
        key={node.id}
        node={node}
        meshNode={node as unknown as MeshNode}
        isSelected={sel}
        onSelect={ctx.onNodeSelect}
        renderMode={ctx.renderMode}
        edges={ctx.edges}
        resolveTextureSrc={ctx.resolveTextureSrc}
      />
    );
  }

  if (node.type === 'light') {
    return <SceneLight key={node.id} node={node} lightNode={node as unknown as LightNode} />;
  }

  if (node.type === 'camera') {
    return (
      <SceneCamera
        key={node.id}
        node={node}
        cameraNode={node as unknown as CameraNode}
        isSelected={node.id === ctx.selectedNodeId}
        onSelect={ctx.onNodeSelect}
      />
    );
  }

  if (node.type === 'audio') {
    return (
      <SceneAudio
        key={node.id}
        node={node}
        audioNode={node as unknown as SceneAudioNode}
        isSelected={node.id === ctx.selectedNodeId}
        onSelect={ctx.onNodeSelect}
        resolveAudioSrc={ctx.resolveAudioSrc}
      />
    );
  }

  if (node.type === 'geometry-point') {
    return (
      <GeometryPointObj
        key={node.id}
        node={node}
        geo={node as unknown as GeometryPointNode}
        isSelected={node.id === ctx.selectedNodeId}
        onSelect={ctx.onNodeSelect}
      />
    );
  }
  if (node.type === 'geometry-segment') {
    return (
      <GeometrySegmentObj
        key={node.id}
        node={node}
        geo={node as unknown as GeometrySegmentNode}
        isSelected={node.id === ctx.selectedNodeId}
        onSelect={ctx.onNodeSelect}
      />
    );
  }
  if (node.type === 'geometry-line') {
    return (
      <GeometryLineObj
        key={node.id}
        node={node}
        geo={node as unknown as GeometryLineNode}
        isSelected={node.id === ctx.selectedNodeId}
        onSelect={ctx.onNodeSelect}
      />
    );
  }
  if (node.type === 'geometry-angle') {
    return (
      <GeometryAngleObj
        key={node.id}
        node={node}
        geo={node as unknown as GeometryAngleNode}
        isSelected={node.id === ctx.selectedNodeId}
        onSelect={ctx.onNodeSelect}
      />
    );
  }

  return null;
}

/** Node types that support the move/rotate/scale gizmo — all of them.
 *  Safe to enable for geometry annotations now that selection runs through GPU
 *  picking (which hides the gizmo during its pick pass, so the gizmo can no longer
 *  intercept selection). GizmoControls renders nothing if no named target exists. */
function supportsGizmo(type?: string | null): boolean {
  return type != null;
}

function SceneRenderer({
  sceneGraph,
  version,
  selectedNodeId,
  selectedNodeIds,
  onNodeSelect,
  renderMode = 'realistic',
  resolveAudioSrc,
  resolveTextureSrc,
  edges = false,
}: {
  sceneGraph?: SceneGraph;
  version?: number;
  selectedNodeId?: string | null;
  selectedNodeIds?: string[];
  onNodeSelect?: (nodeId: string) => void;
  renderMode?: SceneRenderMode;
  resolveAudioSrc?: (src: string) => Promise<string>;
  resolveTextureSrc?: (src: string) => Promise<string>;
  edges?: boolean;
}) {
  const idsKey = (selectedNodeIds ?? []).join(',');
  const objects = useMemo(() => {
    if (!sceneGraph) return [];
    const selectedIds =
      selectedNodeIds && selectedNodeIds.length ? new Set(selectedNodeIds) : undefined;
    const ctx: RenderCtx = {
      selectedNodeId,
      selectedIds,
      onNodeSelect,
      renderMode,
      resolveAudioSrc,
      resolveTextureSrc,
      edges,
    };
    return sceneGraph.root.children
      .map((child) => renderSceneNode(child, ctx))
      .filter((el): el is ReactElement => el !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sceneGraph,
    version,
    selectedNodeId,
    idsKey,
    onNodeSelect,
    renderMode,
    resolveAudioSrc,
    resolveTextureSrc,
    edges,
  ]);

  return <group>{objects}</group>;
}

function GeoNodesGeometry({ graph }: { graph: GeoNodeGraph }) {
  const geometry = useMemo(() => evaluateGeoNodeGraph(graph), [graph]);
  return <primitive object={geometry} attach="geometry" />;
}

function ProceduralGeometry({ code }: { code: string }) {
  const geometry = useMemo(() => {
    try {
      const fn = new Function('THREE', code);
      const result = fn(THREE);
      if (result instanceof THREE.BufferGeometry) return result;
    } catch {
      // fall through to fallback
    }
    return new THREE.SphereGeometry(1, 8, 4);
  }, [code]);

  return <primitive object={geometry} attach="geometry" />;
}

function CustomBufferGeometry({ data }: { data: BufferGeometryData }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    if (data.normals) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    }
    // Współrzędne tekstury: bez nich mapa nie ma się na czym położyć i model
    // wchodzi biały, choć tekstura wczytała się poprawnie.
    if (data.uvs) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    }
    if (data.indices) {
      geo.setIndex(data.indices);
    }
    if (!data.normals) {
      geo.computeVertexNormals();
    }
    return geo;
  }, [data]);

  return <primitive object={geometry} attach="geometry" />;
}

function MeshGeometry({
  type,
  params,
  bufferData,
  code,
  nodesGraph,
}: {
  type: string;
  params?: Record<string, number>;
  bufferData?: BufferGeometryData;
  code?: string;
  nodesGraph?: GeoNodeGraph;
}) {
  switch (type) {
    case 'nodes':
      return <GeoNodesGeometry graph={nodesGraph ?? { nodes: [], edges: [] }} />;
    case 'procedural':
      return <ProceduralGeometry code={code ?? ''} />;
    case 'custom':
      if (!bufferData) return <boxGeometry />;
      return <CustomBufferGeometry data={bufferData} />;
    case 'sphere':
      return (
        <sphereGeometry
          args={[
            params?.['radius'] ?? 1,
            params?.['widthSegments'] ?? 32,
            params?.['heightSegments'] ?? 32,
          ]}
        />
      );
    case 'cylinder':
      return (
        <cylinderGeometry
          args={[
            params?.['radiusTop'] ?? 1,
            params?.['radiusBottom'] ?? 1,
            params?.['height'] ?? 2,
            params?.['radialSegments'] ?? 32,
          ]}
        />
      );
    case 'plane':
      return (
        <planeGeometry
          args={[
            params?.['width'] ?? 10,
            params?.['height'] ?? 10,
            params?.['widthSegments'] ?? 1,
            params?.['heightSegments'] ?? 1,
          ]}
        />
      );
    case 'cone':
      return (
        <coneGeometry
          args={[
            params?.['radius'] ?? 1,
            params?.['height'] ?? 2,
            params?.['radialSegments'] ?? 32,
          ]}
        />
      );
    case 'torus':
      return (
        <torusGeometry
          args={[
            params?.['radius'] ?? 1,
            params?.['tube'] ?? 0.4,
            params?.['radialSegments'] ?? 16,
            params?.['tubularSegments'] ?? 100,
          ]}
        />
      );
    case 'box':
    default:
      return (
        <boxGeometry
          args={[
            params?.['width'] ?? 1,
            params?.['height'] ?? 1,
            params?.['depth'] ?? 1,
            params?.['widthSegments'] ?? 1,
            params?.['heightSegments'] ?? 1,
            params?.['depthSegments'] ?? 1,
          ]}
        />
      );
  }
}

/** Fits the perspective camera to encompass all meshes in the scene. */
function FitCameraEffect({
  sceneGraph,
  autoFit,
  fitSceneRef,
  boundsRef,
}: {
  sceneGraph?: SceneGraph;
  autoFit?: boolean;
  fitSceneRef?: MutableRefObject<(() => void) | null>;
  boundsRef?: MutableRefObject<((nodeId: string) => [number, number, number] | null) | null>;
}) {
  const { camera, controls, scene } = useThree();

  // World-space bounding-box size of a node's subtree, resolved from the live
  // three object (accurate for baked/custom LDraw meshes too). __geoHelper meshes
  // are transient editing proxies and must not inflate the box.
  const getBounds = useCallback(
    (nodeId: string): [number, number, number] | null => {
      const obj = scene.getObjectByName(nodeId);
      if (!obj) return null;
      obj.updateWorldMatrix(true, true);
      const box = new THREE.Box3();
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        // Skip helpers and invisible meshes — notably a group's invisible origin
        // hit-target sphere, which would otherwise stretch the box to the pivot.
        if (!mesh.isMesh || !mesh.visible || mesh.userData?.__geoHelper) return;
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox)
          box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
      });
      if (box.isEmpty()) return null;
      const size = new THREE.Vector3();
      box.getSize(size);
      return [size.x, size.y, size.z];
    },
    [scene]
  );

  useEffect(() => {
    if (boundsRef) boundsRef.current = getBounds;
    return () => {
      if (boundsRef) boundsRef.current = null;
    };
  }, [boundsRef, getBounds]);

  const doFit = useCallback(() => {
    const box = new THREE.Box3();
    let hasMesh = false;
    scene.traverse((obj) => {
      if (
        (obj instanceof THREE.Mesh ||
          obj instanceof THREE.LineSegments ||
          obj instanceof THREE.Line) &&
        !obj.userData.__geoHelper
      ) {
        // ensure world matrices are up to date
        obj.updateWorldMatrix(true, false);
        obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox) {
          box.union(obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld));
          hasMesh = true;
        }
      }
    });
    if (!hasMesh) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;

    // Keep current view direction, just move along it to fit
    const dir = camera.position.clone().sub(center);
    if (dir.lengthSq() < 0.001) dir.set(1, 1, 1);
    dir.normalize();

    camera.position.copy(center.clone().addScaledVector(dir, dist));
    camera.near = dist * 0.01;
    camera.far = dist * 100;
    camera.updateProjectionMatrix();

    if (controls && 'target' in controls) {
      const orbitControls = controls as unknown as { target: THREE.Vector3; update(): void };
      orbitControls.target.copy(center);
      orbitControls.update();
    }
  }, [camera, controls, scene]);

  // Expose imperative handle to parent
  useEffect(() => {
    if (fitSceneRef) fitSceneRef.current = doFit;
    return () => {
      if (fitSceneRef) fitSceneRef.current = null;
    };
  }, [fitSceneRef, doFit]);

  // Auto-fit when sceneGraph is loaded or changes
  const childCount = sceneGraph?.root?.children?.length ?? 0;
  useEffect(() => {
    if (!autoFit || !sceneGraph) return;
    // Delay one frame so Three.js finishes building geometry
    const id = requestAnimationFrame(doFit);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFit, sceneGraph, childCount]);

  return null;
}

/** Debug: exposes live camera / controls / scene refs on window for dumpScene(). */
function Scene3dDebugProbe() {
  const { camera, controls, scene, size } = useThree();
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.__r3f_camera = camera;
    w.__r3f_controls = controls;
    w.__r3f_scene = scene;
    w.__r3f_size = size;
  }, [camera, controls, scene, size]);
  return null;
}

function ActiveSceneCamera({
  sceneGraph,
  activeCameraNodeId,
}: {
  sceneGraph: SceneGraph;
  activeCameraNodeId: string;
}) {
  const node = sceneGraph.findNode(activeCameraNodeId);
  if (!node || node.type !== 'camera') return null;
  const cam = node as unknown as CameraNode;

  if (cam.cameraType === 'orthographic') {
    return (
      <DreiOrthographicCamera
        makeDefault
        position={node.position}
        rotation={node.rotation as [number, number, number]}
        near={cam.near}
        far={cam.far}
        left={cam.left}
        right={cam.right}
        top={cam.top}
        bottom={cam.bottom}
      />
    );
  }
  return (
    <DreiPerspectiveCamera
      makeDefault
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      fov={cam.fov}
      near={cam.near}
      far={cam.far}
    />
  );
}

function PlacementPlane({ onPlaneClick }: { onPlaneClick: (wx: number, wz: number) => void }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onPlaneClick(e.point.x, e.point.z);
      }}
    >
      <planeGeometry args={[10000, 10000]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * GPU color picking for geometry annotations. On pointerdown it renders only the
 * pickable proxies (tagged userData.pickNodeId) into a 1×1 offscreen target — each
 * in a unique flat color — then reads the single pixel under the cursor and maps the
 * color back to a node id. This sidesteps raycaster line-threshold precision, gizmo
 * interception and R3F's click synthesis entirely: whatever is drawn under the cursor
 * IS the hit. Selection only fires on a positive hit; empty clicks fall through to the
 * normal onPointerMissed deselect path.
 */
function GpuPicker({ onPick }: { onPick?: (id: string | null) => void }) {
  const { gl, scene, camera } = useThree();
  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1), []);
  const reg = useMemo(
    () => ({
      next: 1,
      toInt: new Map<string, number>(),
      toId: new Map<number, string>(),
      mats: new Map<number, THREE.MeshBasicMaterial>(),
    }),
    []
  );

  useEffect(
    () => () => {
      target.dispose();
      reg.mats.forEach((m) => m.dispose());
    },
    [target, reg]
  );

  const matFor = useCallback(
    (nodeId: string) => {
      let v = reg.toInt.get(nodeId);
      if (!v) {
        v = reg.next++;
        reg.toInt.set(nodeId, v);
        reg.toId.set(v, nodeId);
      }
      let m = reg.mats.get(v);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ toneMapped: false });
        // Treat the value as already-linear so output bytes equal the encoded int exactly.
        m.color.setHex(v, THREE.LinearSRGBColorSpace);
        reg.mats.set(v, m);
      }
      return m;
    },
    [reg]
  );

  const pickAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      if (px < 0 || py < 0 || px >= rect.width || py >= rect.height) return null;

      // Resolve a node id from the object or any ancestor (roots are tagged).
      const resolveId = (o: THREE.Object3D): string | null => {
        let c: THREE.Object3D | null = o;
        while (c) {
          const id = c.userData?.pickNodeId as string | undefined;
          if (id) return id;
          c = c.parent;
        }
        return null;
      };

      const swapped: Array<[THREE.Mesh, THREE.Material | THREE.Material[] | null, boolean]> = [];
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh & {
          isLine?: boolean;
          isLineSegments?: boolean;
          isPoints?: boolean;
          isSprite?: boolean;
        };
        const renderable =
          mesh.isMesh || mesh.isLine || mesh.isLineSegments || mesh.isPoints || mesh.isSprite;
        if (!renderable) return;
        const id = mesh.isMesh ? resolveId(o) : null;
        if (id) {
          // selectable solid → render in its unique pick color
          swapped.push([mesh, mesh.material, mesh.visible]);
          mesh.material = matFor(id);
          mesh.visible = true;
        } else {
          // non-selectable (gizmo, grid, visible lines…) hidden so it can't
          // contaminate the single-pixel readback
          swapped.push([mesh, null, mesh.visible]);
          mesh.visible = false;
        }
      });

      const prevTarget = gl.getRenderTarget();
      const prevClear = new THREE.Color();
      gl.getClearColor(prevClear);
      const prevAlpha = gl.getClearAlpha();

      camera.setViewOffset(rect.width, rect.height, px, py, 1, 1);
      gl.setRenderTarget(target);
      gl.setClearColor(0x000000, 1);
      gl.clear();
      gl.render(scene, camera);

      const buf = new Uint8Array(4);
      gl.readRenderTargetPixels(target, 0, 0, 1, 1, buf);

      camera.clearViewOffset();
      gl.setRenderTarget(prevTarget);
      gl.setClearColor(prevClear, prevAlpha);
      swapped.forEach(([o, m, v]) => {
        if (m !== null) o.material = m;
        o.visible = v;
      });

      const value = (buf[0] << 16) | (buf[1] << 8) | buf[2];
      return value ? (reg.toId.get(value) ?? null) : null;
    },
    [gl, scene, camera, target, matFor, reg]
  );

  useEffect(() => {
    if (!onPick) return;
    const el = gl.domElement;
    let downX = 0,
      downY = 0,
      downBtn = -1;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downBtn = e.button;
    };
    const onUp = (e: PointerEvent) => {
      if (downBtn !== 0 || e.button !== 0) return;
      // Ignore drags (camera orbit / gizmo drag) — only a click selects.
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const hit = pickAt(e.clientX, e.clientY);

      console.log(
        `[GEO] gpu-pick client=(${Math.round(e.clientX)},${Math.round(e.clientY)}) -> ${hit ? hit.slice(0, 8) : 'null'}`
      );
      onPick(hit);
    };
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointerup', onUp, true);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointerup', onUp, true);
    };
  }, [gl, pickAt, onPick]);

  return null;
}

function SceneContent({
  sceneGraph,
  version,
  showGrid,
  selectedNodeId,
  selectedNodeIds,
  transformMode,
  cameraPreset = 'standard',
  onNodeSelect,
  autoFit,
  fitSceneRef,
  boundsRef,
  showAxesGizmo,
  activeCameraNodeId,
  renderMode = 'realistic',
  edges = false,
  flatLighting = false,
  viewCube = false,
  translationSnap = null,
  rotationSnap = null,
  extraObjects,
  showBoundingBox = false,
  sceneSettings,
  onObjectChange,
  onTransformEnd,
  onPlaneClick,
  isDraggingGizmoRef,
  addLog,
  resolveAudioSrc,
  resolveTextureSrc,
  gizmoSize = 0.7,
  geoPointEdit,
  onGeoPointChange,
}: {
  sceneGraph?: SceneGraph;
  version?: number;
  showGrid: boolean;
  selectedNodeId?: string | null;
  selectedNodeIds?: string[];
  transformMode: 'translate' | 'rotate' | 'scale';
  cameraPreset?: CameraPresetName;
  onNodeSelect?: (nodeId: string | null) => void;
  autoFit?: boolean;
  fitSceneRef?: MutableRefObject<(() => void) | null>;
  boundsRef?: MutableRefObject<((nodeId: string) => [number, number, number] | null) | null>;
  showAxesGizmo?: boolean;
  activeCameraNodeId?: string | null;
  renderMode?: SceneRenderMode;
  edges?: boolean;
  flatLighting?: boolean;
  viewCube?: boolean;
  translationSnap?: number | null;
  rotationSnap?: number | null;
  extraObjects?: THREE.Object3D | THREE.Object3D[];
  showBoundingBox?: boolean;
  sceneSettings?: SceneSettings;
  onObjectChange?: (obj: THREE.Object3D) => void;
  onTransformEnd?: (
    nodeId: string,
    mode: 'translate' | 'rotate' | 'scale',
    value: [number, number, number]
  ) => void;
  onPlaneClick?: (wx: number, wz: number) => void;
  isDraggingGizmoRef?: MutableRefObject<boolean>;
  addLog?: (msg: string) => void;
  resolveAudioSrc?: (src: string) => Promise<string>;
  resolveTextureSrc?: (src: string) => Promise<string>;
  gizmoSize?: number;
  geoPointEdit?: { nodeId: string; fieldKey: string } | null;
  onGeoPointChange?: (nodeId: string, fieldKey: string, value: [number, number, number]) => void;
}) {
  const selectedNode = selectedNodeId && sceneGraph ? sceneGraph.findNode(selectedNodeId) : null;
  const showGizmo = supportsGizmo(selectedNode?.type);
  const pointEditActive = !!(
    geoPointEdit &&
    selectedNodeId &&
    geoPointEdit.nodeId === selectedNodeId
  );
  const presetConfig = CAMERA_PRESETS[cameraPreset];

  // Log showGizmo state changes
  const prevShowGizmoRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevShowGizmoRef.current !== showGizmo) {
      addLog?.(`showGizmo=${showGizmo} node=${selectedNodeId?.slice(0, 8) ?? 'none'}`);
      prevShowGizmoRef.current = showGizmo;
    }
  });

  return (
    <>
      {activeCameraNodeId && sceneGraph ? (
        <ActiveSceneCamera sceneGraph={sceneGraph} activeCameraNodeId={activeCameraNodeId} />
      ) : null}
      {/* Orbit stays enabled even with a selection/gizmo — TransformControls auto-disables
          it only while a gizmo handle is actively dragged (via its 'dragging-changed').
          Disabling it on mere selection froze the camera ("kamera się blokuje"). */}
      <OrbitControls
        makeDefault={!activeCameraNodeId}
        enabled={!activeCameraNodeId}
        enableDamping={false}
        mouseButtons={
          presetConfig.mouseButtons as Partial<{
            LEFT: THREE.MOUSE;
            MIDDLE: THREE.MOUSE;
            RIGHT: THREE.MOUSE;
          }>
        }
      />
      {sceneSettings?.backgroundType === 'solid' && (
        <color attach="background" args={[sceneSettings.backgroundColor]} />
      )}
      {sceneSettings?.fogType === 'linear' && (
        <fog
          attach="fog"
          args={[sceneSettings.fogColor, sceneSettings.fogNear, sceneSettings.fogFar]}
        />
      )}
      {sceneSettings?.fogType === 'exp2' && (
        <fogExp2 attach="fog" args={[sceneSettings.fogColor, sceneSettings.fogDensity]} />
      )}
      {sceneSettings?.environmentPreset && sceneSettings.environmentPreset !== 'none' && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Environment preset={sceneSettings.environmentPreset as any} />
      )}
      <AudioListenerEffect />
      {flatLighting ? (
        // Uniform lighting: every face lit independently of view direction (LeoCAD-like).
        <>
          <ambientLight intensity={0.9} />
          <hemisphereLight args={['#ffffff', '#8a8a8a', 0.6]} />
        </>
      ) : (
        <>
          <ambientLight intensity={0.3} />
          <directionalLight position={[10, 10, 5]} intensity={0.7} />
        </>
      )}
      {showGrid && <gridHelper args={[20, 20, '#444444', '#333333']} />}
      {(Array.isArray(extraObjects) ? extraObjects : extraObjects ? [extraObjects] : []).map(
        (o) => (
          <primitive key={o.uuid} object={o} />
        )
      )}
      {showBoundingBox && (selectedNodeId || (selectedNodeIds?.length ?? 0) > 0) && (
        <SelectionBoxes
          ids={Array.from(
            new Set([...(selectedNodeId ? [selectedNodeId] : []), ...(selectedNodeIds ?? [])])
          )}
        />
      )}
      <SceneRenderer
        sceneGraph={sceneGraph}
        version={version}
        selectedNodeId={selectedNodeId}
        selectedNodeIds={selectedNodeIds}
        onNodeSelect={onNodeSelect}
        renderMode={renderMode}
        resolveAudioSrc={resolveAudioSrc}
        resolveTextureSrc={resolveTextureSrc}
        edges={edges}
      />
      <GpuPicker onPick={onNodeSelect} />
      {pointEditActive && sceneGraph && geoPointEdit ? (
        <PointEditGizmo
          sceneGraph={sceneGraph}
          nodeId={geoPointEdit.nodeId}
          fieldKey={geoPointEdit.fieldKey}
          onChange={onGeoPointChange}
          isDraggingGizmoRef={isDraggingGizmoRef}
          gizmoSize={gizmoSize}
        />
      ) : (
        showGizmo &&
        sceneGraph &&
        selectedNodeId && (
          <GizmoControls
            sceneGraph={sceneGraph}
            selectedNodeId={selectedNodeId}
            version={version}
            transformMode={transformMode}
            translationSnap={translationSnap}
            rotationSnap={rotationSnap}
            onObjectChange={onObjectChange}
            onTransformEnd={onTransformEnd}
            isDraggingGizmoRef={isDraggingGizmoRef}
            addLog={addLog}
            gizmoSize={gizmoSize}
          />
        )
      )}
      <FitCameraEffect
        sceneGraph={sceneGraph}
        autoFit={autoFit}
        fitSceneRef={fitSceneRef}
        boundsRef={boundsRef}
      />
      <Scene3dDebugProbe />
      {onPlaneClick && <PlacementPlane onPlaneClick={onPlaneClick} />}
      {viewCube ? (
        <GizmoHelper alignment="top-right" margin={[68, 68]}>
          <GizmoViewcube
            font="16px Inter, sans-serif"
            faces={['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back']}
            color="#3a3f45"
            hoverColor="#4fc3f7"
            textColor="#e8e8e8"
            strokeColor="#22262b"
          />
        </GizmoHelper>
      ) : showAxesGizmo !== false ? (
        <GizmoHelper alignment="bottom-left" margin={[72, 72]}>
          <GizmoViewport axisColors={['#e05555', '#55cc55', '#4488ff']} labelColor="white" />
        </GizmoHelper>
      ) : null}
    </>
  );
}

export function SimpleViewer({
  sceneGraph,
  version,
  showGrid = true,
  selectedNodeId,
  selectedNodeIds,
  transformMode = 'translate',
  cameraPreset = 'standard',
  onNodeSelect,
  width = '100%',
  height = '100%',
  backgroundColor = '#2a2a2a',
  className,
  style,
  autoFit,
  fitSceneRef,
  boundsRef,
  showAxesGizmo,
  activeCameraNodeId,
  renderMode = 'realistic',
  edges = false,
  flatLighting = false,
  viewCube = false,
  translationSnap = null,
  rotationSnap = null,
  extraObjects,
  overlay3d,
  showBoundingBox = false,
  sceneSettings,
  onPlaneClick,
  debugLog = false,
  resolveAudioSrc,
  resolveTextureSrc,
  gizmoSize = 0.7,
  onGizmoTransformEnd,
  geoPointEdit,
  onGeoPointChange,
}: SimpleViewerProps) {
  const scaleXRef = useRef<HTMLSpanElement>(null);
  const scaleYRef = useRef<HTMLSpanElement>(null);
  const scaleZRef = useRef<HTMLSpanElement>(null);

  // ── Debug log ────────────────────────────────────────────────────────────────
  const DEBUG_MAX = 24;
  const debugLinesRef = useRef<string[]>([]);
  const debugScrollRef = useRef<HTMLDivElement>(null);
  const [, setDebugVer] = useState(0);
  const pendingSendRef = useRef<string[]>([]);
  const debugSessionRef = useRef(`s${Date.now().toString(36)}`);

  const addLog = useCallback(
    (msg: string) => {
      if (!debugLog) return;
      const now = new Date();
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
      const line = `${ts} ${msg}`;
      debugLinesRef.current = [...debugLinesRef.current.slice(-(DEBUG_MAX - 1)), line];
      pendingSendRef.current.push(`[${debugSessionRef.current}] ${line}`);
      setDebugVer((v) => v + 1);
    },
    [debugLog]
  );

  // Auto-flush pending lines to cad-backend every 2s
  useEffect(() => {
    if (!debugLog) return;
    const id = setInterval(() => {
      const lines = pendingSendRef.current.splice(0);
      if (lines.length === 0) return;
      fetch('/api/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      }).catch(() => {
        /* ignore network errors */
      });
    }, 2000);
    return () => clearInterval(id);
  }, [debugLog]);

  // Auto-scroll debug panel to bottom on new entries
  useLayoutEffect(() => {
    if (debugScrollRef.current) {
      debugScrollRef.current.scrollTop = debugScrollRef.current.scrollHeight;
    }
  });

  // Gizmo drag guard — prevents onPointerMissed from deselecting while dragging a gizmo handle
  const isDraggingGizmoRef = useRef(false);

  // Pen/stylus hover filter — block pointer *hover* events only (no button held).
  // Uses `buttons === 0` rather than `pressure === 0`: many pens/styluses report
  // pressure 0 even while touching, and keying on pressure would wrongly swallow
  // move events during a drag, breaking orbit/pan/gizmo with those pens.
  const [glInstance, setGlInstance] = useState<THREE.WebGLRenderer | null>(null);
  // Pen hover events are logged only to the on-screen overlay (not sent to server) to avoid flooding the buffer
  const hoverBlockCountRef = useRef(0);
  // Pointers currently in contact (between pointerdown and pointerup/cancel).
  // A pointer in this set is dragging and its moves must NEVER be filtered.
  const activePointerDownRef = useRef<Set<number>>(new Set());
  const filterPenHover = useCallback(
    (e: PointerEvent) => {
      // Never touch a pointer that is currently down — that's a drag, not hover.
      // This is the authoritative guard; buttons/pressure are only a fallback for
      // the very first move that may arrive before our pointerdown tracker, since
      // some digitizers report a tip-down drag as buttons===0 AND pressure===0.
      if (activePointerDownRef.current.has(e.pointerId)) return;
      // True hover = tip NOT touching the surface. Some digitizers report a
      // tip-down drag as buttons===0 with pressure>0 (buttons is unreliable for
      // pens), so requiring pressure===0 as well is essential — otherwise this
      // filter stopImmediatePropagation()s every move during a pen drag and
      // OrbitControls never sees it (camera rotation silently dies with a pen).
      if (
        e.pointerType === 'pen' &&
        e.buttons === 0 &&
        e.pressure === 0 &&
        !isDraggingGizmoRef.current
      ) {
        hoverBlockCountRef.current++;
        // Only show every 20th hover-blocked event in the overlay, never send to server
        if (debugLog && hoverBlockCountRef.current % 20 === 1) {
          const now = new Date();
          const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
          const line = `${ts} hover blocked ×${hoverBlockCountRef.current}`;
          debugLinesRef.current = [...debugLinesRef.current.slice(-(DEBUG_MAX - 1)), line];
          setDebugVer((v) => v + 1);
          // NOT pushed to pendingSendRef — don't flood server buffer
        }
        e.stopImmediatePropagation();
      }
    },
    [debugLog]
  );

  // WebGL context loss/restore — preventDefault on lost is REQUIRED for the browser
  // to later fire 'restored'; without it the viewport stays frozen permanently
  // (which looks exactly like "clicks/selection do nothing").
  useEffect(() => {
    if (!glInstance) return;
    const el = glInstance.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();

      console.warn('[GEO] WebGL context LOST — viewport frozen until restored');
    };
    const onRestored = () => {
      console.warn('[GEO] WebGL context RESTORED');
      setDebugVer((v) => v + 1); // nudge a re-render
    };
    el.addEventListener('webglcontextlost', onLost, false);
    el.addEventListener('webglcontextrestored', onRestored, false);
    return () => {
      el.removeEventListener('webglcontextlost', onLost);
      el.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [glInstance]);

  // Diagnostic: capture-phase raw pointerdown — fires for EVERY click over the canvas,
  // even ones the gizmo/TransformControls later swallows. A "dead" click shows up as a
  // [GEO] RAW down with no following [GEO] click / pointerMissed → that = gizmo ate it.
  useEffect(() => {
    if (!glInstance) return;
    const el = glInstance.domElement;
    const onDown = (e: PointerEvent) => {
      console.log(
        `[GEO] RAW down client=(${e.clientX},${e.clientY}) btn=${e.button} type=${e.pointerType}`
      );
    };
    el.addEventListener('pointerdown', onDown, true);
    return () => el.removeEventListener('pointerdown', onDown, true);
  }, [glInstance]);

  // pointercancel → synthetic pointerup — fixes TransformControls getting stuck when stylus
  // is lifted quickly (browser fires cancel instead of up; Three.js TC doesn't handle cancel).
  useEffect(() => {
    if (!glInstance) return;
    const el = glInstance.domElement;
    const onCancel = (e: PointerEvent) => {
      addLog?.(`✕ ${e.pointerType} cancel pid=${e.pointerId}`);
      try {
        el.dispatchEvent(
          new PointerEvent('pointerup', {
            pointerId: e.pointerId,
            pointerType: e.pointerType,
            button: 0,
            clientX: e.clientX,
            clientY: e.clientY,
            bubbles: true,
            cancelable: false,
          })
        );
      } catch {
        /* ignore */
      }
    };
    el.addEventListener('pointercancel', onCancel);
    return () => el.removeEventListener('pointercancel', onCancel);
  }, [glInstance, addLog]);

  // Native pointer event logging on the canvas
  useEffect(() => {
    if (!glInstance || !debugLog) return;
    const el = glInstance.domElement;
    const onDown = (e: PointerEvent) => {
      addLog(
        `↓ ${e.pointerType} btn=${e.button} p=${e.pressure.toFixed(2)} (${e.offsetX.toFixed(0)},${e.offsetY.toFixed(0)})`
      );
    };
    const onUp = (e: PointerEvent) => {
      addLog(`↑ ${e.pointerType} btn=${e.button} p=${e.pressure.toFixed(2)}`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pressure > 0)
        addLog(
          `→ ${e.pointerType} p=${e.pressure.toFixed(2)} (${e.offsetX.toFixed(0)},${e.offsetY.toFixed(0)})`
        );
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
    };
  }, [glInstance, debugLog, addLog]);

  // Track in-contact pointers so filterPenHover can tell a drag from a hover
  // regardless of unreliable buttons/pressure reporting. Capture phase + set
  // updated on pointerdown guarantees the flag is live before the first move.
  useEffect(() => {
    if (!glInstance) return;
    const el = glInstance.domElement;
    const set = activePointerDownRef.current;
    const onDown = (e: PointerEvent) => {
      set.add(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      set.delete(e.pointerId);
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('pointercancel', onUp, { capture: true });
    window.addEventListener('pointerup', onUp, { capture: true });
    window.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', onUp, { capture: true });
      window.removeEventListener('pointerup', onUp, { capture: true });
      window.removeEventListener('pointercancel', onUp, { capture: true });
    };
  }, [glInstance]);

  useEffect(() => {
    if (!glInstance) return;
    const el = glInstance.domElement;
    el.addEventListener('pointermove', filterPenHover, { capture: true });
    el.addEventListener('pointerover', filterPenHover, { capture: true });
    el.addEventListener('pointerenter', filterPenHover, { capture: true });
    return () => {
      el.removeEventListener('pointermove', filterPenHover, { capture: true });
      el.removeEventListener('pointerover', filterPenHover, { capture: true });
      el.removeEventListener('pointerenter', filterPenHover, { capture: true });
    };
  }, [glInstance, filterPenHover]);

  const handleLiveTransform = useCallback((obj: THREE.Object3D) => {
    if (scaleXRef.current) scaleXRef.current.textContent = obj.scale.x.toFixed(3);
    if (scaleYRef.current) scaleYRef.current.textContent = obj.scale.y.toFixed(3);
    if (scaleZRef.current) scaleZRef.current.textContent = obj.scale.z.toFixed(3);
  }, []);

  const selectedNode = selectedNodeId && sceneGraph ? sceneGraph.findNode(selectedNodeId) : null;
  // R3F fires onPointerMissed for EVERY tap on the gizmo (<primitive> has no R3F handlers).
  // On mobile/stylus a tap always emits click → onPointerMissed → deselects node → gizmo gone.
  // Fix: suppress deselection whenever transform handles are visible.
  const showGizmo = supportsGizmo(selectedNode?.type);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        touchAction: 'none',
        ...style,
      }}
    >
      <Canvas
        camera={{ position: [5, 5, 5], fov: 75 }}
        style={{ background: backgroundColor }}
        onPointerMissed={(e) => {
          const drag = isDraggingGizmoRef.current;
          const type = (e as unknown as PointerEvent).pointerType ?? 'mouse';
          addLog(
            `miss ${type} drag=${drag} gizmo=${showGizmo} → ${!drag ? 'DESELECT' : 'blocked'}`
          );
          // Deselect is handled by GpuPicker (click-miss → onPick(null)); this path
          // only logs now, since with GPU picking there are no R3F interaction objects.

          console.log(
            `[GEO] pointerMissed type=${type} client=(${(e as unknown as MouseEvent).clientX},${(e as unknown as MouseEvent).clientY}) drag=${drag}`
          );
        }}
        onCreated={({ gl }) => {
          // Stop the browser turning pen/touch drags into scroll/zoom gestures.
          gl.domElement.style.touchAction = 'none';
          setGlInstance(gl);
        }}
      >
        <SceneContent
          sceneGraph={sceneGraph}
          version={version}
          showGrid={showGrid}
          selectedNodeId={selectedNodeId}
          selectedNodeIds={selectedNodeIds}
          transformMode={transformMode}
          cameraPreset={cameraPreset}
          onNodeSelect={onNodeSelect}
          autoFit={autoFit}
          fitSceneRef={fitSceneRef}
          boundsRef={boundsRef}
          showAxesGizmo={showAxesGizmo}
          activeCameraNodeId={activeCameraNodeId}
          renderMode={renderMode}
          edges={edges}
          flatLighting={flatLighting}
          viewCube={viewCube}
          translationSnap={translationSnap}
          rotationSnap={rotationSnap}
          extraObjects={extraObjects}
          showBoundingBox={showBoundingBox}
          sceneSettings={sceneSettings}
          onObjectChange={handleLiveTransform}
          onTransformEnd={onGizmoTransformEnd}
          onPlaneClick={onPlaneClick}
          isDraggingGizmoRef={isDraggingGizmoRef}
          addLog={addLog}
          resolveAudioSrc={resolveAudioSrc}
          resolveTextureSrc={resolveTextureSrc}
          gizmoSize={gizmoSize}
          geoPointEdit={geoPointEdit}
          onGeoPointChange={onGeoPointChange}
        />
        {overlay3d}
      </Canvas>
      {selectedNode && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            borderRadius: 4,
            padding: '4px 8px',
            pointerEvents: 'none',
            fontFamily: 'monospace',
            fontSize: 11,
            lineHeight: '18px',
            color: '#ccc',
            userSelect: 'none',
            zIndex: 10,
          }}
        >
          <div
            style={{
              color: '#777',
              fontSize: 9,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 1,
            }}
          >
            Scale
          </div>
          <div>
            <span style={{ color: '#e05555', marginRight: 6 }}>X</span>
            <span ref={scaleXRef}>{selectedNode.scale[0].toFixed(3)}</span>
          </div>
          <div>
            <span style={{ color: '#55cc55', marginRight: 6 }}>Y</span>
            <span ref={scaleYRef}>{selectedNode.scale[1].toFixed(3)}</span>
          </div>
          <div>
            <span style={{ color: '#4488ff', marginRight: 6 }}>Z</span>
            <span ref={scaleZRef}>{selectedNode.scale[2].toFixed(3)}</span>
          </div>
        </div>
      )}
      {debugLog && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            maxHeight: 220,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(4px)',
            borderRadius: 6,
            border: '1px solid rgba(79,195,247,0.35)',
            padding: '4px 6px',
            pointerEvents: 'none',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              color: '#4fc3f7',
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 2,
              flexShrink: 0,
            }}
          >
            DEBUG LOG
          </div>
          <div
            ref={debugScrollRef}
            style={{
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: 10,
              lineHeight: '15px',
              color: '#ccc',
              wordBreak: 'break-all',
            }}
          >
            {debugLinesRef.current.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.includes('DESELECT')
                    ? '#ff7070'
                    : line.includes('blocked')
                      ? '#7fc97f'
                      : line.includes('↓')
                        ? '#ffe082'
                        : '#ccc',
                }}
              >
                {line}
              </div>
            ))}
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              color: '#555',
              marginTop: 2,
              flexShrink: 0,
            }}
          >
            selected: {selectedNodeId?.slice(0, 8) ?? 'none'} | gizmo: {String(showGizmo)} | drag:{' '}
            {String(isDraggingGizmoRef.current)}
          </div>
        </div>
      )}
    </div>
  );
}
