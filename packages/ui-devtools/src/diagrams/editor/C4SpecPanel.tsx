/**
 * C4SpecPanel — opis elementu C4.
 *
 * Nazwa wywołania w Mermaidzie (`SystemDb_Ext`) skleja rodzaj, wariant i
 * zewnętrzność; tutaj są trzema osobnymi kontrolkami, bo zmienia się je
 * niezależnie i w różnych momentach.
 *
 * Pole technologii pokazujemy tylko tam, gdzie format je zna. Osoba i system
 * opisują *co*, a nie *czym* — puste pole, którego zapis i tak nie użyje,
 * obiecywałoby coś, czego nie ma.
 */
import type { CSSProperties } from 'react';
import type { DiagramNode } from '../model/diagram';
import { C4_ELEMENT_KINDS, C4_KIND_LABEL, C4_VARIANTS, hasTechnology, type C4ElementKind, type C4NodeInfo, type C4Variant } from '../model/c4';

export interface C4SpecPanelProps {
  node: DiagramNode;
  onChange: (patch: Partial<C4NodeInfo>) => void;
  onClose: () => void;
}

const input: CSSProperties = {
  fontSize: 11, padding: '2px 4px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', minWidth: 0, width: '100%', boxSizing: 'border-box',
};
const iconBtn: CSSProperties = { ...input, cursor: 'pointer', padding: '2px 5px', lineHeight: 1.1, width: 'auto' };
const toggle = (active: boolean): CSSProperties => ({
  ...iconBtn,
  fontWeight: active ? 700 : 400,
  color: active ? '#1e40af' : '#94a3b8',
  background: active ? '#dbeafe' : '#fff',
  borderColor: active ? '#2563eb' : '#cbd5e1',
});
const field = (basis: string): CSSProperties => ({ fontSize: 10, color: '#94a3b8', flex: `0 1 ${basis}` });

const VARIANT_LABEL: Record<C4Variant, string> = { plain: 'zwykły', db: 'baza', queue: 'kolejka' };

export function C4SpecPanel({ node, onChange, onClose }: C4SpecPanelProps) {
  const info: C4NodeInfo = node.c4 ?? { kind: 'system', variant: 'plain', external: false };
  // Osoba i węzeł wdrożenia nie mają wariantu bazy ani kolejki — Mermaid nie zna
  // `PersonDb`, więc przełącznik byłby pustą obietnicą.
  const variantsAllowed = info.kind !== 'person' && info.kind !== 'node';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 12 }}>{node.label || node.id}</strong>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>{C4_KIND_LABEL[info.kind]}</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={iconBtn} title="Zamknij panel" onClick={onClose}>×</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={field('110px')}>
          rodzaj
          <select
            style={input}
            value={info.kind}
            onChange={(e) => onChange({ kind: e.target.value as C4ElementKind })}
          >
            {C4_ELEMENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>{C4_KIND_LABEL[kind]}</option>
            ))}
          </select>
        </label>

        {variantsAllowed && (
          <div style={{ display: 'flex', gap: 3 }}>
            {C4_VARIANTS.map((variant) => (
              <button
                key={variant}
                type="button"
                style={toggle(info.variant === variant)}
                title={`Wariant: ${VARIANT_LABEL[variant]}`}
                onClick={() => onChange({ variant })}
              >
                {VARIANT_LABEL[variant]}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          style={toggle(info.external)}
          title="Element poza granicą naszej odpowiedzialności"
          onClick={() => onChange({ external: !info.external })}
        >
          zewnętrzny
        </button>

        {hasTechnology(info.kind) && (
          <label style={field('150px')}>
            technologia
            <input
              style={input}
              value={info.technology ?? ''}
              placeholder="np. Java, Spring Boot"
              onChange={(e) => onChange({ technology: e.target.value || undefined })}
            />
          </label>
        )}

        <label style={field('220px')}>
          opis
          <input
            style={input}
            value={info.description ?? ''}
            placeholder="do czego służy"
            onChange={(e) => onChange({ description: e.target.value || undefined })}
          />
        </label>
      </div>
    </div>
  );
}
