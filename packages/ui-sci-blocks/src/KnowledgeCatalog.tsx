/**
 * KnowledgeCatalog — strona katalogu bazy wiedzy.
 *
 * Trzy sposoby dotarcia do dokumentu, bo trzy są naturalne: **szukanie** (wiem,
 * czego chcę), **graf** (chcę zobaczyć, co z czego wynika) i **kolejność nauki**
 * (nie wiem, od czego zacząć). Wszystkie trzy liczy rdzeń — tutaj jest tylko
 * ich pokazanie.
 *
 * Katalog nie czyta plików sam: dostaje gotowy indeks i treści od hosta, bo to
 * host wie, gdzie mieszka VFS. Dzięki temu ten sam komponent obsłuży bazę z
 * dysku, z pamięci i z eksportu statycznego.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  layoutKnowledgeGraph, learningOrder, odmiana, search, tagCounts,
  type KnowledgeIndex,
} from '@hestia/core-sci';
import { KnowledgeGraph } from './KnowledgeGraph';

export interface KnowledgeCatalogProps {
  index: KnowledgeIndex;
  /** Treści dokumentów — bez nich szukanie nie obejmuje tekstu. */
  bodies?: Record<string, string>;
  /** Otwarcie dokumentu; brak = katalog tylko do oglądania. */
  onOpen?: (path: string) => void;
  /** Dokument obecnie czytany — podświetlany w grafie i na liście. */
  active?: string;
}

const label: CSSProperties = { fontSize: 11, color: '#64748b' };
const chip = (active: boolean): CSSProperties => ({
  fontSize: 11, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
  border: `1px solid ${active ? '#2563eb' : '#e2e8f0'}`,
  background: active ? '#dbeafe' : '#f8fafc',
  color: active ? '#1e40af' : '#475569',
});

const MATCH_LABEL: Record<string, string> = {
  title: 'tytuł', tag: 'tag', formula: 'wzór', exercise: 'zadanie', text: 'treść',
};

export function KnowledgeCatalog({ index, bodies = {}, onOpen, active }: KnowledgeCatalogProps) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | undefined>();

  const layout = useMemo(() => layoutKnowledgeGraph(index), [index]);
  const order = useMemo(() => learningOrder(index), [index]);
  const tags = useMemo(() => tagCounts(index), [index]);
  const hits = useMemo(() => (query.trim() ? search(index, query, bodies) : []), [index, query, bodies]);

  const lista = query.trim()
    ? hits.map((hit) => hit.document)
    : order.filter((document) => !tag || document.meta.tags.includes(tag));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="szukaj w tytułach, tagach, wzorach i treści…"
          style={{
            fontSize: 13, padding: '5px 10px', borderRadius: 6,
            border: '1px solid #cbd5e1', flex: '1 1 260px', minWidth: 200,
          }}
        />
        <span style={label}>
          {index.documents.length} dok. · {index.formulaHome.size} wzorów
          {index.issues.length > 0 && (
            <span style={{ color: '#b91c1c' }}> · {index.issues.length} uwag</span>
          )}
        </span>
      </div>

      {index.issues.length > 0 && (
        <div style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', borderRadius: 4, padding: '6px 8px' }}>
          {index.issues.map((issue, i) => (
            <div key={i}>{issue.path ? `${issue.path}: ` : ''}{issue.message}</div>
          ))}
        </div>
      )}

      {!query.trim() && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tags.map(({ tag: name, count }) => (
            <span
              key={name}
              style={chip(tag === name)}
              onClick={() => setTag(tag === name ? undefined : name)}
            >
              {name} <span style={{ opacity: 0.6 }}>{count}</span>
            </span>
          ))}
        </div>
      )}

      <div>
        <div style={{ ...label, marginBottom: 4 }}>droga nauki</div>
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', padding: 4 }}>
          <KnowledgeGraph layout={layout} active={active} onOpen={onOpen} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={label}>
          {query.trim() ? `wyniki: ${hits.length}` : tag ? `temat: ${tag}` : 'wszystkie dokumenty w kolejności nauki'}
        </div>

        {lista.length === 0 && (
          <div style={{ ...label, padding: '8px 0' }}>Nic nie znaleziono.</div>
        )}

        {lista.map((document) => {
          const hit = hits.find((h) => h.document.path === document.path);
          return (
            <div
              key={document.path}
              onClick={() => onOpen?.(document.path)}
              style={{
                border: `1px solid ${document.path === active ? '#2563eb' : '#e2e8f0'}`,
                borderRadius: 6, padding: '8px 10px', background: '#fff',
                cursor: onOpen ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13, color: '#0f172a' }}>{document.meta.title ?? document.path}</strong>
                <code style={{ fontSize: 10, color: '#94a3b8' }}>{document.path}</code>
                <span style={{ flex: 1 }} />
                <span style={label}>
                  {[
                    document.formulas.length > 0
                      && `${document.formulas.length} ${odmiana(document.formulas.length, ['wzór', 'wzory', 'wzorów'])}`,
                    document.exercises.length > 0
                      && `${document.exercises.length} ${odmiana(document.exercises.length, ['zadanie', 'zadania', 'zadań'])}`,
                    document.simCount > 0 && 'symulacja',
                    document.scriptCount > 0 && 'model w skrypcie',
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>

              {document.meta.requires.length > 0 && (
                <div style={{ ...label, marginTop: 2 }}>wymaga: {document.meta.requires.join(', ')}</div>
              )}

              {/* Przy wyszukiwaniu pokazujemy, gdzie trafiono — „czemu to
                  wyskoczyło" jest w bazie wiedzy równie ważne jak sam wynik. */}
              {hit && (
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {hit.matches.slice(0, 3).map((match, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#475569' }}>
                      <span style={{ color: '#7c3aed' }}>{MATCH_LABEL[match.kind]}:</span> {match.detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
