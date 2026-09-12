/**
 * sequenceDiagram.ts — Mermaid `sequenceDiagram` ⇄ model przebiegu.
 *
 * Parser jest **stosowy**, nie liniowy jak pozostałe: `loop`/`alt`/`par`
 * otwierają blok, `else`/`and`/`option` zaczynają nową sekcję, `end` zamyka.
 * Kolejność i zagnieżdżenie są tu treścią, więc krok trafia zawsze do sekcji
 * bloku otwartego najpóźniej.
 *
 * Nierozpoznana linia zostaje krokiem `raw` **w tym samym miejscu przebiegu** —
 * nie w osobnej liście na końcu. W diagramie sekwencji pozycja linii jest
 * znacząca: przesunięcie jej na koniec zmieniłoby przebieg albo zepsuło składnię
 * (`end` bez otwarcia).
 */
import { emptyDiagram, type DiagramDocument } from '../../model/diagram';
import {
  emptySequence, isBlock, participantsUsed,
  type SequenceArrow, type SequenceBlock, type SequenceBlockKind,
  type SequenceParticipant, type SequenceScript, type SequenceStep,
} from '../../model/sequence';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';

const HEADER = /^\s*sequenceDiagram\s*$/i;
/** `autonumber`, `autonumber 10`, `autonumber 10 10` */
const AUTONUMBER = /^\s*autonumber(?:\s+(\d+))?(?:\s+(\d+))?\s*$/i;
/** `participant A as Alicja` / `actor B` */
const PARTICIPANT = /^\s*(?:(create)\s+)?(participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+?))?\s*$/i;
/** `destroy A` — koniec życia uczestnika. */
const DESTROY = /^\s*destroy\s+([A-Za-z0-9_]+)\s*$/i;
/** `activate A` / `deactivate A` */
const ACTIVATION = /^\s*(activate|deactivate)\s+([A-Za-z0-9_]+)\s*$/i;
/** `Note over A,B: tekst` */
const NOTE = /^\s*note\s+(left of|right of|over)\s+([A-Za-z0-9_,\s]+?)\s*:\s*(.*)$/i;
const BLOCK_OPEN = /^\s*(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i;
const SECTION = /^\s*(else|and|option)\b\s*(.*)$/i;
const BLOCK_END = /^\s*end\s*$/i;

/**
 * Wiadomość: `A ->>+ B : tekst`.
 *
 * Operator rozpoznajemy osobno od nazw, bo `-`, `x` i `)` mogą wystąpić też w
 * tekście wiadomości — a ten zaczyna się dopiero za dwukropkiem.
 */
const MESSAGE = new RegExp(
  '^\\s*(?<from>[A-Za-z0-9_]+)\\s*' +
  '(?<op><<-->>|<<->>|--x|--\\)|-->>|-->|-x|-\\)|->>|->)' +
  // Odstępy wokół znacznika aktywacji są dowolne: `A->>+B`, `A ->> + B`,
  // `A->> +B` — bez tego wiadomość z aktywacją nie była rozpoznawana wcale i
  // znikała z diagramu, choć w źródle stała.
  '\\s*(?<flag>[+-])?\\s*' +
  '(?<to>[A-Za-z0-9_]+)\\s*' +
  '(?::\\s*(?<text>.*))?$',
);

/** Zapis operatora ⇄ nazwa w modelu. Kolejność ma znaczenie przy dopasowaniu. */
const ARROWS: Array<{ op: string; arrow: SequenceArrow }> = [
  { op: '<<-->>', arrow: 'biDotted' },
  { op: '<<->>', arrow: 'biSolid' },
  { op: '--x', arrow: 'dottedCross' },
  { op: '--)', arrow: 'dottedOpen' },
  { op: '-->>', arrow: 'dottedArrow' },
  { op: '-->', arrow: 'dotted' },
  { op: '-x', arrow: 'solidCross' },
  { op: '-)', arrow: 'solidOpen' },
  { op: '->>', arrow: 'solidArrow' },
  { op: '->', arrow: 'solid' },
];

const arrowOf = (op: string): SequenceArrow => ARROWS.find((a) => a.op === op)?.arrow ?? 'solidArrow';
const opOf = (arrow: SequenceArrow): string => ARROWS.find((a) => a.arrow === arrow)?.op ?? '->>';

export function parseSequenceDiagram(text: string): ParseResult {
  const doc = emptyDiagram('sequence');
  const issues: ParseIssue[] = [];
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };

  const script: SequenceScript = emptySequence();
  const declared = new Map<string, SequenceParticipant>();

  /**
   * Stos otwartych bloków. Wierzchołek wskazuje sekcję, do której trafia
   * kolejny krok — dzięki temu zagnieżdżenie nie wymaga rekurencji.
   */
  const stack: SequenceBlock[] = [];
  const currentSteps = (): SequenceStep[] => {
    const open = stack[stack.length - 1];
    if (!open) return script.steps;
    return open.sections[open.sections.length - 1].steps;
  };
  const push = (step: SequenceStep) => { currentSteps().push(step); };

  let seenHeader = false;

  for (const line of front.body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!seenHeader && HEADER.test(line)) { seenHeader = true; continue; }

    const autonumber = AUTONUMBER.exec(trimmed);
    if (autonumber && !stack.length) {
      script.autonumber = true;
      if (autonumber[1]) script.autonumberStart = Number(autonumber[1]);
      if (autonumber[2]) script.autonumberStep = Number(autonumber[2]);
      continue;
    }

    const destroy = DESTROY.exec(trimmed);
    if (destroy) { push({ kind: 'destroy', participant: destroy[1] }); continue; }

    const participant = PARTICIPANT.exec(trimmed);
    if (participant) {
      const [, create, keyword, id, alias] = participant;
      const entry: SequenceParticipant = {
        id,
        label: alias?.trim() ?? '',
        ...(keyword.toLowerCase() === 'actor' ? { isActor: true } : {}),
        // `create` niesie informację o MIEJSCU powstania, więc deklaracja
        // zostaje krokiem przebiegu — nie wolno jej przenieść do nagłówka.
        ...(create ? { createdInline: true } : {}),
      };
      if (create) push({ kind: 'create', participant: id });
      // Powtórzona deklaracja uzupełnia opis, ale nie przestawia kolejności —
      // ta wynika z pierwszego wystąpienia i decyduje o układzie osi.
      const existing = declared.get(id);
      if (existing) Object.assign(existing, entry);
      else { declared.set(id, entry); script.participants.push(entry); }
      continue;
    }

    if (BLOCK_END.test(trimmed) && stack.length) { stack.pop(); continue; }

    const section = SECTION.exec(trimmed);
    if (section && stack.length) {
      const open = stack[stack.length - 1];
      open.sections.push({ ...(section[2].trim() ? { title: section[2].trim() } : {}), steps: [] });
      continue;
    }

    const blockOpen = BLOCK_OPEN.exec(trimmed);
    if (blockOpen) {
      const block: SequenceBlock = {
        kind: 'block',
        block: blockOpen[1].toLowerCase() as SequenceBlockKind,
        ...(blockOpen[2].trim() ? { title: blockOpen[2].trim() } : {}),
        sections: [{ ...(blockOpen[2].trim() ? { title: blockOpen[2].trim() } : {}), steps: [] }],
      };
      push(block);
      stack.push(block);
      continue;
    }

    const note = NOTE.exec(trimmed);
    if (note) {
      push({
        kind: 'note',
        placement: note[1].toLowerCase() as 'left of' | 'right of' | 'over',
        targets: note[2].split(',').map((t) => t.trim()).filter(Boolean),
        text: note[3].trim(),
      });
      continue;
    }

    const activation = ACTIVATION.exec(trimmed);
    if (activation) {
      push({ kind: activation[1].toLowerCase() as 'activate' | 'deactivate', participant: activation[2] });
      continue;
    }

    const message = MESSAGE.exec(trimmed);
    if (message?.groups) {
      const g = message.groups;
      push({
        kind: 'message',
        from: g.from,
        to: g.to,
        arrow: arrowOf(g.op),
        text: g.text?.trim() ?? '',
        ...(g.flag === '+' ? { activate: true } : {}),
        ...(g.flag === '-' ? { deactivate: true } : {}),
      });
      continue;
    }

    // Linia niezrozumiana zostaje krokiem w tym samym miejscu przebiegu.
    push({ kind: 'raw', text: trimmed });
  }

  // Uczestnicy wspomniani, ale niezadeklarowani — kolejność wystąpienia.
  for (const id of participantsUsed(script)) {
    if (!declared.has(id)) {
      const entry: SequenceParticipant = { id, label: '' };
      declared.set(id, entry);
      script.participants.push(entry);
    }
  }

  doc.sequence = script;
  return { document: doc, issues };
}

export function serializeSequenceDiagram(doc: DiagramDocument): string {
  const script = doc.sequence ?? emptySequence();
  const out: string[] = ['sequenceDiagram'];
  if (script.autonumber) {
    const start = script.autonumberStart;
    const step = script.autonumberStep;
    out.push(`    autonumber${start !== undefined ? ` ${start}` : ''}${step !== undefined ? ` ${step}` : ''}`);
  }

  for (const participant of script.participants) {
    // Uczestnik powołany przez `create` jest deklarowany w miejscu powstania —
    // powtórzenie go tutaj dałoby dwie deklaracje tego samego bytu.
    if (participant.createdInline) continue;
    // Uczestnika bez opisu i bez roli aktora wypisze i tak pierwsza wiadomość —
    // pusta deklaracja byłaby szumem. Kolejność zachowujemy tylko wtedy, gdy
    // niesie informację (alias, aktor) albo gdy ustawiono ją świadomie.
    const keyword = participant.isActor ? 'actor' : 'participant';
    const alias = participant.label && participant.label !== participant.id
      ? ` as ${participant.label}`
      : '';
    out.push(`    ${keyword} ${participant.id}${alias}`);
  }

  const writeSteps = (steps: SequenceStep[], indent: string) => {
    for (const step of steps) {
      if (step.kind === 'raw') { out.push(`${indent}${step.text}`); continue; }
      if (step.kind === 'note') {
        out.push(`${indent}Note ${step.placement} ${step.targets.join(',')}: ${step.text}`);
        continue;
      }
      if (step.kind === 'activate' || step.kind === 'deactivate') {
        out.push(`${indent}${step.kind} ${step.participant}`);
        continue;
      }
      if (step.kind === 'destroy') { out.push(`${indent}destroy ${step.participant}`); continue; }
      if (step.kind === 'create') {
        const participant = script.participants.find((p) => p.id === step.participant);
        const keyword = participant?.isActor ? 'actor' : 'participant';
        const alias = participant?.label && participant.label !== participant.id
          ? ` as ${participant.label}`
          : '';
        out.push(`${indent}create ${keyword} ${step.participant}${alias}`);
        continue;
      }
      if (step.kind === 'message') {
        const flag = step.activate ? '+' : step.deactivate ? '-' : '';
        const text = step.text ? `: ${step.text}` : ':';
        out.push(`${indent}${step.from}${opOf(step.arrow)}${flag}${step.to}${text}`);
        continue;
      }

      if (!isBlock(step)) continue;
      // Blok: nagłówek, sekcje rozdzielone słowem właściwym dla rodzaju, `end`.
      const separator = step.block === 'alt' ? 'else' : step.block === 'par' ? 'and' : 'option';
      out.push(`${indent}${step.block}${step.title ? ` ${step.title}` : ''}`);
      step.sections.forEach((section, index) => {
        if (index > 0) out.push(`${indent}${separator}${section.title ? ` ${section.title}` : ''}`);
        writeSteps(section.steps, `${indent}    `);
      });
      out.push(`${indent}end`);
    }
  };

  writeSteps(script.steps, '    ');
  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
