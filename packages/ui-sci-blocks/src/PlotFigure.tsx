/**
 * PlotFigure — rysunek liczony ze wzoru.
 *
 * Podręcznik ma rysunki, które w całości są wykresami funkcji: rys. 15-6 to
 * `x = A cos(ωt+φ)` w trzech wariantach, rys. 15-7 to ta funkcja i jej dwie
 * pochodne. Skan takiego rysunku jest stratą — nie skaluje się, ma obcą
 * typografię i nie da się go poprawić razem ze wzorem.
 *
 * Trzy decyzje wzięte wprost z książki:
 *
 *  • **Bez skal liczbowych.** Resnick podpisuje osie `A` i `T`, a przy rys. 15-7
 *    pisze wprost: „nie zaznaczono na rysunku jednostek i skal". Chodzi
 *    o kształt i o wzajemne przesunięcie krzywych, nie o wartości.
 *  • **Skala wspólna dla panelu.** Krzywe o różnych amplitudach (I i III na
 *    rys. 15-6b) muszą się różnić na rysunku — osobne skalowanie każdej krzywej
 *    zatarłoby to, co rysunek ma pokazać.
 *  • **SVG, nie canvas.** Rysunek jest statyczny, ma się skalować i drukować,
 *    a przy okazji da się go sprawdzić testem bez rastra.
 */
import { useMemo } from 'react';
import { compileExpression, type PlotSpec } from '@hestia/core-sci';

export interface PlotFigureProps {
  spec: PlotSpec;
  /** Podgląd w dymku — mniejszy, bez podpisów krzywych. */
  compact?: boolean;
}

const PROBEK = 240;

/** Punkty jednej krzywej w dziedzinie wykresu. */
function probkuj(expression: string, variable: string, from: number, to: number): number[] {
  const compiled = compileExpression(expression, [variable]);
  const out: number[] = [];
  for (let i = 0; i < PROBEK; i += 1) {
    const x = from + ((to - from) * i) / (PROBEK - 1);
    const y = compiled.evaluate({ [variable]: x });
    out.push(Number.isFinite(y) ? y : NaN);
  }
  return out;
}

export function PlotFigure({ spec, compact }: PlotFigureProps) {
  const panele = useMemo(
    () =>
      spec.panels.map((panel) => {
        const krzywe = panel.curves.map((c) => ({
          ...c,
          y: probkuj(c.expression, spec.variable, spec.from, spec.to),
        }));
        // Skala wspólna dla panelu — inaczej krzywa o połowie amplitudy
        // wyglądałaby tak samo jak pełna, a to jest właśnie treść rys. 15-6b.
        const wartosci = krzywe.flatMap((k) => k.y).filter(Number.isFinite);
        // Zakres bierzemy z danych, a nie symetrycznie wokół zera: energia jest
        // nieujemna (rys. 15-9), więc oś w połowie wysokości zostawiłaby dolną
        // połowę pustą i przesunęła krzywe tam, gdzie ich w druku nie ma.
        const min = Math.min(...wartosci, 0);
        const max = Math.max(...wartosci, 0);
        return { panel, krzywe, min, max: max > min ? max : min + 1e-9 };
      }),
    [spec]
  );

  const W = compact ? 260 : 560;
  const H = compact ? 70 : 150;
  const marginesL = compact ? 18 : 34;
  const marginesP = compact ? 8 : 74; // miejsce na podpis krzywej po prawej

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 8 }}>
      {panele.map(({ panel, krzywe, min, max }, index) => {
        const szer = W - marginesL - marginesP;
        const doX = (i: number) => marginesL + (szer * i) / (PROBEK - 1);
        const doY = (v: number) => H - 10 - ((v - min) / (max - min)) * (H - 20);
        // Oś pozioma stoi tam, gdzie w danych jest zero.
        const srodek = doY(0);

        return (
          <svg
            key={index}
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', maxWidth: W, height: 'auto', overflow: 'visible' }}
            role="img"
            aria-label={panel.name ? `panel ${panel.name}` : 'wykres'}
          >
            {/* Oś czasu i oś pionowa — bez podziałki, jak w książce. */}
            <line
              x1={marginesL}
              y1={srodek}
              x2={W - marginesP}
              y2={srodek}
              stroke="#0f172a"
              strokeWidth={1}
            />
            <line
              x1={marginesL}
              y1={8}
              x2={marginesL}
              y2={H - 8}
              stroke="#0f172a"
              strokeWidth={1}
            />

            {spec.axisY && !compact && (
              <text x={marginesL - 6} y={14} fontSize={11} textAnchor="end" fontStyle="italic">
                {spec.axisY}
              </text>
            )}
            {spec.axisX && !compact && (
              <text x={W - marginesP + 6} y={srodek + 4} fontSize={11} fontStyle="italic">
                {spec.axisX}
              </text>
            )}

            {krzywe.map((k) => {
              const d = k.y
                .map((v, i) => `${i ? 'L' : 'M'}${doX(i).toFixed(1)},${doY(v).toFixed(1)}`)
                .join(' ');
              return (
                <path
                  key={k.label}
                  d={d}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth={k.dashed ? 1.2 : 1.8}
                  strokeDasharray={k.dashed ? '6 4' : undefined}
                />
              );
            })}

            {!compact &&
              krzywe.map((k, i) => (
                <text
                  key={`${k.label}-podpis`}
                  x={W - marginesP + 6}
                  y={srodek - 18 + i * 15}
                  fontSize={11}
                  fontStyle="italic"
                >
                  {k.label}
                </text>
              ))}

            {panel.name && !compact && (
              <text x={4} y={H - 6} fontSize={12} fontStyle="italic">
                {panel.name})
              </text>
            )}
          </svg>
        );
      })}
    </div>
  );
}
