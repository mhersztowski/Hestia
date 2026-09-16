/**
 * LinAlgStage — kanoniczna scena przekształcenia liniowego.
 *
 * Raport (§3.6c) chce **jednego** renderera zamiast skryptu per dokument, i to
 * jest sedno: obrót, ścinanie, skalowanie, rzut, wyznacznik i wektory własne to
 * nie sześć scen, tylko sześć ustawień tej samej. Scena pokazuje trzy rzeczy
 * naraz i z ich zestawienia bierze się cała dydaktyka:
 *
 *  • **siatka** — co przekształcenie robi z całą płaszczyzną,
 *  • **kwadrat jednostkowy** — jak zmienia się pole (wyznacznik) i orientacja,
 *  • **wektory bazowe** — dokąd trafiają `e₁` i `e₂`, czyli kolumny macierzy.
 *
 * Animacja idzie od identyczności do macierzy, bo dopiero **ruch** pokazuje, że
 * przekształcenie jest ciągłym odkształceniem płaszczyzny, a nie podmianą
 * jednego obrazka na drugi.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  apply,
  eigen,
  det,
  interpolate,
  pickVector,
  snapToEigen,
  type Matrix2,
  type Vector2,
} from '@hestia/core-sci';

export interface StageVector {
  name: string;
  value: Vector2;
  color: string;
  /** Czy wektor jest wynikiem przekształcenia — te podążają za animacją. */
  transformed?: boolean;
}

export interface LinAlgStageProps {
  /** Macierz sceny; brak = sama płaszczyzna z wektorami. */
  matrix?: Matrix2;
  /** Postęp animacji 0…1 — 0 to identyczność, 1 to pełne przekształcenie. */
  t: number;
  vectors: StageVector[];
  /** Ile jednostek mieści się od środka do krawędzi. */
  extent?: number;
  size?: number;
  showEigen?: boolean;
  showUnitSquare?: boolean;
  /**
   * Przeciąganie końca strzałki — brak znaczy scenę tylko do oglądania.
   *
   * Dostaje nazwę wektora i nowe położenie w jednostkach sceny; przeliczenie
   * wszystkiego, co od niego zależy, należy do modelu.
   */
  onDrag?: (name: string, value: Vector2) => void;
  /** Które wektory wolno chwytać — zwykle te zadeklarowane, nie policzone. */
  draggable?: string[];
  /** Przyciąganie do kierunków własnych przy przeciąganiu. */
  snapEigen?: boolean;
}

const SIATKA = '#e2e8f0';
const SIATKA_PRZEKSZTALCONA = '#bae6fd';
const OS = '#94a3b8';

export function LinAlgStage({
  matrix,
  t,
  vectors,
  extent = 4,
  size = 340,
  showEigen,
  showUnitSquare = true,
  onDrag,
  draggable,
  snapEigen,
}: LinAlgStageProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  /**
   * Nazwa chwyconego wektora.
   *
   * W ref, nie w stanie: wskaźnik melduje położenie szybciej, niż React
   * przerenderowuje, więc flaga w stanie byłaby jeszcze pusta przy pierwszych
   * ruchach i początek przeciągnięcia by ginął.
   */
  const chwyconyRef = useRef<string | undefined>();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const skala = size / (2 * extent);
    /** Punkt w jednostkach matematycznych → piksele. Oś Y w górę, jak na tablicy. */
    const px = (v: Vector2): [number, number] => [size / 2 + v[0] * skala, size / 2 - v[1] * skala];

    const M = matrix ? interpolate(matrix, t) : undefined;
    const przeksztalc = (v: Vector2): Vector2 => (M ? apply(M, v) : v);

    ctx.clearRect(0, 0, size, size);
    ctx.lineWidth = 1;

    // Siatka nieprzekształcona zostaje jako tło odniesienia — bez niej nie
    // widać, o ile właściwie płaszczyzna się odkształciła.
    rysujSiatke(ctx, extent, px, (v) => v, SIATKA);
    if (M) rysujSiatke(ctx, extent, px, przeksztalc, SIATKA_PRZEKSZTALCONA);

    // Osie na wierzchu siatki, pod resztą.
    ctx.strokeStyle = OS;
    ctx.lineWidth = 1.5;
    linia(ctx, px([-extent, 0]), px([extent, 0]));
    linia(ctx, px([0, -extent]), px([0, extent]));

    if (showUnitSquare && M) {
      const rogi: Vector2[] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map((v) => przeksztalc(v as Vector2));
      ctx.beginPath();
      rogi.forEach((r, i) => {
        const [x, y] = px(r);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      // Kolor niesie znak wyznacznika: po odwróceniu orientacji kwadrat zmienia
      // barwę i widać, że przekształcenie „przewróciło" płaszczyznę.
      const wyznacznik = det(M);
      ctx.fillStyle = wyznacznik >= 0 ? 'rgba(37, 99, 235, 0.16)' : 'rgba(220, 38, 38, 0.16)';
      ctx.fill();

      // Wektory bazowe to kolumny macierzy — pokazanie ich wprost łączy obraz
      // z zapisem, bo w macierzy widać dokładnie te dwie strzałki.
      strzalka(ctx, px([0, 0]), px(przeksztalc([1, 0])), '#dc2626', 'e₁');
      strzalka(ctx, px([0, 0]), px(przeksztalc([0, 1])), '#16a34a', 'e₂');
    }

    if (showEigen && matrix) {
      const wynik = eigen(matrix);
      // Kierunki własne rysujemy jako **proste**, nie strzałki: własny jest
      // kierunek, a nie konkretny wektor o konkretnej długości.
      for (const { vector } of wynik.pairs) {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        linia(
          ctx,
          px([-vector[0] * extent, -vector[1] * extent]),
          px([vector[0] * extent, vector[1] * extent])
        );
        ctx.setLineDash([]);
      }
    }

    for (const wektor of vectors) {
      const koniec = wektor.transformed ? wektor.value : przeksztalc(wektor.value);
      strzalka(ctx, px([0, 0]), px(koniec), wektor.color, wektor.name);

      if (onDrag && (!draggable || draggable.includes(wektor.name))) {
        // Pierścień na końcu: bez niego czytelnik nie wie, że cokolwiek da się
        // ruszyć, a cała interakcja pozostaje niewidoczna.
        const [x, y] = px(koniec);
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = wektor.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [matrix, t, vectors, extent, size, showEigen, showUnitSquare, onDrag, draggable]);

  /** Położenie wskaźnika w jednostkach sceny. */
  const naScene = useCallback(
    (event: ReactPointerEvent): Vector2 | null => {
      const prostokat = ref.current?.getBoundingClientRect();
      if (!prostokat) return null;
      const skala = prostokat.width / (2 * extent);
      return [
        (event.clientX - prostokat.left - prostokat.width / 2) / skala,
        // Oś Y ekranu rośnie w dół, matematyczna w górę.
        -(event.clientY - prostokat.top - prostokat.height / 2) / skala,
      ];
    },
    [extent]
  );

  const chwytalne = vectors.filter((v) => !draggable || draggable.includes(v.name));

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      onPointerDown={
        onDrag
          ? (e) => {
              const punkt = naScene(e);
              if (!punkt) return;
              // Promień trafienia w jednostkach sceny — około pół kratki, żeby
              // dało się złapać także wektor bardzo krótki.
              const nazwa = pickVector(punkt, chwytalne, extent * 0.12);
              if (!nazwa) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              chwyconyRef.current = nazwa;
            }
          : undefined
      }
      onPointerMove={
        onDrag
          ? (e) => {
              const nazwa = chwyconyRef.current;
              if (!nazwa) return;
              const punkt = naScene(e);
              if (!punkt) return;
              const przyciagniety =
                snapEigen && matrix ? snapToEigen(matrix, punkt, extent * 0.04) : null;
              onDrag(nazwa, przyciagniety ?? punkt);
            }
          : undefined
      }
      onPointerUp={
        onDrag
          ? (e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              chwyconyRef.current = undefined;
            }
          : undefined
      }
      onPointerCancel={() => {
        chwyconyRef.current = undefined;
      }}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        border: '1px solid #e2e8f0',
        display: 'block',
        cursor: onDrag ? 'grab' : 'default',
        touchAction: onDrag ? 'none' : undefined,
      }}
    />
  );
}

function linia(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number]) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

/**
 * Siatka linii całkowitych po przekształceniu.
 *
 * Rysujemy proste jako odcinki między obrazami punktów krańcowych — dla
 * przekształcenia liniowego to wystarcza, bo prosta przechodzi w prostą.
 */
function rysujSiatke(
  ctx: CanvasRenderingContext2D,
  extent: number,
  px: (v: Vector2) => [number, number],
  f: (v: Vector2) => Vector2,
  kolor: string
) {
  ctx.strokeStyle = kolor;
  ctx.lineWidth = 1;
  const zasieg = extent * 2;

  for (let i = -zasieg; i <= zasieg; i += 1) {
    linia(ctx, px(f([i, -zasieg])), px(f([i, zasieg])));
    linia(ctx, px(f([-zasieg, i])), px(f([zasieg, i])));
  }
}

function strzalka(
  ctx: CanvasRenderingContext2D,
  od: [number, number],
  do_: [number, number],
  kolor: string,
  etykieta?: string
) {
  const dx = do_[0] - od[0];
  const dy = do_[1] - od[1];
  const dlugosc = Math.hypot(dx, dy);
  // Zerowy wektor nie ma kierunku — grot narysowany „w losową stronę" byłby
  // kłamstwem o wyniku (np. rzut wektora prostopadłego do osi).
  if (dlugosc < 1) return;

  ctx.strokeStyle = kolor;
  ctx.fillStyle = kolor;
  ctx.lineWidth = 2.5;
  linia(ctx, od, do_);

  const kat = Math.atan2(dy, dx);
  const grot = 10;
  ctx.beginPath();
  ctx.moveTo(do_[0], do_[1]);
  ctx.lineTo(do_[0] - grot * Math.cos(kat - 0.4), do_[1] - grot * Math.sin(kat - 0.4));
  ctx.lineTo(do_[0] - grot * Math.cos(kat + 0.4), do_[1] - grot * Math.sin(kat + 0.4));
  ctx.closePath();
  ctx.fill();

  if (etykieta) {
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(etykieta, do_[0] + 8 * Math.cos(kat), do_[1] + 8 * Math.sin(kat) - 4);
  }
}
