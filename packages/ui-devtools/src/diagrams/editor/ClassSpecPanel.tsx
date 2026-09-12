/**
 * ClassSpecPanel — pełna edycja specyfikacji klasy.
 *
 * Pola i metody niosą więcej niż tekst: widoczność, typ, listę parametrów,
 * statyczność albo abstrakcyjność. Jedno pole tekstowe na diagramie by to
 * spłaszczyło, więc specyfikację edytuje się tutaj — wiersz na składową, z
 * osobną kontrolką na każdą część.
 *
 * Panel jest **nakładką** nad płótnem, nie wierszem paska narzędzi: pasek
 * zmieniałby wysokość przy zaznaczeniu klasy, a każda zmiana rozmiaru płótna
 * przelicza kadr — widać to jako przeskok widoku.
 */
import type { CSSProperties } from 'react';
import type { ClassMember, DiagramNode, MemberVisibility } from '../model/diagram';

export interface ClassSpecPanelProps {
  node: DiagramNode;
  onAdd: (kind: ClassMember['kind']) => void;
  onUpdate: (index: number, patch: Partial<Omit<ClassMember, 'raw'>>) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onStereotype: (value: string) => void;
  onClose: () => void;
}

const VISIBILITIES: Array<{ value: MemberVisibility; label: string; title: string }> = [
  { value: 'public', label: '+', title: 'publiczna' },
  { value: 'private', label: '−', title: 'prywatna' },
  { value: 'protected', label: '#', title: 'chroniona' },
  { value: 'package', label: '~', title: 'pakietowa' },
];

const STEREOTYPES = ['', 'interface', 'abstract', 'enumeration', 'service'];

// `width: 100%` razem z `minWidth: 0` jest konieczne: pole tekstowe ma własną
// szerokość domyślną (~170 px), która rozpychała siatkę wiersza tak, że
// przyciski kolejności i usuwania spadały do drugiej linii.
const input: CSSProperties = {
  fontSize: 11, padding: '2px 4px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', minWidth: 0, width: '100%',
  boxSizing: 'border-box',
};
const iconBtn: CSSProperties = { ...input, cursor: 'pointer', padding: '2px 5px', lineHeight: 1.1, width: 'auto' };
const head: CSSProperties = { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 };

/**
 * Wiersz jednej składowej.
 *
 * Metoda dostaje pole parametrów, pole go nie ma — kolumna zostaje pusta, żeby
 * wiersze nie przeskakiwały przy zmianie rodzaju.
 */
function MemberRow({ member, index, count, onUpdate, onRemove, onMove }: {
  member: ClassMember;
  index: number;
  count: number;
  onUpdate: ClassSpecPanelProps['onUpdate'];
  onRemove: ClassSpecPanelProps['onRemove'];
  onMove: ClassSpecPanelProps['onMove'];
}) {
  const unparsed = !member.name;

  if (unparsed) {
    // Rozbiór się nie udał (np. generyk `Map~String, int~`). Nie rozkładamy
    // takiej składowej na kontrolki — pokazalibyśmy puste pola i przy pierwszej
    // zmianie nadpisali zapis, którego nie umiemy odtworzyć.
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <code style={{ flex: 1, fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.raw}
        </code>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>składnia spoza modelu — edytuj w kodzie</span>
        <button type="button" style={iconBtn} title="Usuń składową" onClick={() => onRemove(index)}>×</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(60px, 1fr) 74px minmax(60px, 1fr) minmax(50px, 0.7fr) 28px 28px 24px 24px 24px', gap: 3, alignItems: 'center' }}>
      <select
        style={input}
        value={member.visibility ?? 'public'}
        title="Widoczność"
        onChange={(e) => onUpdate(index, { visibility: e.target.value as MemberVisibility })}
      >
        {VISIBILITIES.map((v) => <option key={v.value} value={v.value} title={v.title}>{v.label}</option>)}
      </select>

      <input
        style={input}
        value={member.name ?? ''}
        placeholder="nazwa"
        onChange={(e) => onUpdate(index, { name: e.target.value })}
      />

      <select
        style={input}
        value={member.kind}
        title="Pole czy metoda"
        onChange={(e) => onUpdate(index, { kind: e.target.value as ClassMember['kind'] })}
      >
        <option value="field">pole</option>
        <option value="method">metoda</option>
      </select>

      {member.kind === 'method' ? (
        <input
          style={input}
          value={member.params ?? ''}
          placeholder="parametry"
          title="Lista parametrów, np. int a, String b"
          onChange={(e) => onUpdate(index, { params: e.target.value })}
        />
      ) : <span />}

      <input
        style={input}
        value={member.type ?? ''}
        placeholder="typ"
        title={member.kind === 'method' ? 'Typ zwracany' : 'Typ pola'}
        onChange={(e) => onUpdate(index, { type: e.target.value })}
      />

      <label style={{ fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 2 }} title="Statyczna ($)">
        <input
          type="checkbox"
          checked={!!member.isStatic}
          onChange={(e) => onUpdate(index, { isStatic: e.target.checked })}
        />$
      </label>
      <label style={{ fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 2 }} title="Abstrakcyjna (*)">
        <input
          type="checkbox"
          checked={!!member.isAbstract}
          onChange={(e) => onUpdate(index, { isAbstract: e.target.checked })}
        />*
      </label>

      <button type="button" style={iconBtn} title="W górę" disabled={index === 0} onClick={() => onMove(index, index - 1)}>↑</button>
      <button type="button" style={iconBtn} title="W dół" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>↓</button>
      <button type="button" style={iconBtn} title="Usuń składową" onClick={() => onRemove(index)}>×</button>
    </div>
  );
}

export function ClassSpecPanel({ node, onAdd, onUpdate, onRemove, onMove, onStereotype, onClose }: ClassSpecPanelProps) {
  const members = node.members ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 12 }}>{node.label || node.id}</strong>
        <label style={{ ...head, display: 'flex', alignItems: 'center', gap: 4 }}>
          adnotacja
          <select style={input} value={node.stereotype ?? ''} onChange={(e) => onStereotype(e.target.value)}>
            {STEREOTYPES.map((s) => <option key={s} value={s}>{s || '— brak —'}</option>)}
          </select>
        </label>
        <button type="button" style={iconBtn} onClick={() => onAdd('field')}>+ pole</button>
        <button type="button" style={iconBtn} onClick={() => onAdd('method')}>+ metoda</button>
        <span style={{ flex: 1 }} />
        <button type="button" style={iconBtn} title="Zamknij panel" onClick={onClose}>×</button>
      </div>

      {members.length === 0 ? (
        <div style={{ fontSize: 11, color: '#94a3b8' }}>Klasa bez składowych — dodaj pole albo metodę.</div>
      ) : (
        // Lista bywa długa; przewijamy ją, zamiast rozpychać nakładkę na całą
        // wysokość płótna.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 210, overflowY: 'auto' }}>
          {members.map((member, i) => (
            <MemberRow
              key={i}
              member={member}
              index={i}
              count={members.length}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
