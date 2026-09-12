/**
 * CompareBlock — kilka przebiegów tego samego modelu na jednym wykresie.
 *
 * Blok `compare` odpowiada na pytanie, które w dokumencie dydaktycznym pada
 * najczęściej: **co się zmieni, gdy zmienię ten parametr**. Dwa bloki `sim`
 * obok siebie tego nie robią — mają osobne osie i osobne skale, więc
 * porównanie odbywa się na oko.
 *
 * Treść bloku jest listą przebiegów, a nie drugim opisem modelu: fizyka stoi
 * wyżej w tekście, tak samo jak przy `sim`.
 */
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  buildGraph, compileGraph, compareRuns,
  type ComparisonRun, type FormulaBlock,
} from '@hestia/core-sci';
import { PlotCanvas, type PlotSeries } from './PlotCanvas';
import { downloadCsv, seriesToCsv } from './eksport';

export interface CompareBlockProps {
  bare?: boolean;
  /** Treść bloku — JSON z listą przebiegów. */
  code: string;
  /** Wzory z dokumentu; zawężone przez identyfikator w infostringu. */
  formulas: FormulaBlock[];
  blockId?: string;
}

/** Zapis bloku `compare`. */
interface CompareSpec {
  duration?: number;
  /** Wielkości do pokazania; bez tego wykres tonie w krzywych. */
  show?: string[];
  runs?: Array<{ label?: string } & Record<string, unknown>>;
}

const box: CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', padding: 10 };
const label: CSSProperties = { fontSize: 11, color: '#64748b' };
const btn: CSSProperties = {
  fontSize: 11, padding: '2px 8px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};

/** Kolejne barwy krzywych — te same, co w kalkulatorze wykresów. */
const KOLORY = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#000000'];

export function CompareBlock({ code, formulas, bare, blockId }: CompareBlockProps) {
  const { series, issues } = useMemo(() => {
    let spec: CompareSpec;
    try {
      spec = JSON.parse(code || '{}') as CompareSpec;
    } catch (error) {
      return { series: {}, issues: [`Nie umiem odczytać ustawień: ${(error as Error).message}`] };
    }

    if (!formulas.length) {
      return { series: {}, issues: ['Nie ma wzorów w tym dokumencie — blok porównania wskazuje na fizykę stojącą wyżej.'] };
    }
    if (!spec.runs?.length) {
      return { series: {}, issues: ['Brak przebiegów do porównania — dopisz listę „runs".'] };
    }

    const graph = buildGraph(formulas);
    const model = compileGraph(graph);

    const runs: ComparisonRun[] = spec.runs.map((run, index) => {
      const { label: etykieta, ...values } = run;
      return {
        label: etykieta ?? `przebieg ${index + 1}`,
        values: values as Record<string, string | number>,
      };
    });

    const wynik = compareRuns(model, runs, {
      duration: spec.duration ?? 10,
      ...(spec.show?.length ? { only: spec.show } : {}),
    });
    return {
      series: wynik.series,
      issues: [...graph.issues.map((i) => i.message), ...model.issues, ...wynik.issues],
    };
  }, [code, formulas]);

  const krzywe: PlotSeries[] = Object.entries(series).map(([name, points], index) => ({
    label: name,
    points,
    color: KOLORY[index % KOLORY.length],
  }));

  return (
    <div style={bare ? { display: 'flex', flexDirection: 'column', gap: 8 } : { ...box, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {issues.length > 0 && (
        <div style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', borderRadius: 4, padding: '6px 8px' }}>
          {issues.map((issue, index) => <div key={index}>{issue}</div>)}
        </div>
      )}

      {krzywe.length > 0 && (
        <>
          <PlotCanvas series={krzywe} width={520} height={280} xLabel="t [s]" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={label}>{krzywe.length} krzywych</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              style={btn}
              onClick={() => downloadCsv(seriesToCsv(series), blockId)}
              title="Pobierz wszystkie przebiegi jako CSV"
            >
              CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
