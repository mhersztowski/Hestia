/**
 * CalloutBlock — notka kontekstowa, czyli **jedyna nasza treść w dokumencie**.
 *
 * Cała reszta bazy jest przepisaną książką, więc notka musi się od niej
 * odróżniać na pierwszy rzut oka, zanim czytelnik zacznie czytać: własna ramka,
 * własny kolor i podpis „poza książką". Bez tego znika gwarancja, że da się
 * odróżnić Resnicka od nas — a przy notce nie da się już tego sprawdzić
 * porównaniem ze skanem, bo w skanie tej treści nie ma.
 *
 * Ten sam komponent rysuje notkę **w treści i w dymku odsyłacza**, tylko
 * mniejszy — jak `FigureBlock`. Osobna ścieżka renderowania rozjechałaby się
 * przy pierwszej poprawce.
 */
import type { CSSProperties } from 'react';
import { parseCalloutBlock, type CalloutKind } from '@hestia/core-sci';
import { inline } from './inlineText';

export interface CalloutBlockProps {
  id: string;
  code: string;
  /** Podgląd w dymku — węższy i bez kotwicy, żeby nie dublować identyfikatora. */
  compact?: boolean;
}

/** Rodzaj notki widać po ikonie i barwie, zanim czytelnik przeczyta tytuł. */
const RODZAJE: Record<
  CalloutKind,
  { etykieta: string; ikona: string; kolor: string; tlo: string }
> = {
  law: { etykieta: 'Prawo fizyczne', ikona: '§', kolor: '#7c3aed', tlo: '#f5f3ff' },
  person: { etykieta: 'Postać nauki', ikona: '☺', kolor: '#0369a1', tlo: '#f0f9ff' },
  device: { etykieta: 'Urządzenie i doświadczenie', ikona: '⚙', kolor: '#b45309', tlo: '#fffbeb' },
};

const NIEZNANY = { etykieta: 'Notka', ikona: '?', kolor: '#64748b', tlo: '#f8fafc' };

export function CalloutBlock({ id, code, compact }: CalloutBlockProps) {
  const notka = parseCalloutBlock(id, code);
  const styl = notka.kind ? RODZAJE[notka.kind] : NIEZNANY;

  const ramka: CSSProperties = {
    borderLeft: `3px solid ${styl.kolor}`,
    background: styl.tlo,
    borderRadius: 4,
    padding: compact ? '8px 10px' : '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: compact ? 12 : 14,
  };

  return (
    <aside id={compact ? undefined : `ref-${id}`} style={ramka}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ color: styl.kolor, fontWeight: 700 }}>
          {styl.ikona}
        </span>
        <strong style={{ color: styl.kolor }}>{notka.title || id}</strong>
        <span style={{ fontSize: compact ? 10 : 11, color: styl.kolor, opacity: 0.8 }}>
          {styl.etykieta}
        </span>
      </div>

      {notka.body && <div style={{ lineHeight: 1.6, color: '#1e293b' }}>{inline(notka.body)}</div>}

      {/*
        Stopka jest tu **treścią, nie ozdobą**: mówi czytelnikowi, że tego akapitu
        nie ma w książce, i wskazuje, przy której stronie notka stoi.
      */}
      <div style={{ fontSize: compact ? 10 : 11, color: '#64748b' }}>
        poza książką{notka.source ? ` · ${notka.source}` : ''}
      </div>

      {notka.issues.length > 0 && (
        <div style={{ fontSize: 11, color: '#b91c1c' }}>
          {notka.issues.map((i) => i.message).join(' ')}
        </div>
      )}
    </aside>
  );
}
