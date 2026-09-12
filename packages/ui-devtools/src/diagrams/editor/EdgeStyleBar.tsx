/**
 * EdgeStyleBar — ustawienia zaznaczonego połączenia.
 *
 * Po wczytaniu diagramu z Mermaida krawędzie mają już style (kropkowana, gruba,
 * kółko na końcu, strzałka w obie strony), ale bez tego paska nie dało się ich
 * zmienić — jedyne, co edytor pozwalał zrobić z połączeniem, to opisać je albo
 * skasować.
 *
 * Pasek pokazuje **tylko to, co dany format naprawdę zapisze**. Diagram stanów
 * w Mermaidzie zna jedno przejście (`-->`), więc style linii są tam wyłączone z
 * wyjaśnieniem — obiecywanie ustawienia, które zniknie przy zapisie, jest gorsze
 * niż jego brak.
 */
import type { CSSProperties } from 'react';
import type { ClassRelationKind, DiagramEdge, DiagramKind, EdgeArrowType, EdgeLineStyle } from '../model/diagram';
import type { EdgeStylePatch } from '../model/operations';
import { CLASS_RELATION_KINDS, RELATION_MEANING, relationOf } from '../model/classRelations';

export interface EdgeStyleBarProps {
  edge: DiagramEdge;
  /** Rodzaj diagramu decyduje, które ustawienia format uniesie. */
  kind: DiagramKind;
  onChange: (patch: EdgeStylePatch) => void;
  onReverse: () => void;
  /** Zmiana rodzaju relacji (diagram klas) — wygląd wynika z niej sam. */
  onRelation?: (relation: ClassRelationKind) => void;
  /** Zamiana stron relacji miejscami. */
  onSwapSides?: () => void;
}

/** Diagram klas zna dwa rodzaje linii: ciągłą i przerywaną (`..`). */
const CLASS_LINE_STYLES: Array<{ value: EdgeLineStyle | 'invisible'; label: string; title: string }> = [
  { value: 'solid', label: 'ciągła', title: 'A -- B' },
  { value: 'dotted', label: 'przerywana', title: 'A .. B — zależność, realizacja' },
];

const LINE_STYLES: Array<{ value: EdgeLineStyle | 'invisible'; label: string; title: string }> = [
  { value: 'solid', label: 'ciągła', title: 'A --> B' },
  { value: 'dotted', label: 'kropkowana', title: 'A -.-> B' },
  { value: 'thick', label: 'gruba', title: 'A ==> B' },
  { value: 'invisible', label: 'niewidzialna', title: 'A ~~~ B — tylko układ, linii nie widać' },
];

const ENDS: Array<{ value: EdgeArrowType; label: string; title: string }> = [
  { value: 'arrow', label: 'strzałka', title: '-->' },
  { value: 'none', label: 'brak', title: '---' },
  { value: 'circle', label: 'kółko', title: '--o' },
  { value: 'cross', label: 'krzyżyk', title: '--x' },
];

/** Zakończenia UML — mają sens wyłącznie w diagramie klas. */
const UML_ENDS: Array<{ value: EdgeArrowType; label: string; title: string }> = [
  { value: 'none', label: 'brak', title: 'A -- B: zwykłe powiązanie' },
  { value: 'arrow', label: 'strzałka', title: 'A --> B: asocjacja skierowana' },
  { value: 'triangle', label: 'trójkąt (dziedziczenie)', title: 'A <|-- B' },
  { value: 'diamondFilled', label: 'romb pełny (kompozycja)', title: 'A *-- B' },
  { value: 'diamond', label: 'romb pusty (agregacja)', title: 'A o-- B' },
];

/** Strony relacji w kolejności semantycznej — do podpisu w pasku. */
function relationSides(edge: DiagramEdge, relation: ClassRelationKind): { from: string; to: string } {
  const endAtSource = edge.relationEnd
    ? edge.relationEnd === 'source'
    : edge.arrow === 'none' && !!edge.meta?.startArrow;
  const endAtFrom = relation === 'inheritance' || relation === 'realization'
    || relation === 'composition' || relation === 'aggregation';
  const mainIsSource = endAtFrom ? endAtSource : !endAtSource;
  return mainIsSource
    ? { from: edge.source, to: edge.target }
    : { from: edge.target, to: edge.source };
}

const field: CSSProperties = { fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 };
const input: CSSProperties = { fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff' };

export function EdgeStyleBar({ edge, kind, onChange, onReverse, onRelation, onSwapSides }: EdgeStyleBarProps) {
  // W diagramie stanów Mermaid rysuje wyłącznie `-->`; wszystko inne i tak by
  // przy zapisie zniknęło.
  const stylesSupported = kind !== 'state';
  const unsupported = stylesSupported ? undefined : 'Mermaid w diagramie stanów rysuje tylko zwykłe strzałki';
  // Diagram klas ma własny zestaw zakończeń (UML) i tylko dwa style linii;
  // „gruba" i „niewidzialna" nie mają tam odpowiednika w składni.
  const isClass = kind === 'class';
  const lineOptions = isClass ? CLASS_LINE_STYLES : LINE_STYLES;
  const endOptions = isClass ? UML_ENDS : ENDS;

  const lineValue: EdgeLineStyle | 'invisible' = edge.meta?.invisible === 'true' ? 'invisible' : edge.lineStyle;
  const startArrow = (edge.meta?.startArrow as EdgeArrowType | undefined) ?? 'none';

  // W diagramie klas o wyglądzie decyduje RODZAJ relacji, a nie odwrotnie —
  // ustawianie grotu i stylu osobno pozwalałoby stworzyć kombinację, która nie
  // odpowiada żadnej relacji UML (np. romb na linii przerywanej).
  if (isClass && onRelation) {
    const relation = relationOf(edge);
    const meaning = RELATION_MEANING[relation];
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label style={field} title="Rodzaj relacji — wygląd linii wynika z niego">
          Relacja
          <select
            style={input}
            value={relation}
            onChange={(e) => onRelation(e.target.value as ClassRelationKind)}
          >
            {CLASS_RELATION_KINDS.map((k) => (
              <option key={k} value={k}>{RELATION_MEANING[k].label}</option>
            ))}
          </select>
        </label>

        {onSwapSides && (
          <button type="button" style={{ ...input, cursor: 'pointer' }} onClick={onSwapSides} title="Zamień strony relacji">
            Zamień strony
          </button>
        )}

        {/* Kto jest kim w tej relacji — bez tego trzeba by pamiętać, po której
            stronie stoi nadklasa, a po której podklasa. */}
        <span style={{ fontSize: 11, color: '#475569' }}>
          {relationSides(edge, relation).from} <em style={{ color: '#94a3b8' }}>({meaning.from})</em>
          {' → '}
          {relationSides(edge, relation).to} <em style={{ color: '#94a3b8' }}>({meaning.to})</em>
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <label style={field} title={unsupported ?? 'Rodzaj linii'}>
        Linia
        <select
          style={input}
          value={lineValue}
          disabled={!stylesSupported}
          onChange={(e) => {
            const next = e.target.value as EdgeLineStyle | 'invisible';
            // „Niewidzialna" nie jest stylem linii, tylko osobnym rodzajem
            // połączenia — przy powrocie trzeba ją zdjąć, nie nadpisać.
            onChange(next === 'invisible'
              ? { invisible: true }
              : { lineStyle: next, invisible: false });
          }}
        >
          {lineOptions.map((s) => <option key={s.value} value={s.value} title={s.title}>{s.label}</option>)}
        </select>
      </label>

      <label style={field} title={unsupported ?? 'Zakończenie po stronie celu'}>
        Grot
        <select
          style={input}
          value={edge.arrow}
          disabled={!stylesSupported}
          onChange={(e) => onChange({ arrow: e.target.value as EdgeArrowType })}
        >
          {endOptions.map((a) => <option key={a.value} value={a.value} title={a.title}>{a.label}</option>)}
        </select>
      </label>

      <label style={field} title={unsupported ?? 'Zakończenie po stronie źródła (`<-->`, `o--o`, `x--x`)'}>
        Początek
        <select
          style={input}
          value={startArrow}
          disabled={!stylesSupported}
          onChange={(e) => onChange({ startArrow: e.target.value as EdgeArrowType })}
        >
          {endOptions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </label>

      <label style={field} title={unsupported ?? 'Długość linii — w Mermaidzie odsuwa węzły od siebie'}>
        Długość
        <input
          type="number"
          min={1}
          max={9}
          style={{ ...input, width: 48 }}
          value={edge.length ?? 1}
          disabled={!stylesSupported}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next >= 1) onChange({ length: Math.min(next, 9) });
          }}
        />
      </label>

      {/* Odwrócenie działa w każdym formacie — to zmiana danych, nie stylu. */}
      <button
        type="button"
        style={{ ...input, cursor: 'pointer' }}
        onClick={onReverse}
        title={`Odwróć: ${edge.target} → ${edge.source}`}
      >
        Odwróć kierunek
      </button>

      <span style={{ fontSize: 11, color: '#94a3b8' }}>{edge.source} → {edge.target}</span>
      {unsupported && <span style={{ fontSize: 11, color: '#94a3b8' }}>({unsupported})</span>}
    </div>
  );
}
