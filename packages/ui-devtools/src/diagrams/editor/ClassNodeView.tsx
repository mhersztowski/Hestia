/**
 * ClassNodeView — klasa w notacji UML: nagłówek, pola, metody.
 *
 * Osobny widok, bo klasa jako jedyna ma **ciało**: pozostałe węzły to figura z
 * jedną etykietą, a tu trzeba trzech sekcji rozdzielonych kreskami i wyrównania
 * do lewej — środkowanie listy pól czyni ją nieczytelną.
 *
 * Nazwa klasy jest edytowalna wprost na diagramie (jak wszystkie etykiety);
 * składowe edytuje się w kodzie, bo ich składnia niesie więcej niż tekst
 * (widoczność, typ, parametry, modyfikatory) i pole tekstowe by ją spłaszczyło.
 */
import type { NodeProps, Node } from '@xyflow/react';
import { NodeAnchors } from './nodeAnchors';
import type { ClassMember, MemberVisibility } from '../model/diagram';
import type { FlowNodeData } from './flowBridge';
import { InlineLabel } from './InlineLabel';

const STROKE = '#64748b';
const STROKE_SELECTED = '#2563eb';

/** Znak widoczności w notacji UML — czytelny bez legendy. */
const SIGN: Record<MemberVisibility, string> = {
  public: '+', private: '−', protected: '#', package: '~',
};

function memberText(member: ClassMember): string {
  if (!member.name) return member.raw;
  const sign = member.visibility ? SIGN[member.visibility] : '';
  if (member.kind === 'method') {
    const type = member.type ? `: ${member.type}` : '';
    return `${sign}${member.name}(${member.params ?? ''})${type}`;
  }
  return `${sign}${member.name}${member.type ? `: ${member.type}` : ''}`;
}

function MemberRow({ member }: { member: ClassMember }) {
  return (
    <div
      title={member.raw}
      style={{
        padding: '1px 8px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        // Statyczna podkreślona, abstrakcyjna kursywą — konwencja UML.
        textDecoration: member.isStatic ? 'underline' : undefined,
        fontStyle: member.isAbstract ? 'italic' : undefined,
      }}
    >
      {memberText(member)}
    </div>
  );
}

export function ClassNodeView({ id, data, selected }: NodeProps<Node<FlowNodeData>>) {
  const members = data.members ?? [];
  const fields = members.filter((m) => m.kind === 'field');
  const methods = members.filter((m) => m.kind === 'method');
  const stroke = selected ? STROKE_SELECTED : STROKE;
  const divider = `1px solid ${stroke}`;

  return (
    <div
      style={{
        flex: 1,
        alignSelf: 'stretch',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        border: `${selected ? 2 : 1.4}px solid ${stroke}`,
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.35,
        color: '#0f172a',
        overflow: 'hidden',
      }}
    >
      <NodeAnchors />

      <div style={{ padding: '4px 8px', textAlign: 'center', borderBottom: members.length ? divider : undefined }}>
        {data.stereotype && (
          <div style={{ fontSize: 10, color: '#64748b' }}>«{data.stereotype}»</div>
        )}
        <div style={{ fontWeight: 600 }}>
          <InlineLabel
            value={data.label}
            placeholder={data.fallback}
            placeholderIsValue
            editable={data.editable !== false}
            onCommit={(next) => data.onRename?.(id, next)}
            inputStyle={{ textAlign: 'center', fontWeight: 600 }}
          />
        </div>
      </div>

      {/* Pola i metody w osobnych sekcjach — tak czyta się diagram klas. */}
      {fields.length > 0 && (
        <div style={{ padding: '3px 0', borderBottom: methods.length ? divider : undefined }}>
          {fields.map((m, i) => <MemberRow key={`f${i}`} member={m} />)}
        </div>
      )}
      {methods.length > 0 && (
        <div style={{ padding: '3px 0' }}>
          {methods.map((m, i) => <MemberRow key={`m${i}`} member={m} />)}
        </div>
      )}

    </div>
  );
}
