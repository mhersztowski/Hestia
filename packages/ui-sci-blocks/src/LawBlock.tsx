/**
 * LawBlock — pozycja katalogu praw i zasad.
 *
 * Katalog powstaje ze skorowidza **w całości**, a rozdziały przenosimy po
 * kolei, więc większość pozycji długo nie ma treści. Taka pozycja musi wyglądać
 * jak **zapowiedź**, a nie jak awaria: czytelnik ma zobaczyć, że prawo w tomie
 * jest i gdzie go szukać, nie komunikat o błędzie.
 *
 * Odsyłacze do wzorów są tu treścią, nie ozdobą — to one wiążą katalog
 * z warstwą obliczeniową dokumentu. Bez nich lista byłaby spisem tytułów.
 */
import type { ReactNode } from 'react';
import { parseLawBlock } from '@hestia/core-sci';
import { inline } from './inlineText';

export interface LawBlockProps {
  id: string;
  code: string;
  /** Podgląd w dymku — węższy i bez kotwicy, żeby nie dublować identyfikatora. */
  compact?: boolean;
  /** Renderowanie odsyłacza do wzoru; brak = sam identyfikator tekstem. */
  renderRef?: (id: string) => ReactNode;
}

export function LawBlock({ id, code, compact, renderRef }: LawBlockProps) {
  const prawo = parseLawBlock(id, code);
  const czeka = prawo.awaiting;

  return (
    <section
      id={compact ? undefined : `ref-${id}`}
      style={{
        borderLeft: `3px solid ${czeka ? '#cbd5e1' : '#0f766e'}`,
        background: czeka ? '#f8fafc' : '#f0fdfa',
        borderRadius: 4,
        padding: compact ? '8px 10px' : '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        fontSize: compact ? 12 : 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ color: czeka ? '#475569' : '#0f766e' }}>{prawo.title || id}</strong>
        {prawo.chapter !== undefined && (
          <span style={{ fontSize: compact ? 10 : 11, color: '#64748b' }}>
            rozdział {prawo.chapter}
          </span>
        )}
      </div>

      {prawo.statement && (
        <div style={{ lineHeight: 1.6, color: '#1e293b' }}>{inline(prawo.statement)}</div>
      )}

      {/*
        Pozycja bez treści nie jest usterką — czeka na przeniesienie rozdziału.
        Mówimy to wprost, bo pusta ramka wygląda jak coś, co się nie wczytało.
      */}
      {czeka && (
        <div style={{ color: '#64748b', fontStyle: 'italic' }}>
          Treść czeka na przeniesienie rozdziału {prawo.chapter ?? '—'}.
        </div>
      )}

      {prawo.formulas.length > 0 && (
        <div style={{ fontSize: compact ? 11 : 12, color: '#334155' }}>
          {prawo.formulas.length === 1 ? 'Wzór: ' : 'Wzory: '}
          {prawo.formulas.map((f, i) => (
            <span key={f}>
              {i > 0 && ', '}
              {renderRef ? renderRef(f) : f}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: compact ? 10 : 11, color: '#64748b' }}>
        {prawo.source}
        {prawo.aka.length > 0 && ` · także: ${prawo.aka.join(', ')}`}
      </div>

      {prawo.issues.length > 0 && (
        <div style={{ fontSize: 11, color: '#b91c1c' }}>
          {prawo.issues.map((i) => i.message).join(' ')}
        </div>
      )}
    </section>
  );
}
