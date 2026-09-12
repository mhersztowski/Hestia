/**
 * SequenceView — rysunek przebiegu w SVG.
 *
 * Świadomie bez React Flow: ta biblioteka układa graf, w którym element można
 * przeciągnąć gdziekolwiek. W sekwencji pozycja nie jest swobodna — wynika z
 * kolejności w czasie, a przeciąganie wiadomości „na bok" nie ma znaczenia.
 * Geometrię liczy `layoutSequence`, tutaj zostaje samo rysowanie i wskazywanie.
 */
import type { SequenceScript, StepPath } from '../model/sequence';
import { layoutSequence, shouldPinHeads, type LaidOutParticipant } from '../model/sequenceLayout';

export interface SequenceViewProps {
  script: SequenceScript;
  /** Zaznaczony krok — podświetlany. */
  selected?: StepPath;
  onSelect?: (path: StepPath) => void;
  /** Klik w nagłówek uczestnika. */
  onSelectParticipant?: (id: string) => void;
  selectedParticipant?: string;
  /** Przewinięcie kontenera — decyduje o przypięciu nagłówków. */
  scrollTop?: number;
  /** Wysokość widocznego kadru. */
  viewportHeight?: number;
}

const LINE = '#64748b';
const ACCENT = '#2563eb';
const samePath = (a?: StepPath, b?: StepPath) => !!a && !!b && a.join('.') === b.join('.');

/** Czy strzałka ma być przerywana — druga część nazwy niesie tę informację. */
const isDotted = (arrow: string) => arrow.startsWith('dotted') || arrow === 'biDotted';

/**
 * Kolor tła bloku `rect`.
 *
 * W Mermaidzie `rect rgb(255, 240, 220)` nie ma tytułu — to, co po słowie
 * kluczowym, JEST kolorem. Rysowanie tego jako etykiety `[rgb(255, 240, 220)]`
 * pokazywało użytkownikowi zapis zamiast efektu.
 */
function rectFill(title?: string): string | undefined {
  if (!title) return undefined;
  const text = title.trim();
  return /^(rgba?\([\d\s.,%]+\)|#[0-9a-f]{3,8})$/i.test(text) ? text : undefined;
}

/** Zakończenie linii wiadomości zależnie od rodzaju strzałki. */
function messageMarker(arrow: string): string | undefined {
  if (arrow.endsWith('Cross')) return 'url(#seq-cross)';
  if (arrow.endsWith('Open')) return 'url(#seq-open)';
  if (arrow === 'solid' || arrow === 'dotted') return undefined;
  return 'url(#seq-arrow)';
}

/**
 * Etykieta bloku albo jego sekcji.
 *
 * Tło jest konieczne: etykieta stoi na przerywanej krawędzi ramki, a linia
 * przechodząca przez tekst wygląda jak przekreślenie i utrudnia czytanie.
 * Szerokość szacujemy z długości napisu — dokładny pomiar wymagałby DOM-u, a
 * kilka pikseli zapasu nikomu nie przeszkadza.
 */
function BlockLabel({ x, y, text }: { x: number; y: number; text: string }) {
  const label = `[${text}]`;
  return (
    <g>
      <rect x={x - 3} y={y - 9} width={label.length * 5.4 + 6} height={13} fill="#f8fafc" rx={2} />
      <text x={x} y={y} fontSize={10} fill="#64748b">{label}</text>
    </g>
  );
}

/** Nagłówek uczestnika — ten sam kształt u góry i w stopce. */
function ParticipantHead({ participant, top, selected, onSelect }: {
  participant: LaidOutParticipant;
  top: number;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const stroke = selected ? ACCENT : LINE;
  return (
    <g onClick={() => onSelect?.(participant.id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
      {participant.isActor ? (
        // Aktor: ludzik zamiast pudełka — tak odróżnia go Mermaid.
        <g stroke={stroke} fill="none" strokeWidth={1.4}>
          <circle cx={participant.x} cy={top + 8} r={6} />
          <path d={`M${participant.x} ${top + 14} v12 M${participant.x - 8} ${top + 19} h16 M${participant.x} ${top + 26} l-6 8 M${participant.x} ${top + 26} l6 8`} />
        </g>
      ) : (
        <rect
          x={participant.x - 52} y={top} width={104} height={40} rx={4}
          fill="#f8fafc" stroke={stroke} strokeWidth={selected ? 2 : 1.4}
        />
      )}
      <text
        x={participant.x} y={top + (participant.isActor ? 48 : 24)}
        textAnchor="middle" fill="#0f172a" fontWeight={600}
      >
        {participant.label}
      </text>
    </g>
  );
}

/**
 * Numer kroku — ciemna kulka na linii życia.
 *
 * Prefiks w tekście („1. treść") mieszał się z treścią wiadomości i przy
 * długich opisach ginął; kulka trzyma się linii, więc kolejność da się śledzić
 * wzrokiem w dół.
 */
function StepNumber({ number, x, y }: { number?: number; x: number; y: number }) {
  if (!number) return null;
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill="#334155" />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fill="#fff" fontWeight={600}>
        {number}
      </text>
    </g>
  );
}

export function SequenceView({
  script, selected, onSelect, onSelectParticipant, selectedParticipant,
  scrollTop = 0, viewportHeight = 0,
}: SequenceViewProps) {
  const layout = layoutSequence(script);
  const pinned = viewportHeight > 0 && shouldPinHeads(layout, scrollTop, viewportHeight);

  return (
    <div style={{ position: 'relative', width: layout.width }}>
      {/* Przypięte nazwy uczestników. `position: sticky` trzyma pasek u góry
          kadru w pionie, a w poziomie przesuwa go razem z diagramem — dzięki
          czemu nazwy zostają nad swoimi liniami życia. `height: 0` sprawia, że
          pasek nie zajmuje miejsca w układzie i nic nie przesuwa. */}
      {pinned && (
        <div style={{ position: 'sticky', top: 0, height: 0, zIndex: 3 }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: layout.width, height: 26,
            background: 'rgba(248,250,252,0.96)', borderBottom: '1px solid #e2e8f0',
          }}>
            {layout.participants.map((participant) => (
              <span
                key={participant.id}
                onClick={() => onSelectParticipant?.(participant.id)}
                style={{
                  position: 'absolute', left: participant.x - 50, top: 4, width: 100,
                  textAlign: 'center', fontSize: 11, fontWeight: 600,
                  color: selectedParticipant === participant.id ? ACCENT : '#0f172a',
                  cursor: onSelectParticipant ? 'pointer' : 'default',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {participant.label}
              </span>
            ))}
          </div>
        </div>
      )}

    <svg
      // Rozmiar własny, nie „100% szerokości": przy skalowaniu do kontenera
      // diagram z kilkoma uczestnikami kurczył się do miniatury, bo proporcje
      // viewBoxa wymuszały wysokość. Przebieg czyta się w naturalnej skali,
      // a długość przebiegu obsługuje przewijanie kontenera.
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={{ display: 'block', fontSize: 12, fontFamily: 'inherit' }}
    >
      <defs>
        <marker id="seq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={LINE} />
        </marker>
        {/* Grot otwarty — wywołanie asynchroniczne (`-)`). */}
        <marker id="seq-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10" fill="none" stroke={LINE} strokeWidth="1.6" />
        </marker>
        <marker id="seq-cross" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M2 2 L8 8 M8 2 L2 8" stroke={LINE} strokeWidth="1.8" fill="none" />
        </marker>
      </defs>

      {/* Ramki bloków pod resztą — inaczej zasłaniałyby wiadomości. */}
      {layout.blocks.map((block) => {
        // `rect` z kolorem jest samym tłem: bez chipa, bez etykiety i bez
        // przerywanej ramki — dokładnie jak w Mermaidzie.
        const fill = block.block === 'rect' ? rectFill(block.title) : undefined;
        const active = samePath(selected, block.path);
        return (
        <g key={`b${block.path.join('.')}`} onClick={() => onSelect?.(block.path)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
          <rect
            x={block.x} y={block.y} width={block.width} height={block.height}
            fill={fill ?? 'rgba(148,163,184,0.06)'}
            stroke={active ? ACCENT : fill ? 'none' : '#94a3b8'}
            strokeWidth={active ? 2 : 1}
            strokeDasharray={fill ? undefined : '4 3'}
            rx={4}
          />
          {!fill && <rect x={block.x} y={block.y} width={54} height={17} fill="#e2e8f0" rx={2} />}
          {!fill && <text x={block.x + 6} y={block.y + 12.5} fontSize={10} fill="#475569">{block.block}</text>}
          {!fill && block.title && <BlockLabel x={block.x + 62} y={block.y + 12.5} text={block.title} />}
          {block.dividers.map((divider, i) => (
            <g key={i}>
              <line x1={block.x} y1={divider.y} x2={block.x + block.width} y2={divider.y} stroke="#94a3b8" strokeDasharray="4 3" />
              {divider.title && (
                // Ta sama pozycja co tytuł bloku: etykieta sekcji opisuje
                // przypadek tak samo jak `[QoS 1 i ACK]` opisuje pierwszy, więc
                // musi stać w tej samej kolumnie, tuż pod swoją linią.
                <BlockLabel x={block.x + 62} y={divider.y + 13} text={divider.title} />
              )}
            </g>
          ))}
        </g>
        );
      })}

      {/* Linia życia biegnie od nagłówka (albo miejsca powstania) do stopki
          albo do `destroy`. */}
      {layout.participants.map((participant) => {
        const top = participant.spawnY !== undefined ? participant.spawnY + 40 : layout.headHeight;
        const bottom = participant.destroyY ?? layout.footerY;
        return (
          <g key={`l${participant.id}`}>
            <line
              x1={participant.x} y1={top} x2={participant.x} y2={bottom}
              stroke="#cbd5e1" strokeDasharray="4 4"
            />
            {/* Krzyżyk zamykający linię życia — `destroy`. */}
            {participant.destroyY !== undefined && (
              <path
                d={`M${participant.x - 7} ${bottom - 7} l14 14 M${participant.x + 7} ${bottom - 7} l-14 14`}
                stroke={LINE} strokeWidth={2} fill="none"
              />
            )}
          </g>
        );
      })}

      {/* Nagłówki uczestników. Powtórzenie w stopce ma sens tylko dla tych,
          którzy dożyli końca przebiegu — reszta kończy się krzyżykiem. */}
      {layout.participants.map((participant) => (
        <g key={`h${participant.id}`}>
          <ParticipantHead
            participant={participant}
            top={participant.spawnY ?? 12}
            selected={selectedParticipant === participant.id}
            onSelect={onSelectParticipant}
          />
          {participant.destroyY === undefined && (
            <ParticipantHead
              participant={participant}
              top={layout.footerY}
              selected={selectedParticipant === participant.id}
              onSelect={onSelectParticipant}
            />
          )}
        </g>
      ))}

      {/* Paski aktywności na liniach życia. */}
      {layout.activations.map((activation, i) => (
        <rect
          key={i}
          x={activation.x - 5} y={activation.top} width={10} height={Math.max(activation.bottom - activation.top, 8)}
          fill="#e2e8f0" stroke={LINE} strokeWidth={1}
        />
      ))}

      {layout.notes.map((note) => (
        <g key={`n${note.path.join('.')}`} onClick={() => onSelect?.(note.path)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
          <rect
            x={note.x} y={note.y} width={note.width} height={28} rx={2}
            fill="#fef9c3"
            stroke={samePath(selected, note.path) ? ACCENT : '#ca8a04'}
            strokeWidth={samePath(selected, note.path) ? 2 : 1}
          />
          <text x={note.x + 8} y={note.y + 18} fontSize={11} fill="#713f12">{note.text}</text>
        </g>
      ))}

      {layout.messages.map((message) => {
        const active = samePath(selected, message.path);
        const stroke = active ? ACCENT : LINE;
        const label = message.text;

        if (message.selfCall) {
          // Wiadomość do siebie: pętelka w prawo od własnej osi.
          const x = message.fromX;
          const d = `M${x} ${message.y} h34 v22 h-34`;
          return (
            <g key={`m${message.path.join('.')}`} onClick={() => onSelect?.(message.path)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <path d={d} fill="none" stroke={stroke} strokeWidth={active ? 2 : 1.4}
                strokeDasharray={isDotted(message.arrow) ? '5 4' : undefined}
                markerEnd={messageMarker(message.arrow)} />
              <text x={x + 42} y={message.y + 4} fontSize={11} fill="#334155">{label}</text>
              <StepNumber number={message.number} x={x} y={message.y} />
            </g>
          );
        }

        const dir = message.toX >= message.fromX ? 1 : -1;
        return (
          <g key={`m${message.path.join('.')}`} onClick={() => onSelect?.(message.path)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
            {/* Szeroka, przezroczysta linia pod spodem — sama kreska jest zbyt
                cienka, żeby dało się w nią trafić kursorem. */}
            <line x1={message.fromX} y1={message.y} x2={message.toX} y2={message.y} stroke="transparent" strokeWidth={12} />
            <line
              x1={message.fromX + dir * 5} y1={message.y} x2={message.toX - dir * 5} y2={message.y}
              stroke={stroke} strokeWidth={active ? 2 : 1.4}
              strokeDasharray={isDotted(message.arrow) ? '5 4' : undefined}
              markerEnd={messageMarker(message.arrow)}
              markerStart={message.arrow.startsWith('bi') ? 'url(#seq-arrow)' : undefined}
            />
            <text
              x={(message.fromX + message.toX) / 2} y={message.y - 6}
              textAnchor="middle" fontSize={11} fill="#334155"
            >
              {label}
            </text>
            {/* Numer siedzi na linii życia NADAWCY — tak czyta się kolejność w
                Mermaidzie: kulka pokazuje, kto zainicjował krok. */}
            <StepNumber number={message.number} x={message.fromX} y={message.y} />
          </g>
        );
      })}
    </svg>
    </div>
  );
}
