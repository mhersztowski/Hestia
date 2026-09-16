/**
 * SimBlock — symulacja zbudowana ze wzorów stojących w tym samym dokumencie.
 *
 * Blok odpowiada za trzy rzeczy: zbudowanie modelu z wzorów dokumentu,
 * odczytanie ustawień z treści bloku i wyprowadzenie wykładu krok po kroku.
 * Wszystko, co widać — animacja, wykresy, suwaki — należy do `ModelViews`
 * i jest wspólne z blokiem `simscript`.
 *
 * Cztery rzeczy dzieją się automatycznie, bo wynikają z grafu wzorów: suwaki
 * biorą się z parametrów (symboli, których nie liczy żaden wzór), widoki z
 * wymiarów wielkości, podział na wykres i liczbę z tego, czy wielkość zależy od
 * stanu, a ponowne liczenie z tego, że cała symulacja to jedna funkcja.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  buildGraph,
  formatIn,
  knownAfter,
  serializeFormulaBlock,
  suggestViews,
  walkthrough,
  type FormulaBlock,
  type ViewSpec,
} from '@hestia/core-sci';
import { buildSimSetup } from './documentModel';
import { ModelViews } from './ModelViews';
import type { WorkerFactory } from './useModelRunner';

export interface SimBlockProps {
  /**
   * Bez własnej ramki i nagłówka — daje je `BlockShell` po stronie hosta.
   *
   * Poza edytorem (podgląd, eksport statyczny) komponent bywa używany wprost i
   * wtedy ramka jest potrzebna, stąd przełącznik zamiast twardego usunięcia.
   */
  bare?: boolean;
  /** Treść bloku `sim` — JSON z ustawieniami. */
  code: string;
  /**
   * Wzory z tego samego dokumentu.
   *
   * Blok nie opisuje symulacji — wskazuje na fizykę, która stoi wyżej w
   * tekście. Stąd wzory przychodzą z zewnątrz, a nie z treści bloku.
   */
  formulas: FormulaBlock[];
  /** Zapis zmienionych ustawień; brak = tryb tylko do odczytu. */
  onChange?: (next: string) => void;
  /** Fabryka workera od hosta — obliczenia poza wątkiem interfejsu. */
  workerFactory?: WorkerFactory;
}

const box: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: '#fff',
  padding: 10,
};
const label: CSSProperties = { fontSize: 11, color: '#64748b' };
const btn: CSSProperties = {
  fontSize: 12,
  padding: '3px 10px',
  borderRadius: 4,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
  color: '#334155',
};

/**
 * Nazwa do pliku eksportu: model z biblioteki albo pierwszy użyty wzór.
 *
 * Blok `sim` nie ma własnego identyfikatora — wskazuje na fizykę stojącą wyżej
 * w tekście, więc nazwa pliku bierze się stamtąd.
 */
function usedId(setup: { usedFormulas: Array<{ id: string }> }): string | undefined {
  return setup.usedFormulas[0]?.id;
}

export function SimBlock({ code, formulas, onChange, bare, workerFactory }: SimBlockProps) {
  const setup = useMemo(() => buildSimSetup(formulas, code), [formulas, code]);
  const allViews = useMemo(
    () => suggestViews(setup.model, setup.spec.view),
    [setup.model, setup.spec.view]
  );

  /**
   * Wyprowadzenie krok po kroku.
   *
   * `step === undefined` znaczy „pokaż całość" — tryb domyślny. Po włączeniu
   * wykładu widoki zawężają się do wielkości wyprowadzonych do tej pory, więc
   * czytelnik nie widzi wyniku, zanim pozna drogę.
   */
  const steps = useMemo(() => walkthrough(buildGraph(formulas)), [formulas]);
  const [step, setStep] = useState<number | undefined>(undefined);
  const known = step === undefined ? undefined : knownAfter(steps, step + 1);

  const views = useMemo(() => {
    if (!known) return allViews;
    return allViews.filter((view) => viewNames(view).every((name) => known.includes(name)));
  }, [allViews, known]);

  /** Ostatnie położenie suwaków — do zapisania w bloku na życzenie autora. */
  const [current, setCurrent] = useState<Record<string, number>>(setup.values);

  return (
    <div
      style={
        bare
          ? { display: 'flex', flexDirection: 'column', gap: 10 }
          : { ...box, display: 'flex', flexDirection: 'column', gap: 10 }
      }
    >
      {/* W ramce hosta uwagi pokazuje `BlockShell` — tutaj tylko poza nim. */}
      {!bare && setup.issues.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: '#b91c1c',
            background: '#fef2f2',
            borderRadius: 4,
            padding: '6px 8px',
          }}
        >
          {setup.issues.map((issue, index) => (
            <div key={index}>{issue}</div>
          ))}
        </div>
      )}

      {steps.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={
              step === undefined
                ? btn
                : { ...btn, background: '#dbeafe', borderColor: '#2563eb', color: '#1e40af' }
            }
            onClick={() => setStep(step === undefined ? 0 : undefined)}
            title="Odsłania wyprowadzenie wzór po wzorze, w kolejności wynikającej z grafu"
          >
            {step === undefined ? '↹ wyprowadzenie' : '↹ całość'}
          </button>
          {step !== undefined && (
            <>
              <button
                type="button"
                style={btn}
                disabled={step === 0}
                onClick={() => setStep(step - 1)}
              >
                ←
              </button>
              <button
                type="button"
                style={btn}
                disabled={step === steps.length - 1}
                onClick={() => setStep(step + 1)}
              >
                →
              </button>
              <span style={label}>
                krok {step + 1}/{steps.length}:{' '}
                <strong style={{ color: '#0f172a' }}>{steps[step].formulaId}</strong>
                {' → '}
                {steps[step].produces.join(', ')}
                {steps[step].assumptions.length > 0 && (
                  <span style={{ color: '#92400e' }}>
                    {' '}
                    · przy założeniu: {steps[step].assumptions.join(', ')}
                  </span>
                )}
              </span>
            </>
          )}
        </div>
      )}

      <ModelViews
        blockId={setup.spec.model ?? usedId(setup)}
        model={setup.model}
        views={views}
        exposed={setup.exposed}
        initialValues={setup.values}
        duration={setup.spec.duration ?? 10}
        onValues={setCurrent}
        // Ten sam podzbiór, z którego zbudowano model na ekranie — inaczej
        // worker liczyłby z pełnego dokumentu i wynik nie zgadzałby się z tym,
        // co widzi czytelnik.
        source={{
          kind: 'graph',
          formulas: setup.usedFormulas.map((f) => ({ id: f.id, body: serializeFormulaBlock(f) })),
        }}
        workerFactory={workerFactory}
      />

      {onChange && (
        <div style={{ ...label, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            style={btn}
            title="Zapisuje obecne położenie suwaków w bloku, żeby czytelnik zaczynał od tego stanu"
            onClick={() => onChange(JSON.stringify(currentSpec(setup, current), null, 2))}
          >
            Zapisz nastawy w bloku
          </button>
          <span>
            widoków: {views.length} · parametrów: {setup.model.parameters.length}
          </span>
        </div>
      )}
    </div>
  );
}

/** Wielkości, których widok potrzebuje — po nich zawęża się wykład. */
function viewNames(view: ViewSpec): string[] {
  switch (view.kind) {
    case 'angular2d':
      return [view.angle];
    case 'path2d':
      return [view.x, view.y];
    case 'path3d':
      return [view.x, view.y, view.z];
    case 'phase':
      return [view.x, view.y];
    case 'timeseries':
      return view.names;
    case 'scalars':
      return view.names;
    default:
      return [];
  }
}

/** Ustawienia bloku z obecnymi wartościami suwaków — z jednostkami. */
function currentSpec(
  setup: ReturnType<typeof buildSimSetup>,
  values: Record<string, number>
): Record<string, unknown> {
  const spec: Record<string, unknown> = { ...setup.spec };
  for (const parameter of setup.model.parameters) {
    const value = values[parameter.name];
    if (value === undefined) continue;
    // Jednostka zostaje przy wartości: „1.5 m" niesie znaczenie, samo 1.5 nie.
    spec[parameter.name] =
      parameter.unit && parameter.unit !== '1'
        ? formatIn(value, parameter.unit, 4)
        : Number(value.toPrecision(4));
  }
  return spec;
}
