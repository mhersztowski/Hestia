/**
 * SurfaceStage — powierzchnia `z = f(x, y)` w przestrzeni.
 *
 * Three.js wchodzi **leniwie**, tak samo jak w `LinAlgStage3D`: dokument bez
 * powierzchni nie pobiera silnika graficznego, a jest to kilkaset kilobajtów.
 * Do czasu wczytania stoi tu miejsce o właściwej wysokości, żeby strona nie
 * skakała.
 *
 * Rysujemy imperatywnie, bo geometria powstaje z wyrażenia przy każdej zmianie
 * suwaka — deklaratywne drzewo komponentów byłoby tu warstwą, która nic nie
 * wnosi, a kosztuje przy każdej klatce.
 */
import { useEffect, useRef, useState } from 'react';
import type { SurfaceGrid } from '@hestia/core-sci';

type Three = typeof import('three');

export interface SurfaceStageProps {
  grid: SurfaceGrid;
  width?: number;
  height?: number;
}

/**
 * Barwa punktu wg wysokości — od chłodnej do ciepłej.
 *
 * Przez biel w środku zakresu, jak w mapach pól: powierzchnia funkcji dwóch
 * zmiennych bywa dodatnia i ujemna, a wtedy trzeba widzieć, gdzie przecina zero.
 */
function barwa(t: number): [number, number, number] {
  const s = Math.max(0, Math.min(1, t));
  if (s < 0.5) {
    const u = s * 2;
    return [u, u, 1];
  }
  const u = (s - 0.5) * 2;
  return [1, 1 - u, 1 - u];
}

export function SurfaceStage({ grid, width = 420, height = 320 }: SurfaceStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [three, setThree] = useState<Three | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    import('three')
      .then((mod) => {
        if (!cancelled) setThree(mod);
      })
      .catch(() => {
        if (!cancelled) setError('Nie udało się wczytać silnika 3D.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!three || !host || grid.values.length === 0) return undefined;

    const scene = new three.Scene();
    scene.background = new three.Color('#ffffff');

    const camera = new three.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.4, 2.0, 2.4);
    camera.lookAt(0, 0, 0);

    const renderer = new three.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const { n, values, min, max } = grid;
    const rozpietosc = max - min || 1;

    const geometry = new three.PlaneGeometry(2, 2, n - 1, n - 1);
    const pozycje = geometry.attributes.position as { array: Float32Array; count: number };
    const kolory = new Float32Array(pozycje.count * 3);

    for (let i = 0; i < pozycje.count; i += 1) {
      const wartosc = values[i];
      // Punkt nieokreślony kładziemy na poziomie zera i barwimy szarością —
      // dziura w siatce byłaby uczciwsza, ale wymaga przebudowy indeksów, a
      // płaska plama w kolorze danych kłamałaby o wartości.
      const znormalizowana = Number.isFinite(wartosc) ? (wartosc - min) / rozpietosc : 0;
      pozycje.array[i * 3 + 2] = Number.isFinite(wartosc) ? znormalizowana * 1.2 - 0.6 : -0.6;

      const [r, g, b] = Number.isFinite(wartosc) ? barwa(znormalizowana) : [0.8, 0.8, 0.8];
      kolory[i * 3] = r;
      kolory[i * 3 + 1] = g;
      kolory[i * 3 + 2] = b;
    }
    geometry.setAttribute('color', new three.BufferAttribute(kolory, 3));
    geometry.computeVertexNormals();

    const material = new three.MeshLambertMaterial({ vertexColors: true, side: three.DoubleSide });
    const mesh = new three.Mesh(geometry, material);
    // Płaszczyzna powstaje w XY, a wysokość ma iść w górę — obracamy scenę,
    // zamiast przeliczać każdy wierzchołek.
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);

    scene.add(new three.AmbientLight(0xffffff, 0.6));
    const swiatlo = new three.DirectionalLight(0xffffff, 0.8);
    swiatlo.position.set(3, 5, 2);
    scene.add(swiatlo);
    scene.add(new three.GridHelper(2, 8, 0xcbd5e1, 0xe2e8f0));

    let obrot = 0;
    let klatka = 0;
    const rysuj = () => {
      obrot += 0.003;
      camera.position.x = Math.cos(obrot) * 3.2;
      camera.position.z = Math.sin(obrot) * 3.2;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      klatka = requestAnimationFrame(rysuj);
    };
    rysuj();

    return () => {
      cancelAnimationFrame(klatka);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [three, grid, width, height]);

  if (error) {
    return <div style={{ fontSize: 11, color: '#b91c1c', padding: 8 }}>{error}</div>;
  }

  return (
    <div
      ref={hostRef}
      style={{
        width,
        height,
        borderRadius: 4,
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
      }}
    />
  );
}
