/**
 * Import glTF/GLB — na prawdziwym pliku, nie na atrapie.
 *
 * Plik składamy w teście — GLB to nagłówek, JSON i blok danych, więc da się
 * napisać ręcznie kompletny model i puścić go przez ten sam loader, którego
 * używa aplikacja. Atrapa parsera sprawdzałaby wyłącznie to, że umiem napisać
 * atrapę.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLTFImporter, opiszMaterial } from './GLTFImporter';
import { MeshNode } from '../nodes/MeshNode';
import { GroupNode } from '../nodes/GroupNode';

/** Trójkąt: trzy wierzchołki po trzy floaty. */
const WIERZCHOLKI = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);

/**
 * Składa prawdziwy plik GLB: nagłówek, część JSON i część binarna.
 *
 * Nie `data:` URI w polu `uri` — takie odwołanie loader wczytuje przez
 * `FileLoader`, czyli przez XHR, którego w teście nie ma. GLB trzyma dane
 * w tym samym pliku, więc parser nie sięga nigdzie na zewnątrz. To zresztą
 * wariant, którym ludzie naprawdę wymieniają się modelami.
 */
function glb(json: Record<string, unknown>, bin: Float32Array): ArrayBuffer {
  const wyrownaj = (n: number) => (n + 3) & ~3;

  const jsonBajty = new TextEncoder().encode(JSON.stringify(json));
  const jsonDlugosc = wyrownaj(jsonBajty.length);
  const binBajty = new Uint8Array(bin.buffer.slice(0));
  const binDlugosc = wyrownaj(binBajty.length);

  const calosc = 12 + 8 + jsonDlugosc + 8 + binDlugosc;
  const bufor = new ArrayBuffer(calosc);
  const widok = new DataView(bufor);
  const bajty = new Uint8Array(bufor);

  widok.setUint32(0, 0x46546c67, true); // „glTF"
  widok.setUint32(4, 2, true);
  widok.setUint32(8, calosc, true);

  widok.setUint32(12, jsonDlugosc, true);
  widok.setUint32(16, 0x4e4f534a, true); // „JSON"
  bajty.set(jsonBajty, 20);
  // Dopełnienie spacjami — tego wymaga specyfikacja dla części JSON.
  for (let i = jsonBajty.length; i < jsonDlugosc; i += 1) bajty[20 + i] = 0x20;

  const binOffset = 20 + jsonDlugosc;
  widok.setUint32(binOffset, binDlugosc, true);
  widok.setUint32(binOffset + 4, 0x004e4942, true); // „BIN\0"
  bajty.set(binBajty, binOffset + 8);

  return bufor;
}

/**
 * Model: grupa „Podwozie" z jedną siatką „Koło" w środku, materiał czerwony.
 *
 * Hierarchia jest tu istotna — to ona ginęła przy dotychczasowym imporcie,
 * który brał pierwszą napotkaną siatkę i wyrzucał resztę.
 */
function modelGltf(): ArrayBuffer {
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'Podwozie', children: [1], translation: [1, 2, 3] },
      { name: 'Koło', mesh: 0, scale: [2, 2, 2] },
    ],
    meshes: [{ name: 'Koło', primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{
      name: 'Lakier',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 0, 0, 1],
        metallicFactor: 0.25,
        roughnessFactor: 0.75,
      },
      emissiveFactor: [0, 0, 0],
    }],
    accessors: [{
      bufferView: 0,
      componentType: 5126,
      count: 3,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [1, 1, 0],
    }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: WIERZCHOLKI.byteLength }],
    buffers: [{ byteLength: WIERZCHOLKI.byteLength }],
  };

  return glb(gltf, WIERZCHOLKI);
}

describe('import glTF', () => {
  it('zachowuje hierarchię, a nie tylko pierwszą siatkę', async () => {
    const wynik = await GLTFImporter.importFromBuffer(modelGltf(), 'auto.glb');

    const korzenie = wynik.graph.root.children;
    expect(korzenie).toHaveLength(1);
    expect(korzenie[0]).toBeInstanceOf(GroupNode);
    expect(korzenie[0].name).toBe('Podwozie');

    expect(korzenie[0].children).toHaveLength(1);
    expect(korzenie[0].children[0]).toBeInstanceOf(MeshNode);
    expect(korzenie[0].children[0].name).toBe('Koło');
  });

  it('przenosi przekształcenia węzłów', async () => {
    const wynik = await GLTFImporter.importFromBuffer(modelGltf(), 'auto.glb');
    const grupa = wynik.graph.root.children[0];

    expect(grupa.position).toEqual([1, 2, 3]);
    expect(grupa.children[0].scale).toEqual([2, 2, 2]);
  });

  it('przenosi materiał PBR, nie samą barwę', async () => {
    const wynik = await GLTFImporter.importFromBuffer(modelGltf(), 'auto.glb');
    const siatka = wynik.graph.root.children[0].children[0] as MeshNode;

    expect(siatka.material.color).toBe('#ff0000');
    // glTF opisuje powierzchnię metalicznością i chropowatością; zgubienie ich
    // zamienia lakier w plastik.
    expect(siatka.material.metalness).toBeCloseTo(0.25, 6);
    expect(siatka.material.roughness).toBeCloseTo(0.75, 6);
  });

  it('przenosi geometrię', async () => {
    const wynik = await GLTFImporter.importFromBuffer(modelGltf(), 'auto.glb');
    const siatka = wynik.graph.root.children[0].children[0] as MeshNode;

    expect(siatka.geometry.type).toBe('custom');
    expect(siatka.geometry.bufferData?.positions).toHaveLength(9);
  });

  it('liczy, co powstało — import bez informacji zwrotnej wygląda jak awaria', async () => {
    const wynik = await GLTFImporter.importFromBuffer(modelGltf(), 'auto.glb');
    expect(wynik.nodeCount).toBe(2);
    expect(wynik.meshCount).toBe(1);
    expect(wynik.warnings).toEqual([]);
  });

  it('uszkodzony plik kończy się zrozumiałym błędem, nie pustą sceną', async () => {
    const smiec = new TextEncoder().encode('to nie jest glTF').buffer as ArrayBuffer;
    await expect(GLTFImporter.importFromBuffer(smiec, 'zepsuty.gltf')).rejects.toThrow(/glTF|gltf/i);
  });

  it('model bez siatek jest zgłaszany, a nie cicho pomijany', async () => {
    const puste = glb({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'Pusty' }],
    }, new Float32Array(0));

    const wynik = await GLTFImporter.importFromBuffer(puste, 'puste.gltf');
    expect(wynik.meshCount).toBe(0);
    expect(wynik.warnings.join(' ')).toMatch(/siatk/i);
  });
});

/**
 * Współrzędne tekstury.
 *
 * Bez nich mapa nie ma się na czym położyć — model wchodzi biały nawet wtedy,
 * gdy tekstura przeszła poprawnie.
 *
 * **Czego tu nie ma:** modelu z obrazem osadzonym w pliku. Loader rozpakowuje
 * taki obraz przez API przeglądarki (`self`, `createImageBitmap`), którego
 * w Node nie ma, a jsdom nie dekoduje PNG — wczytywanie wisi do timeoutu.
 * Samo przepisanie obrazu na zapis sprawdza `textureData.test.ts`, bez loadera.
 */
describe('współrzędne tekstury', () => {
  function modelZUv(): ArrayBuffer {
    const wierzcholki = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uv = new Float32Array([0, 0, 1, 0, 0, 1]);

    const bin = new Float32Array(wierzcholki.length + uv.length);
    bin.set(wierzcholki, 0);
    bin.set(uv, wierzcholki.length);

    return glb({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'Kostka', mesh: 0 }],
      meshes: [{ name: 'Kostka', primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 } }] }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2', min: [0, 0], max: [1, 1] },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: wierzcholki.byteLength },
        { buffer: 0, byteOffset: wierzcholki.byteLength, byteLength: uv.byteLength },
      ],
      buffers: [{ byteLength: bin.byteLength }],
    }, bin);
  }

  it('geometria niesie UV, gdy plik je ma', async () => {
    const wynik = await GLTFImporter.importFromBuffer(modelZUv(), 'BoxTextured.glb');
    const siatka = wynik.graph.root.children[0] as MeshNode;

    expect(siatka.geometry.bufferData?.uvs).toBeDefined();
    expect(siatka.geometry.bufferData?.uvs).toHaveLength(6);
  });
});

describe('sposób nakładania tekstury', () => {
  /**
   * Rysownik-atrapa: przerysowanie obrazu wymaga płótna, którego w teście nie ma,
   * a sprawdzamy tu co innego — czy z materiału schodzi żądanie powtarzania.
   */
  const rysownik = { narysuj: () => 'data:image/png;base64,AAAA' };

  function materialZTekstura(wrap: THREE.Wrapping): THREE.MeshStandardMaterial {
    const t = new THREE.Texture();
    // Obraz musi mieć wymiary, inaczej przepisanie kończy się przed czasem.
    t.image = { width: 4, height: 4 };
    t.wrapS = wrap;
    t.wrapT = wrap;
    t.flipY = false;

    const mat = new THREE.MeshStandardMaterial();
    mat.map = t;
    return mat;
  }

  it('przenosi powtarzanie z pliku na materiał sceny', () => {
    // To ginęło: „BoxTextured.glb" ma współrzędne od 0 do 6 i żąda REPEAT.
    // Bez tego ustawienia cała bryła próbkuje jeden piksel brzegu i wychodzi
    // jednolicie szara — objaw nie do odróżnienia od braku tekstury.
    const opis = opiszMaterial(materialZTekstura(THREE.RepeatWrapping), { rysownik }, () => {});

    expect(opis.textureSettings?.wrapS).toBe('repeat');
    expect(opis.textureSettings?.wrapT).toBe('repeat');
    expect(opis.textureSettings?.flipY).toBe(false);
  });

  it('nie dopisuje ustawień, gdy plik ich nie wymaga', () => {
    const opis = opiszMaterial(materialZTekstura(THREE.ClampToEdgeWrapping), { rysownik }, () => {});

    expect(opis.textureSettings).toEqual({ flipY: false });
  });
});
