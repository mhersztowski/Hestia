/**
 * edges.tsx — krawędź z etykietą edytowaną wprost na diagramie.
 *
 * Opis przejścia (`Idle --> Praca: start`) niesie w automacie najwięcej treści,
 * więc musi dać się poprawić jednym kliknięciem w tekst, bez okienek.
 * `EdgeLabelRenderer` wystawia etykietę jako zwykły HTML nad płótnem, dzięki
 * czemu można w niej użyć pola tekstowego.
 */
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type EdgeProps, type Edge } from '@xyflow/react';
import type { FlowEdgeData } from './flowBridge';
import { InlineLabel } from './InlineLabel';

/** Podpis przy końcu linii, odsunięty w stronę jej środka. */
function Cardinality({ x, y, toward, text }: { x: number; y: number; toward: { x: number; y: number }; text: string }) {
  const dx = toward.x - x;
  const dy = toward.y - y;
  const length = Math.hypot(dx, dy) || 1;
  const OFFSET = 22;
  return (
    <div
      style={{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${x + (dx / length) * OFFSET}px, ${y + (dy / length) * OFFSET}px)`,
        fontSize: 10,
        color: '#475569',
        background: '#f8fafc',
        padding: '0 3px',
        borderRadius: 2,
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  );
}

export function DiagramEdgeView({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, data, selected,
  markerEnd, markerStart,
}: EdgeProps<Edge<FlowEdgeData>>) {
  // Pętla własna: oba końce leżą na tym samym boku, więc krzywa między nimi
  // byłaby ledwie widoczną kreską. Rysujemy wyraźny łuk pod węzłem i wieszamy
  // na nim opis — bez tego relacja hierarchiczna (`X do X`) ginęła.
  const selfLoop = Math.abs(targetX - sourceX) < 60 && Math.abs(targetY - sourceY) < 30;
  // Głębokość dobrana tak, by opis zmieścił się pod węzłem i nie zlewał z
  // krawędziami sąsiadów; płytszy łuk był ledwie widoczną kreską.
  const LOOP_DEPTH = 110;

  const [path, labelX, labelY] = selfLoop
    ? [
      `M${sourceX} ${sourceY} C ${sourceX - 34} ${sourceY + LOOP_DEPTH}, ${targetX + 34} ${targetY + LOOP_DEPTH}, ${targetX} ${targetY}`,
      (sourceX + targetX) / 2,
      sourceY + LOOP_DEPTH * 0.78,
    ]
    // Połączenia skośne (np. rozwinięte z `A & B --> C & D`) rysujemy łukiem, tak
    // jak Mermaid: łamana w kącie prostym zlewa się z sąsiednimi liniami i przy
    // krzyżujących się przejściach nie widać, co z czym jest połączone.
    : Math.abs(targetX - sourceX) > 20 && Math.abs(targetY - sourceY) > 20
      ? getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
      : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  // Krawędzie łączące tę samą parę węzłów biegną tą samą trasą, więc ich opisy
  // nachodziłyby na siebie („uruch stop omiar"). Rozsuwamy je prostopadle do
  // odcinka, symetrycznie wokół środka.
  const count = data?.parallelCount ?? 1;
  const index = data?.parallelIndex ?? 0;
  const spread = count > 1 ? (index - (count - 1) / 2) * 26 : 0;
  // Kąt normalizujemy do półokręgu: krawędź powrotna ma go obrócony o 180°, więc
  // bez tego przesunięcia obu etykiet znosiły się i lądowały w tym samym punkcie.
  const rawAngle = Math.atan2(targetY - sourceY, targetX - sourceX);
  const angle = rawAngle < 0 ? rawAngle + Math.PI : rawAngle;
  const labelOffsetX = spread * -Math.sin(angle);
  const labelOffsetY = spread * Math.cos(angle);

  const dashed = data?.lineStyle === 'dotted';
  const thick = data?.lineStyle === 'thick';

  return (
    <>
      <BaseEdge
        id={id}
        path={selfLoop ? String(path) : path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: selected ? '#2563eb' : '#64748b',
          strokeWidth: thick ? 2.5 : 1.5,
          ...(dashed ? { strokeDasharray: '6 4' } : {}),
          // Link `~~~` istnieje tylko po to, by ustawić układ. W wyniku go nie
          // widać, ale w edytorze musi zostać uchwytny — stąd ślad zamiast nic.
          ...(data?.invisible && !selected ? { strokeOpacity: 0.2, strokeDasharray: '2 6' } : {}),
        }}
      />
      {/* Krotności (UML) stoją PRZY KOŃCACH, nie w środku — środek należy do
          opisu relacji, a „1" i „0..*" mówią o konkretnej stronie powiązania. */}
      <EdgeLabelRenderer>
        {data?.sourceLabel && <Cardinality x={sourceX} y={sourceY} toward={{ x: targetX, y: targetY }} text={data.sourceLabel} />}
        {data?.targetLabel && <Cardinality x={targetX} y={targetY} toward={{ x: sourceX, y: sourceY }} text={data.targetLabel} />}
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX + labelOffsetX}px, ${labelY + labelOffsetY}px)`,
            fontSize: 11,
            padding: '1px 5px',
            borderRadius: 3,
            background: '#f8fafc',
            color: '#334155',
            // Etykieta musi przyjmować zdarzenia, inaczej nie da się jej kliknąć —
            // płótno React Flow domyślnie je przepuszcza.
            pointerEvents: 'all',
            maxWidth: 220,
          }}
          className="nodrag nopan"
        >
          <InlineLabel
            value={typeof label === 'string' ? label : ''}
            placeholder={data?.editable === false ? '' : '+ opis'}
            allowEmpty
            editable={data?.editable !== false}
            onCommit={(next) => data?.onRelabel?.(id, next)}
            style={{ opacity: label ? 1 : 0.45 }}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const diagramEdgeTypes = { diagramEdge: DiagramEdgeView };
