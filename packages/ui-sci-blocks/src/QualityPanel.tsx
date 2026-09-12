/**
 * QualityPanel — ile wart jest wynik, który czytelnik ogląda.
 *
 * Ten panel jest powodem, dla którego cały etap 0 powstał. Wykres oscylatora
 * liczonego Eulerem i Verletem wygląda identycznie; dopiero tu widać, że
 * w pierwszym przypadku energia narasta i po kilkudziesięciu okresach symulacja
 * pokazuje inne zjawisko niż to, które opisano w dokumencie.
 *
 * Panel **nie ostrzega o wszystkim, co mogłoby pójść nie tak** — mówi tylko
 * o rzeczach zmierzonych. Ostrzeżenie oparte na regule „ten solver bywa
 * niedokładny" byłoby wróżeniem; „ta energia narosła o 12 %" jest faktem
 * o tym konkretnym przebiegu.
 */
import type { CSSProperties } from 'react';
import { describeInvariant, type InvariantReport, type InvariantTrend } from '@hestia/core-sci';

/** Oszacowanie błędu całkowania — z badania zbieżności (etap 1 planu). */
export interface ErrorEstimate {
  /** Błąd względny najgęstszego przebiegu. */
  relative: number;
  /** Zmierzony rząd metody; brak, gdy pomiar nie miał sensu. */
  order?: number;
}

export interface QualityPanelProps {
  invariants: InvariantReport[];
  error?: ErrorEstimate;
}

/**
 * Kolor niesie ocenę, więc nie może być jedynym nośnikiem informacji —
 * zdanie obok mówi to samo słowami.
 */
const TREND_COLOR: Record<InvariantTrend, string> = {
  stable: '#059669',
  oscillation: '#b45309',
  drift: '#b91c1c',
};

const box: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3,
  fontSize: 11, color: '#475569',
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4,
  padding: '5px 8px',
};

const row: CSSProperties = { display: 'flex', gap: 6, alignItems: 'baseline' };

const dot = (color: string): CSSProperties => ({
  width: 6, height: 6, borderRadius: 3, background: color, flex: '0 0 auto',
  // Kropka jest ozdobą przy zdaniu, które i tak wszystko mówi.
  alignSelf: 'center',
});

export function QualityPanel({ invariants, error }: QualityPanelProps) {
  // Pusty panel byłby gorszy niż jego brak: sugerowałby, że jakość zmierzono
  // i wyszła nijaka, podczas gdy nikt o nią nie prosił.
  if (!invariants.length && !error) return null;

  return (
    <div style={box}>
      {error && (
        <div style={row}>
          <span style={dot('#2563eb')} />
          <span>
            błąd całkowania ≈ <strong>{(error.relative * 100).toPrecision(2)} %</strong>
            {error.order !== undefined && (
              <span style={{ color: '#64748b' }}> · zmierzony rząd metody {error.order.toFixed(2)}</span>
            )}
          </span>
        </div>
      )}

      {invariants.map((report) => (
        <div key={report.name} style={{ ...row, flexWrap: 'wrap' }}>
          <span style={dot(TREND_COLOR[report.trend])} />
          <span>{describeInvariant(report)}</span>
          {report.issues.map((issue) => (
            <span key={issue} style={{ color: '#b91c1c', width: '100%' }}>{issue}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
