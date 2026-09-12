/**
 * FigureBlock — rysunek z podpisem i identyfikatorem.
 *
 * Ten sam komponent rysuje rysunek **w treści i w dymku odsyłacza**, tylko
 * z innym rozmiarem. Gdyby podgląd miał własną ścieżkę renderowania, obie
 * wersje rozjechałyby się przy pierwszej poprawce.
 *
 * Kotwica `id` w DOM jest po to, żeby odsyłacz w obrębie dokumentu mógł
 * **przewinąć** do rysunku zamiast przeładowywać stronę.
 */
import type { CSSProperties } from 'react';
import { parseFigureBlock, setFigureWidth } from '@hestia/core-sci';
import { inline } from './inlineText';
import { PlotFigure } from './PlotFigure';

export interface FigureBlockProps {
  id: string;
  code: string;
  /** Podgląd w dymku — węższy i bez kotwicy, żeby nie dublować identyfikatora. */
  compact?: boolean;
  /**
   * Zapis zmienionej treści bloku; brak = tryb tylko do odczytu.
   *
   * Od tego zależy, czy pojawia się kontrolka szerokości. W trybie czytania
   * i w eksporcie statycznym nie ma czego zapisywać, więc suwak byłby wyłącznie
   * obietnicą bez pokrycia.
   */
  onChange?: (next: string) => void;
}

export function FigureBlock({ id, code, compact, onChange }: FigureBlockProps) {
  const rysunek = parseFigureBlock(id, code);

  /**
   * Szerokość obowiązuje w treści, ale **nie w dymku odsyłacza**.
   *
   * Dymek ma własne ograniczenia i własną szerokość; rysunek ustawiony na
   * 100 % kolumny wypchnąłby go poza ekran telefonu.
   */
  const szerokość = compact ? undefined : rysunek.width;

  /** Procent do suwaka; piksele nie mają na nim sensownego odpowiednika. */
  const procent = szerokość?.endsWith('%') ? Number.parseFloat(szerokość) : 100;

  return (
    <figure
      id={compact ? undefined : `ref-${id}`}
      style={{ margin: compact ? 0 : '4px 0', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {rysunek.image && (
        <img
          src={rysunek.image}
          alt={rysunek.alt ?? id}
          style={{
            width: szerokość,
            maxWidth: '100%',
            // W podglądzie obraz musi zmieścić się w dymku. Rys. 15-1 ma
            // proporcje 1410×2490, więc przy szerokości dymka urósłby do ~500 px
            // i wypchnął okienko poza ekran telefonu.
            maxHeight: compact ? 220 : undefined,
            objectFit: compact ? 'contain' : undefined,
            height: 'auto',
            display: 'block',
            margin: '0 auto',
          }}
        />
      )}
      {rysunek.plot && <PlotFigure spec={rysunek.plot} compact={compact} />}
      {!rysunek.image && !rysunek.plot && rysunek.script && (
        <div style={brakRysunku}>
          Rysunek liczony kodem — renderer jeszcze nie jest podpięty.
        </div>
      )}
      {rysunek.caption && (
        <figcaption style={compact ? podpisMaly : podpis}>{inline(rysunek.caption)}</figcaption>
      )}

      {onChange && !compact && (
        <div style={pasekSzerokości}>
          <label htmlFor={`szer-${id}`}>szerokość</label>
          <input
            id={`szer-${id}`}
            type="range"
            min={10}
            max={100}
            step={5}
            value={procent}
            aria-label="szerokość rysunku"
            // Sto procent **usuwa** dyrektywę zamiast ją zapisywać: brak wpisu
            // znaczy „tyle, ile się da", a to jest inna informacja niż „dokładnie
            // sto procent" i inaczej zachowa się w węższej kolumnie.
            onChange={(e) => {
              const wartość = Number(e.target.value);
              onChange(setFigureWidth(code, wartość >= 100 ? undefined : `${wartość}%`));
            }}
            style={{ flex: 1, maxWidth: 220 }}
          />
          <span style={{ minWidth: 52, textAlign: 'right' }}>
            {szerokość ?? '100%'}
          </span>
        </div>
      )}
      {rysunek.issues.map((i) => (
        <div key={i.message} style={{ fontSize: 11, color: '#b91c1c' }}>{i.message}</div>
      ))}
    </figure>
  );
}

const pasekSzerokości: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 11, color: '#64748b',
};

const podpis: CSSProperties = {
  fontSize: 13, color: '#475569', paddingLeft: 12, borderLeft: '3px solid #cbd5e1',
};
const podpisMaly: CSSProperties = { fontSize: 11, color: '#64748b' };
const brakRysunku: CSSProperties = {
  fontSize: 12, color: '#92400e', background: '#fffbeb',
  border: '1px solid #fde68a', borderRadius: 4, padding: 8,
};
