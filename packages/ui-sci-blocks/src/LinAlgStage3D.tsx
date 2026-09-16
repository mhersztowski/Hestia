/**
 * LinAlgStage3D — scena przekształcenia w trzech wymiarach.
 *
 * Odpowiednik `LinAlgStage`, ale dla rzeczy, których płaski rzut nie udźwignie:
 *
 *  • **sześcian jednostkowy** odkształcany macierzą — wyznacznik jako objętość
 *    wymaga zacienionych ścian, żeby bryła w ogóle wyglądała jak bryła,
 *  • **podprzestrzenie** (jądro i obraz) rysowane jako półprzezroczyste
 *    płaszczyzny i proste — te **przecinają** bryłę, a przecięcia wymagają
 *    bufora głębi; sortowanie ścian od tyłu, które wystarcza dla wypukłego
 *    równoległościanu, tutaj daje widoczne artefakty,
 *  • **oś obrotu** jako kierunek własny — jedyny w 3D, i widać go tylko wtedy,
 *    gdy da się obejrzeć scenę z boku.
 *
 * Three.js jest **ładowany leniwie**, bo dokument bez sceny 3D nie ma powodu
 * pobierać silnika renderującego. Do czasu załadowania blok pokazuje, że coś
 * się dzieje — pusty prostokąt wyglądałby jak usterka.
 *
 * Renderowanie jest imperatywne, nie przez React: geometria powstaje na nowo z
 * macierzy przy każdej klatce animacji, a przepuszczanie tego przez drzewo
 * komponentów oznaczałoby setki rekoncyliacji na sekundę.
 */
import { useEffect, useRef, useState } from 'react';
import {
  applyM3,
  detM3,
  eigenM3,
  interpolateM3,
  kernelBasis,
  type Matrix3,
  type Vector3,
} from '@hestia/core-sci';

export interface Stage3DVector {
  name: string;
  value: Vector3;
  color: string;
}

export interface LinAlgStage3DProps {
  matrix?: Matrix3;
  /** Postęp animacji 0…1. */
  t: number;
  vectors?: Stage3DVector[];
  size?: number;
  /** Pokaż kierunki własne — w 3D obrót ma dokładnie jeden i jest nim oś. */
  showEigen?: boolean;
  /** Pokaż jądro: kierunki, które przekształcenie zgniata do zera. */
  showKernel?: boolean;
}

/** Kolory osi zgodne z konwencją: x czerwony, y zielony, z niebieski. */
const OSIE: Array<{ dir: Vector3; color: number }> = [
  { dir: [1, 0, 0], color: 0xdc2626 },
  { dir: [0, 1, 0], color: 0x16a34a },
  { dir: [0, 0, 1], color: 0x2563eb },
];

type Three = typeof import('three');

export function LinAlgStage3D({
  matrix,
  t,
  vectors = [],
  size = 360,
  showEigen,
  showKernel,
}: LinAlgStage3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [three, setThree] = useState<Three | null>(null);
  const [blad, setBlad] = useState<string | undefined>();

  // Uchwyty utrzymywane między klatkami — scena i kamera powstają raz.
  const sceneRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const dynamiczneRef = useRef<any>(null);
  /** Kąty kamery; obracanie idzie wprost na nie, bez stanu Reacta. */
  const orbitaRef = useRef({ theta: 0.9, phi: 1.05, promien: 7 });

  useEffect(() => {
    let anulowane = false;
    import('three')
      .then((mod) => {
        if (!anulowane) setThree(mod);
      })
      .catch(() => {
        if (!anulowane) {
          setBlad('Nie udało się wczytać silnika 3D. Scena wymaga pakietu „three".');
        }
      });
    return () => {
      anulowane = true;
    };
  }, []);

  // Budowa sceny — raz na komponent.
  useEffect(() => {
    const host = hostRef.current;
    if (!three || !host) return undefined;

    const scene = new three.Scene();
    scene.background = new three.Color(0xffffff);

    const camera = new three.PerspectiveCamera(45, 1, 0.1, 100);
    const renderer = new three.WebGLRenderer({ antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    // Światło kierunkowe plus wypełniające: bez wypełnienia ściany odwrócone
    // od źródła są czarne i bryła gubi kształt.
    scene.add(new three.AmbientLight(0xffffff, 0.75));
    const kierunkowe = new three.DirectionalLight(0xffffff, 0.7);
    kierunkowe.position.set(4, 6, 5);
    scene.add(kierunkowe);

    // Siatka podłogi jako odniesienie — bez niej nie widać, że scena ma głębię.
    const siatka = new three.GridHelper(8, 8, 0xcbd5e1, 0xe2e8f0);
    (siatka.material as any).transparent = true;
    (siatka.material as any).opacity = 0.6;
    scene.add(siatka);

    const dynamiczne = new three.Group();
    scene.add(dynamiczne);

    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;
    dynamiczneRef.current = dynamiczne;

    return () => {
      renderer.dispose();
      host.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [three, size]);

  // Przebudowa zawartości przy każdej zmianie macierzy albo klatki animacji.
  useEffect(() => {
    if (!three || !dynamiczneRef.current) return;
    const T = three;
    const grupa = dynamiczneRef.current;

    // Zwolnienie geometrii poprzedniej klatki: bez tego animacja wycieka
    // pamięcią GPU po kilkuset klatkach.
    for (const dziecko of [...grupa.children]) {
      grupa.remove(dziecko);
      dziecko.geometry?.dispose?.();
      dziecko.material?.dispose?.();
    }

    const M = matrix ? interpolateM3(matrix, t) : undefined;
    const przeksztalc = (v: Vector3): Vector3 => (M ? applyM3(M, v) : v);
    const wek = (v: Vector3) => new T.Vector3(v[0], v[1], v[2]);

    for (const { dir, color } of OSIE) {
      grupa.add(strzalka3D(T, [0, 0, 0], przeksztalc(dir), color, 1));
    }

    if (M) {
      // Sześcian jednostkowy: barwa niesie znak wyznacznika, tak samo jak
      // kwadrat w scenie 2D.
      const wyznacznik = detM3(M);
      const rogi: Vector3[] = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ].map((v) => przeksztalc(v as Vector3));

      const geometria = new T.BufferGeometry();
      geometria.setAttribute(
        'position',
        new T.Float32BufferAttribute(
          rogi.flatMap((r) => [r[0], r[1], r[2]]),
          3
        )
      );
      geometria.setIndex([
        0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3,
        7, 4, 3, 4, 0,
      ]);
      geometria.computeVertexNormals();

      grupa.add(
        new T.Mesh(
          geometria,
          new T.MeshLambertMaterial({
            color: wyznacznik >= 0 ? 0x2563eb : 0xdc2626,
            transparent: true,
            opacity: 0.28,
            // Obie strony, bo przy ujemnym wyznaczniku bryła jest „wywrócona"
            // i ściany patrzą do środka.
            side: T.DoubleSide,
          })
        )
      );

      // Krawędzie osobno: przy wyznaczniku bliskim zera bryła spłaszcza się i
      // same półprzezroczyste ściany przestają być widoczne — a wtedy nie
      // widać, że coś się zapadło, tylko że coś zniknęło.
      grupa.add(
        new T.LineSegments(
          new T.EdgesGeometry(geometria),
          new T.LineBasicMaterial({ color: wyznacznik >= 0 ? 0x1d4ed8 : 0xb91c1c })
        )
      );
    }

    for (const { value, color } of vectors) {
      grupa.add(
        strzalka3D(three, [0, 0, 0], przeksztalc(value), Number(color.replace('#', '0x')), 1.4)
      );
    }

    if (showEigen && matrix) {
      for (const { vector } of eigenM3(matrix).pairs) {
        // Kierunek własny jako prosta przez środek — własny jest kierunek,
        // nie konkretny wektor.
        const geo = new T.BufferGeometry().setFromPoints([
          wek([-vector[0] * 3, -vector[1] * 3, -vector[2] * 3]),
          wek([vector[0] * 3, vector[1] * 3, vector[2] * 3]),
        ]);
        grupa.add(
          new T.Line(
            geo,
            new T.LineDashedMaterial({
              color: 0xa855f7,
              dashSize: 0.18,
              gapSize: 0.12,
            })
          ).computeLineDistances()
        );
      }
    }

    if (showKernel && matrix) {
      const jadro = kernelBasis(matrix);
      if (jadro.length === 1) {
        const geo = new T.BufferGeometry().setFromPoints([
          wek([-jadro[0][0] * 3, -jadro[0][1] * 3, -jadro[0][2] * 3]),
          wek([jadro[0][0] * 3, jadro[0][1] * 3, jadro[0][2] * 3]),
        ]);
        grupa.add(new T.Line(geo, new T.LineBasicMaterial({ color: 0xf59e0b, linewidth: 2 })));
      } else if (jadro.length === 2) {
        // Jądro dwuwymiarowe to płaszczyzna. Mniejsza niż siatka i mocno
        // przezroczysta: oglądana z boku wypełnia cały kadr, a ma pokazywać,
        // co ginie — nie zasłaniać reszty sceny.
        const plaszczyzna = new T.Mesh(
          new T.PlaneGeometry(4, 4),
          new T.MeshBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.13,
            side: T.DoubleSide,
            depthWrite: false,
          })
        );
        const normalna = new T.Vector3().crossVectors(wek(jadro[0]), wek(jadro[1])).normalize();
        plaszczyzna.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normalna);
        grupa.add(plaszczyzna);
      }
    }

    rysuj();
  }, [three, matrix, t, vectors, showEigen, showKernel]);

  /** Ustawia kamerę z kątów orbity i renderuje klatkę. */
  const rysuj = () => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!camera || !renderer || !scene) return;

    const { theta, phi, promien } = orbitaRef.current;
    camera.position.set(
      promien * Math.sin(phi) * Math.cos(theta),
      promien * Math.cos(phi),
      promien * Math.sin(phi) * Math.sin(theta)
    );
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };

  const przeciaganieRef = useRef<{ x: number; y: number } | null>(null);

  if (blad) {
    return <div style={{ fontSize: 12, color: '#b91c1c' }}>{blad}</div>;
  }

  return (
    <div
      ref={hostRef}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        przeciaganieRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        const start = przeciaganieRef.current;
        if (!start) return;
        const orbita = orbitaRef.current;
        orbita.theta -= (e.clientX - start.x) * 0.01;
        // Ograniczenie kąta: przy biegunach kamera przeskakuje i scena
        // wygląda, jakby się teleportowała.
        orbita.phi = Math.max(
          0.15,
          Math.min(Math.PI - 0.15, orbita.phi - (e.clientY - start.y) * 0.01)
        );
        przeciaganieRef.current = { x: e.clientX, y: e.clientY };
        rysuj();
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        przeciaganieRef.current = null;
      }}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        cursor: 'grab',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        color: '#94a3b8',
      }}
    >
      {!three && 'wczytuję scenę 3D…'}
    </div>
  );
}

/**
 * Strzałka jako walec z grotem.
 *
 * `ArrowHelper` z Three.js rysuje linię o stałej grubości piksela, przez co w
 * perspektywie wektor bliski i daleki wyglądają tak samo — a w scenie, gdzie
 * chodzi o porównywanie długości, to zaciera właśnie to, co ważne.
 */
function strzalka3D(T: Three, od: Vector3, do_: Vector3, kolor: number, grubosc: number): any {
  const kierunek = new T.Vector3(do_[0] - od[0], do_[1] - od[1], do_[2] - od[2]);
  const dlugosc = kierunek.length();
  const grupa = new T.Group();
  // Wektor zerowy nie ma kierunku — grot „w losową stronę" kłamałby o wyniku.
  if (dlugosc < 1e-6) return grupa;

  const material = new T.MeshLambertMaterial({ color: kolor });
  const promien = 0.02 * grubosc;
  const grot = Math.min(0.18, dlugosc * 0.3);

  const trzon = new T.Mesh(new T.CylinderGeometry(promien, promien, dlugosc - grot, 12), material);
  const stozek = new T.Mesh(new T.ConeGeometry(promien * 2.6, grot, 14), material);

  trzon.position.set(0, (dlugosc - grot) / 2, 0);
  stozek.position.set(0, dlugosc - grot / 2, 0);
  grupa.add(trzon, stozek);

  grupa.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), kierunek.clone().normalize());
  grupa.position.set(od[0], od[1], od[2]);
  return grupa;
}
