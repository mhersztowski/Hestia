/**
 * ModelViews — widoki modelu: animacja, wykresy, suwaki.
 *
 * Wydzielone z bloku symulacji, gdy pojawił się trzeci klient (blok `sim`,
 * blok `simscript`, a docelowo zadania interaktywne). Cała warstwa wizualna
 * zależy wyłącznie od kontraktu `PhenomenonModel` i nie wie, czy model powstał
 * z grafu wzorów, czy ze skryptu w dokumencie — to jest praktyczna korzyść
 * z tego, że obie ścieżki dają ten sam typ.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  formatIn, spectrum, type ModelSource, type ParamSchema,
  type PhenomenonModel, type PhenomenonResult, type ViewSpec,
} from '@hestia/core-sci';
import { useModelRunner, type WorkerFactory } from './useModelRunner';
import { QualityPanel } from './QualityPanel';
import { downloadCanvasPng, downloadCsv, seriesToCsv } from './eksport';
import { PlotCanvas, type PlotSeries } from './PlotCanvas';
import { AngularStage } from './AngularStage';
import { XYCanvas } from './XYCanvas';
import { Path3DCanvas } from './Path3DCanvas';

const SERIES_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];
const label: CSSProperties = { fontSize: 11, color: '#64748b' };
const btn: CSSProperties = {
  fontSize: 12, padding: '3px 10px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};

/**
 * Zakres suwaka rozszerzony o wartość startową.
 *
 * Zakres modelu jest liczony z wartości domyślnej; gdy autor podał w bloku coś
 * spoza niego (rho = 28 przy domyślnej 1), przeglądarka przycięłaby suwak do
 * maksimum i pokazała inną liczbę, niż zapisano w dokumencie.
 */
function zakres(parameter: ParamSchema, start: number | undefined) {
  if (start === undefined || (start >= parameter.min && start <= parameter.max)) {
    return { min: parameter.min, max: parameter.max, step: parameter.step };
  }
  const max = Math.max(parameter.max, Math.abs(start) * 2);
  const min = Math.min(parameter.min, start < 0 ? start * 2 : parameter.min);
  return { min, max, step: (max - min) / 200 };
}

/**
 * Pasek pod wykresami: co udało się policzyć i jak to stąd wyjąć.
 *
 * Dwie rzeczy w jednym miejscu, bo obie odpowiadają na pytania zadawane po
 * obejrzeniu wyniku: „ile to trwało" (przy dokumencie z ośmioma symulacjami
 * „dlaczego ta strona muli" jest pytaniem powtarzalnym, a dane były zbierane
 * i nigdzie nie pokazywane) oraz „jak to zabrać ze sobą".
 */
function WynikBar({
  result, blockId, elapsedMs, offThread, plotnaRef,
}: {
  result: PhenomenonResult;
  blockId?: string;
  elapsedMs?: number;
  offThread: boolean;
  /** Kontener widoków — obraz bierzemy z pierwszego płótna, jakie w nim stoi. */
  plotnaRef: React.RefObject<HTMLDivElement | null>;
}) {
  const maPrzebiegi = Object.keys(result.series ?? {}).length > 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {elapsedMs !== undefined && (
        <span style={{ ...label, fontVariantNumeric: 'tabular-nums' }} title={offThread
          ? 'Liczone w osobnym wątku — suwak nadąża za palcem'
          : 'Liczone w wątku interfejsu; przy dużym modelu suwak będzie się zacinał'}
        >
          {Math.round(elapsedMs)} ms{offThread ? '' : ' (w wątku interfejsu)'}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {/*
        * Obraz bierzemy z **pierwszego płótna w kontenerze widoków**, a nie
        * z propa przekazanego przez każdy z czterech rendererów. Widoki
        * powstają dynamicznie z `suggestViews`, więc przeciąganie uchwytu przez
        * wszystkie znaczyłoby cztery zmiany przy każdym nowym rodzaju widoku.
        */}
      <button
        type="button"
        style={btn}
        onClick={() => {
          const canvas = plotnaRef.current?.querySelector('canvas');
          if (canvas) downloadCanvasPng(canvas, blockId);
        }}
        title="Pobierz pierwszy wykres jako obraz PNG"
      >
        PNG
      </button>
      {maPrzebiegi && (
        <button
          type="button"
          style={btn}
          onClick={() => downloadCsv(seriesToCsv(result.series), blockId)}
          title="Pobierz przebiegi jako CSV — pierwsza kolumna to czas"
        >
          CSV
        </button>
      )}
    </div>
  );
}

export interface ModelViewsProps {
  model: PhenomenonModel;
  views: ViewSpec[];
  /** Które parametry pokazać; brak = wszystkie. */
  exposed?: string[];
  /**
   * Wartości początkowe suwaków — z bloku dokumentu.
   *
   * Wartości domyślne modelu są tylko podpowiedzią wyliczoną z jednostek;
   * autor dokumentu wie lepiej, przy jakich nastawach zjawisko widać
   * (atraktor Lorenza istnieje dla rho = 28, dla rho = 1 układ zbiega do punktu).
   */
  initialValues?: Record<string, number>;
  /** Długość symulacji w sekundach. */
  duration?: number;
  /** Wywoływane przy zmianie suwaka — host może zapisać nastawy. */
  onValues?: (values: Record<string, number>) => void;
  /** Identyfikator bloku — trafia do nazwy pobieranego pliku. */
  blockId?: string;
  /**
   * Opis modelu do policzenia w workerze.
   *
   * Modelu nie da się przesłać przez granicę wątku (to funkcje), więc worker
   * dostaje jego opis i buduje go u siebie. Brak = liczymy w wątku interfejsu.
   */
  source?: ModelSource;
  /** Fabryka workera od hosta; brak = obliczenia w wątku interfejsu. */
  workerFactory?: WorkerFactory;
}

/**
 * Widoki i sterowanie dla modelu.
 *
 * Stan (wartości suwaków, czas animacji) żyje tutaj, bo jest stanem oglądania,
 * a nie treści dokumentu. Zapis nastaw do bloku jest osobną decyzją hosta.
 */
export function ModelViews({
  model, views, exposed, duration = 10, onValues, source, workerFactory, initialValues, blockId,
}: ModelViewsProps) {
  const startowe = useMemo(
    () => ({
      ...Object.fromEntries(model.parameters.map((p) => [p.name, p.value])),
      ...initialValues,
    }),
    [model, initialValues],
  );
  const [values, setValues] = useState<Record<string, number>>(startowe);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  // Zmiana modelu (inny dokument, poprawiony skrypt) przestawia suwaki na nowe
  // wartości startowe — inaczej panel pokazywałby stan sprzed edycji.
  useEffect(() => { setValues(startowe); }, [startowe]);

  const dt = Math.max(duration / 40000, 1e-9);
  const tSpan = useMemo((): [number, number] => [0, duration], [duration]);

  // Z opisem modelu i fabryką workera obliczenia idą poza wątek interfejsu;
  // bez nich liczymy tu, jak dotąd. Oba warunki naraz, bo worker potrzebuje
  // opisu, a nie gotowego modelu.
  const runner = useModelRunner(
    source ?? { kind: 'graph', formulas: [] },
    values,
    tSpan,
    dt,
    source && workerFactory ? workerFactory : undefined,
  );
  const local = useMemo(
    () => (source && workerFactory ? undefined : model.run(values, tSpan, dt)),
    [model, values, tSpan, dt, source, workerFactory],
  );
  const result: PhenomenonResult = local ?? runner.result ?? { scalars: {}, series: {}, invariants: [] };

  const trajectory = result.trajectory;
  const animated = views.some((v) => v.kind === 'angular2d' || v.kind === 'path2d' || v.kind === 'path3d');
  const hasTime = trajectory ?? Object.values(result.series)[0]?.length ? true : false;

  useEffect(() => {
    if (!playing) return;
    let start = 0;
    let raf = 0;
    const span = trajectory ? (trajectory.t1 - trajectory.t0 || 1) : duration;
    const t0 = trajectory?.t0 ?? 0;
    const tick = (now: number) => {
      if (!start) start = now;
      setTime(t0 + ((now - start) / 1000) % span);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, trajectory, duration]);

  /** Wartość wielkości w chwili `time` — z trajektorii albo z przebiegu. */
  const at = (name: string) => {
    if (trajectory && trajectory.stateNames.includes(name)) return trajectory.value(name, time);
    const series = result.series[name];
    if (!series?.length) return Number.NaN;
    // Model ze skryptu nie musi zwracać trajektorii — wtedy szukamy w przebiegu.
    let lo = 0;
    let hi = series.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (series[mid][0] <= time) lo = mid;
      else hi = mid;
    }
    return series[lo][1];
  };

  const trailOf = (names: string[], span = 0.8, steps = 26) => Array.from({ length: steps }, (_, i) => {
    const t = Math.max(0, time - span + (span * i) / steps);
    const saved = time;
    // Ślad czytamy tą samą drogą co punkt bieżący, żeby model ze skryptu i
    // z grafu zachowywały się tak samo.
    const values = names.map((name) => {
      if (trajectory && trajectory.stateNames.includes(name)) return trajectory.value(name, t);
      const series = result.series[name];
      if (!series?.length) return Number.NaN;
      const index = series.findIndex(([sampleT]) => sampleT >= t);
      return series[index < 0 ? series.length - 1 : index][1];
    });
    void saved;
    return values;
  });

  const setParam = (name: string, value: number) => setValues((previous) => {
    const next = { ...previous, [name]: value };
    onValues?.(next);
    return next;
  });

  const shown = model.parameters.filter((p) => !exposed?.length || exposed.includes(p.name));
  const plotnaRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div ref={plotnaRef} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {views.map((view, index) => (
          <View
            key={index}
            view={view}
            result={result}
            values={values}
            time={time}
            at={at}
            trailOf={trailOf}
            unitOf={(name) => model.observables.find((o) => o.name === name)?.unit}
          />
        ))}
      </div>

      {/* Ocena jakości stoi tuż pod widokami, a nad suwakami: czyta się ją
          razem z wykresem, którego dotyczy, a nie jako przypis na dole. */}
      <QualityPanel invariants={result.invariants ?? []} />

      <WynikBar
        result={result}
        blockId={blockId}
        elapsedMs={runner.elapsedMs}
        offThread={runner.offThread}
        plotnaRef={plotnaRef}
      />

      {runner.pending && !local && (
        <div style={{ ...label, fontStyle: 'italic' }}>liczę…</div>
      )}
      {/* Nieudane całkowanie: model policzył wszystko, co się dało, ale
          trajektorii nie ma. Komunikat idzie na wierzch, bo bez niego blok
          wyglądałby jak pusty wykres bez powodu. */}
      {result.error && (
        <div style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', borderRadius: 4, padding: '6px 8px' }}>
          {result.error}
        </div>
      )}

      {runner.error && !local && (
        <div style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', borderRadius: 4, padding: '6px 8px' }}>
          {runner.error}
        </div>
      )}

      {animated && hasTime && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" style={btn} onClick={() => setPlaying((p) => !p)}>
            {playing ? '⏸ pauza' : '▶ start'}
          </button>
          <button type="button" style={btn} onClick={() => { setPlaying(false); setTime(0); }}>⟲ reset</button>
          <span style={{ ...label, fontVariantNumeric: 'tabular-nums' }}>
            t = {time.toFixed(2)} s
            {trajectory && trajectory.t1 < duration - 0.01 && ` (koniec: ${trajectory.t1.toFixed(2)} s)`}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {shown.map((parameter) => (
          <label key={parameter.name} style={{ ...label, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 150 }}>
            <span>
              {parameter.name} ={' '}
              <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {parameter.unit && parameter.unit !== '1'
                  ? formatIn(values[parameter.name] ?? parameter.value, parameter.unit, 3)
                  : Number((values[parameter.name] ?? parameter.value).toPrecision(3))}
              </strong>
            </span>
            <input
              type="range"
              {...zakres(parameter, startowe[parameter.name])}
              value={values[parameter.name] ?? parameter.value}
              onChange={(e) => setParam(parameter.name, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
    </>
  );
}

interface ViewProps {
  view: ViewSpec;
  result: PhenomenonResult;
  values: Record<string, number>;
  time: number;
  at: (name: string) => number;
  trailOf: (names: string[], span?: number, steps?: number) => number[][];
  unitOf: (name: string) => string | undefined;
}

/** Jeden widok — dobrany przez rdzeń, tu tylko narysowany. */
function View({ view, result, values, time, at, trailOf, unitOf }: ViewProps) {
  switch (view.kind) {
    case 'angular2d':
      return (
        <Framed title="ruch">
          <AngularStage
            theta={at(view.angle)}
            length={values[view.radius] ?? 1}
            trail={trailOf([view.angle]).map(([angle]) => angle)}
          />
        </Framed>
      );

    case 'path3d': {
      const points = (result.series[view.x] ?? []).map(([, x]: [number, number], index: number) => ([
        x,
        result.series[view.y]?.[index]?.[1] ?? 0,
        result.series[view.z]?.[index]?.[1] ?? 0,
      ] as [number, number, number]));
      return (
        <Framed title="tor w przestrzeni">
          <Path3DCanvas
            points={points}
            labels={[view.x, view.y, view.z]}
            cursor={[at(view.x), at(view.y), at(view.z)]}
          />
        </Framed>
      );
    }

    case 'path2d': {
      const points = (result.series[view.x] ?? []).map(([, x]: [number, number], index: number) => (
        [x, result.series[view.y]?.[index]?.[1] ?? 0] as [number, number]
      ));
      return (
        <Framed title="tor">
          <XYCanvas
            points={points}
            xLabel={view.x}
            yLabel={view.y}
            equalAxes
            cursor={[at(view.x), at(view.y)]}
          />
        </Framed>
      );
    }

    case 'timeseries': {
      const series: PlotSeries[] = view.names
        .map((name, index) => ({
          label: name,
          points: result.series[name] ?? [],
          color: SERIES_COLORS[index % SERIES_COLORS.length],
        }))
        .filter((s) => s.points.length > 1);
      return series.length ? (
        <Framed title="przebieg w czasie">
          <PlotCanvas series={series} marker={time} />
        </Framed>
      ) : null;
    }

    /**
     * Widmo amplitudowe.
     *
     * Liczone **z tych samych przebiegów**, które widać na wykresie czasowym —
     * i to jest cała treść tego widoku: czytelnik ogląda jedno zjawisko z dwóch
     * stron, a nie dwa różne obliczenia. Prążek przy częstości drgania mówi to,
     * czego z przebiegu w czasie nie da się odczytać, gdy składowych jest kilka.
     */
    case 'spectrum': {
      const series: PlotSeries[] = view.names
        .map((name, index) => {
          const widmo = spectrum(result.series[name] ?? []);
          return {
            label: name,
            points: widmo.freq.map((f, i) => [f, widmo.amplitude[i]] as [number, number]),
            color: SERIES_COLORS[index % SERIES_COLORS.length],
          };
        })
        .filter((s) => s.points.length > 1);

      // Pokazujemy dolną część zakresu: przy drganiach cała treść siedzi przy
      // niskich częstościach, a reszta osi tylko ją ściska.
      const maks = Math.max(...series.flatMap((s) => s.points.filter(([, a]) => a > 0.01).map(([f]) => f)), 1);
      const przycięte = series.map((s) => ({ ...s, points: s.points.filter(([f]) => f <= maks * 3) }));

      return przycięte.length ? (
        <Framed title="widmo">
          <PlotCanvas series={przycięte} xLabel="częstość" />
        </Framed>
      ) : null;
    }

    case 'phase': {
      const points = (result.series[view.x] ?? []).map(([, x]: [number, number], index: number) => (
        [x, result.series[view.y]?.[index]?.[1] ?? 0] as [number, number]
      ));
      return (
        <Framed title="przestrzeń fazowa">
          <XYCanvas points={points} xLabel={view.x} yLabel={view.y} cursor={[at(view.x), at(view.y)]} />
        </Framed>
      );
    }

    case 'scalars':
      return (
        <Framed title="wielkości stałe">
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '4px 2px' }}>
            {view.names.map((name) => (
              <div key={name}>
                <div style={label}>{name}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  {formatValue(result.scalars[name], unitOf(name))}
                </div>
              </div>
            ))}
          </div>
        </Framed>
      );

    default:
      return null;
  }
}

/**
 * Wartość z jednostką albo kreska.
 *
 * Wielkość bywa nieokreślona przez chwilę po przełączeniu dokumentu albo gdy
 * wzór ma błąd. „—" mówi wtedy prawdę; „NaN" wygląda jak wynik obliczeń, a
 * dodatkowo React ostrzega o nim w konsoli.
 */
function formatValue(value: number | undefined, unit?: string): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return unit && unit !== '1' ? formatIn(value, unit, 4) : String(Number(value.toPrecision(4)));
}

function Framed({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: '#94a3b8' }}>{title}</span>
      {children}
    </div>
  );
}

