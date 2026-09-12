/**
 * ProcedureBlock — algebra jako przepis, krok po kroku.
 *
 * Eliminacja Gaussa i Gram-Schmidt nie są wzorami, tylko procedurami, więc
 * pokazujemy je tak, jak się je wykonuje: jeden krok naraz, z opisem, co
 * właśnie zrobiliśmy i po co. Wynikiem lekcji jest droga, nie liczba na końcu.
 *
 * Scena po prawej pokazuje **stan po bieżącym kroku** — przy Gramie-Schmidcie
 * to jest sedno, bo dopiero widok rzutu tłumaczy, skąd bierze się prostopadłość.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { gaussStepsN, gramSchmidtSteps, type Vector2 } from '@hestia/core-sci';
import { LinAlgStage } from './LinAlgStage';

export interface ProcedureSpec {
  kind: 'gauss' | 'gram-schmidt';
  /**
   * Gauss: macierz współczynników i prawa strona, dowolnego rozmiaru.
   *
   * Wersja 2×2 pokazywała pomysł, ale nie procedurę: przy dwóch równaniach jest
   * jeden krok eliminacji, a wybór elementu głównego nie ma czego wybierać.
   * Zapisy 2×2 z istniejących dokumentów działają dalej bez zmian.
   */
  matrix?: number[][];
  rhs?: number[];
  /** Gram-Schmidt: dwa wektory wyjściowe. */
  a?: Vector2;
  b?: Vector2;
}

export interface ProcedureBlockProps {
  bare?: boolean;
  id: string;
  code: string;
}

const box: CSSProperties = {
  border: '1px solid #e2e8f0', borderLeft: '4px solid #0d9488',
  borderRadius: 6, background: '#fff', padding: 10,
};
const label: CSSProperties = { fontSize: 11, color: '#64748b' };
const btn: CSSProperties = {
  fontSize: 12, padding: '3px 10px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};

/** Kolory wektorów procedury — stałe, żeby ten sam symbol miał ten sam kolor. */
const KOLORY: Record<string, string> = {
  a: '#2563eb', b: '#ea580c', e_1: '#16a34a', e_2: '#a855f7', p: '#94a3b8', r: '#0891b2',
};

export function ProcedureBlock({ id, code, bare }: ProcedureBlockProps) {
  const spec = useMemo((): ProcedureSpec | undefined => {
    try {
      return JSON.parse(code || '{}') as ProcedureSpec;
    } catch {
      return undefined;
    }
  }, [code]);

  const [krok, setKrok] = useState(0);

  const kroki = useMemo(() => {
    if (spec?.kind === 'gauss' && spec.matrix && spec.rhs) {
      return gaussStepsN(spec.matrix, spec.rhs);
    }
    if (spec?.kind === 'gram-schmidt' && spec.a && spec.b) {
      return gramSchmidtSteps(spec.a, spec.b);
    }
    return [];
  }, [spec]);

  if (!spec || !kroki.length) {
    return (
      <div style={{ fontSize: 12, color: '#b91c1c' }}>
        Blok procedury potrzebuje `kind` („gauss" albo „gram-schmidt") i danych wejściowych.
      </div>
    );
  }

  const biezacy = kroki[Math.min(krok, kroki.length - 1)];
  const gauss = spec.kind === 'gauss';

  return (
    <div style={bare
      ? { display: 'flex', flexDirection: 'column', gap: 8 }
      : { ...box, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!bare && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0d9488' }}>procedura</span>
          <code style={{ fontSize: 11, color: '#94a3b8' }}>{id}</code>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={btn} disabled={krok === 0} onClick={() => setKrok(krok - 1)}>←</button>
        <button
          type="button"
          style={btn}
          disabled={krok >= kroki.length - 1}
          onClick={() => setKrok(krok + 1)}
        >
          →
        </button>
        <span style={label}>krok {Math.min(krok, kroki.length - 1) + 1} / {kroki.length}</span>
        <button type="button" style={btn} onClick={() => setKrok(0)}>⟲ od początku</button>
      </div>

      <div style={{ fontSize: 13, color: '#0f172a', minHeight: 40 }}>{biezacy.description}</div>

      {gauss && 'matrix' in biezacy && (
        <UkladRownan matrix={biezacy.matrix} rhs={biezacy.rhs} solution={biezacy.solution} />
      )}

      {!gauss && 'vectors' in biezacy && (
        <LinAlgStage
          t={1}
          extent={3}
          size={280}
          showUnitSquare={false}
          vectors={Object.entries(biezacy.vectors).map(([name, value]) => ({
            name: name.replace('_', ''),
            value,
            color: KOLORY[name] ?? '#64748b',
            transformed: true,
          }))}
        />
      )}
    </div>
  );
}

/**
 * Układ równań w postaci macierzy rozszerzonej.
 *
 * Pionowa kreska przed prawą stroną nie jest ozdobą — to ona odróżnia macierz
 * współczynników od układu, a cała eliminacja polega na patrzeniu, co dzieje
 * się po obu jej stronach naraz.
 */
function UkladRownan({
  matrix, rhs, solution,
}: {
  matrix: number[][];
  rhs: number[];
  solution?: number[];
}) {
  const liczba = (x: number) => {
    const zaokraglona = Math.round(x * 1000) / 1000;
    // Minus zero po odejmowaniu wygląda jak usterka, a znaczy dokładnie zero.
    return Object.is(zaokraglona, -0) ? 0 : zaokraglona;
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <table style={{ borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>
        <tbody>
          {matrix.map((wiersz, i) => (
            <tr key={i}>
              {wiersz.map((wartosc, j) => (
                <td key={j} style={{ padding: '4px 10px', textAlign: 'right' }}>{liczba(wartosc)}</td>
              ))}
              <td style={{
                padding: '4px 10px', textAlign: 'right',
                borderLeft: '2px solid #94a3b8', color: '#0d9488',
              }}>
                {liczba(rhs[i])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {solution && (
        <div style={{ fontSize: 14 }}>
          <span style={label}>rozwiązanie: </span>
          <strong style={{ color: '#0d9488' }}>
            {/* Przy dwóch i trzech niewiadomych nazwy `x, y, z` czyta się
                lepiej niż indeksy; wyżej indeksy są jedyną sensowną opcją. */}
            {solution.map((wartosc, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {solution.length <= 3 ? 'xyz'[i] : `x${i + 1}`} = {liczba(wartosc)}
              </span>
            ))}
          </strong>
        </div>
      )}
    </div>
  );
}
