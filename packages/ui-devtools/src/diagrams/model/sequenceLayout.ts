/**
 * sequenceLayout.ts — rozmieszczenie przebiegu na płótnie.
 *
 * Diagram sekwencji układa się inaczej niż graf: uczestnicy stoją w rzędzie, a
 * czas płynie w dół. Nie ma tu więc rang ani porządkowania barycentrycznego —
 * jest jedna oś pionowa, po której kroki idą po kolei, i zagnieżdżone ramki
 * bloków, które muszą objąć swoją zawartość.
 *
 * Wynik jest czystą geometrią (bez DOM-u), więc daje się przetestować co do
 * piksela i użyć zarówno w SVG, jak i przy eksporcie.
 */
import {
  isBlock, participantsInSteps,
  type SequenceBlockKind, type SequenceScript, type SequenceStep, type StepPath,
} from './sequence';

export interface SequenceLayoutOptions {
  /** Odstęp między osiami uczestników. */
  columnGap?: number;
  /** Odstęp pionowy między kolejnymi krokami. */
  rowGap?: number;
  /** Szerokość nagłówka uczestnika. */
  headWidth?: number;
}

export interface LaidOutParticipant {
  id: string;
  label: string;
  isActor: boolean;
  /** Środek osi uczestnika. */
  x: number;
  /**
   * Wysokość, na której uczestnik powstaje (`create`).
   *
   * Brak = istnieje od początku, więc nagłówek stoi u góry. Z wartością
   * pudełko rysuje się dopiero tutaj, a linia życia zaczyna się pod nim.
   */
  spawnY?: number;
  /** Wysokość `destroy` — tam linia życia się kończy krzyżykiem. */
  destroyY?: number;
}

export interface LaidOutMessage {
  path: StepPath;
  from: string;
  to: string;
  fromX: number;
  toX: number;
  y: number;
  text: string;
  arrow: string;
  /** Numer nadany przez `autonumber`. */
  number?: number;
  /** Wiadomość do samego siebie rysuje się pętelką. */
  selfCall: boolean;
}

export interface LaidOutNote {
  path: StepPath;
  x: number;
  y: number;
  width: number;
  text: string;
}

export interface LaidOutBlock {
  path: StepPath;
  block: SequenceBlockKind;
  title?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pionowe położenia linii rozdzielających sekcje (`else`, `and`). */
  dividers: Array<{ y: number; title?: string }>;
}

/** Pasek aktywności uczestnika — od `activate` do `deactivate`. */
export interface LaidOutActivation {
  participant: string;
  x: number;
  top: number;
  bottom: number;
}

export interface SequenceLayout {
  participants: LaidOutParticipant[];
  messages: LaidOutMessage[];
  notes: LaidOutNote[];
  blocks: LaidOutBlock[];
  activations: LaidOutActivation[];
  width: number;
  height: number;
  /** Wysokość pasa nagłówków — poniżej zaczynają się linie życia. */
  headHeight: number;
  /**
   * Górna krawędź powtórzonych nagłówków na dole.
   *
   * Mermaid powtarza uczestników pod przebiegiem — przy długim diagramie bez
   * tego trzeba by przewijać w górę, żeby sprawdzić, czyja to linia życia.
   */
  footerY: number;
}

const HEAD_TOP = 12;
const HEAD_HEIGHT = 40;
const FIRST_ROW = HEAD_TOP + HEAD_HEIGHT + 34;
const BLOCK_PADDING_X = 16;
const BLOCK_HEADER = 22;
const SELF_CALL_HEIGHT = 26;
const NOTE_WIDTH = 160;
/** Ile notatka `over` wystaje poza skrajne osie, na które jest rozpięta. */
const NOTE_PAD = 34;
/** Odstęp między ostatnim krokiem a powtórzonymi nagłówkami. */
const FOOTER_GAP = 24;
/** Ile ramka bloku wystaje poza skrajne osie, których dotyczy. */
const BLOCK_SPAN_PAD = 44;
/** O ile zagnieżdżona ramka jest ciaśniejsza od nadrzędnej. */
const BLOCK_NEST = 12;

/**
 * Czy przypiąć nagłówki uczestników u góry kadru.
 *
 * Przy długim przebiegu oba pasy nagłówków (górny i stopka) wypadają poza
 * widok i nie widać, czyja jest która linia życia. Przypinamy je dopiero
 * wtedy — gdy którykolwiek jest widoczny, powielanie byłoby szumem.
 */
export function shouldPinHeads(
  layout: Pick<SequenceLayout, 'headHeight' | 'footerY'>,
  scrollTop: number,
  viewportHeight: number,
): boolean {
  const topVisible = scrollTop < layout.headHeight;
  const footerVisible = scrollTop + viewportHeight > layout.footerY;
  return !topVisible && !footerVisible;
}

export function layoutSequence(script: SequenceScript, options: SequenceLayoutOptions = {}): SequenceLayout {
  const { columnGap = 160, rowGap = 44, headWidth = 120 } = options;

  const participants: LaidOutParticipant[] = script.participants.map((p, index) => ({
    id: p.id,
    label: p.label || p.id,
    isActor: !!p.isActor,
    x: headWidth / 2 + index * columnGap,
  }));
  const byId = new Map(participants.map((p) => [p.id, p]));
  const xOf = (id: string) => participants.find((p) => p.id === id)?.x ?? headWidth / 2;
  /** Skrajna prawa oś — do niej sięgają ramki bloków. */
  const lastX = participants.length ? participants[participants.length - 1].x : headWidth / 2;

  const messages: LaidOutMessage[] = [];
  const notes: LaidOutNote[] = [];
  const blocks: LaidOutBlock[] = [];
  const activations: LaidOutActivation[] = [];
  /** Otwarte aktywacje — `deactivate` domyka najpóźniej otwartą. */
  const open = new Map<string, number[]>();

  let y = FIRST_ROW;
  // `autonumber 10 10` — numer początkowy i krok; domyślnie 1 i 1.
  let counter = script.autonumberStart ?? 1;
  const counterStep = script.autonumberStep ?? 1;

  const openActivation = (participant: string, at: number) => {
    const stack = open.get(participant) ?? [];
    stack.push(at);
    open.set(participant, stack);
  };
  const closeActivation = (participant: string, at: number) => {
    const stack = open.get(participant);
    const top = stack?.pop();
    if (top === undefined) return;
    activations.push({ participant, x: xOf(participant), top, bottom: at });
  };

  const walk = (steps: SequenceStep[], path: StepPath, depth: number) => {
    steps.forEach((step, index) => {
      const stepPath = [...path, index];

      if (step.kind === 'message') {
        const selfCall = step.from === step.to;
        if (step.activate) openActivation(step.to, y);
        messages.push({
          path: stepPath,
          from: step.from,
          to: step.to,
          fromX: xOf(step.from),
          toX: xOf(step.to),
          y,
          text: step.text,
          arrow: step.arrow,
          ...(script.autonumber ? { number: counter } : {}),
          selfCall,
        });
        if (script.autonumber) counter += counterStep;
        if (step.deactivate) closeActivation(step.from, y);
        y += selfCall ? rowGap + SELF_CALL_HEIGHT : rowGap;
        return;
      }

      if (step.kind === 'activate') { openActivation(step.participant, y); return; }
      if (step.kind === 'deactivate') { closeActivation(step.participant, y); return; }

      if (step.kind === 'create') {
        // Pudełko powstaje w tym miejscu, więc kolejny krok musi zaczynać się
        // pod nim — inaczej pierwsza wiadomość przecięłaby nagłówek.
        const participant = byId.get(step.participant);
        if (participant) participant.spawnY = y - 12;
        y += HEAD_HEIGHT;
        return;
      }
      if (step.kind === 'destroy') {
        const participant = byId.get(step.participant);
        if (participant) participant.destroyY = y;
        return;
      }

      if (step.kind === 'note') {
        const xs = step.targets.map(xOf);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        // `over` na dwóch uczestnikach rozpina się dokładnie między ich osiami
        // (plus margines). Stała szerokość wychodziła poza krawędź diagramu i
        // sugerowała, że notatka dotyczy także sąsiadów.
        const spanning = step.placement === 'over' && xs.length > 1;
        const width = spanning ? right - left + NOTE_PAD * 2 : NOTE_WIDTH;
        const x = step.placement === 'left of' ? Math.max(left - width - 12, 0)
          : step.placement === 'right of' ? left + 12
            : spanning ? Math.max(left - NOTE_PAD, 0)
              : left - NOTE_WIDTH / 2;
        notes.push({ path: stepPath, x, y: y - 14, width, text: step.text });
        y += rowGap;
        return;
      }

      if (step.kind === 'raw' || !isBlock(step)) return;

      // Blok: ramka musi objąć zawartość, więc jej wysokość znamy dopiero po
      // ułożeniu środka. Rezerwujemy miejsce na nagłówek i wracamy po wymiary.
      const top = y - 18;
      y += BLOCK_HEADER;
      const dividers: Array<{ y: number; title?: string }> = [];
      step.sections.forEach((section, sectionIndex) => {
        if (sectionIndex > 0) {
          dividers.push({ y: y - 12, ...(section.title ? { title: section.title } : {}) });
          // Etykieta sekcji stoi POD linią (jak tytuł bloku pod jego górną
          // krawędzią), więc potrzebuje własnego wiersza.
          y += 20;
        }
        walk(section.steps, [...stepPath, sectionIndex], depth + 1);
      });
      y += 10;

      // Ramka obejmuje uczestników, których blok FAKTYCZNIE dotyczy — nie
      // wszystkich na diagramie. `break` rozmawiający z dwoma osobami nie ma po
      // co sięgać do skrajnej osi; Mermaid liczy to tak samo.
      const used = participantsInSteps(step.sections.flatMap((section) => section.steps))
        .map(xOf)
        .filter((value) => Number.isFinite(value));
      const nest = depth * BLOCK_NEST;
      const left = used.length ? Math.min(...used) - BLOCK_SPAN_PAD + nest : BLOCK_PADDING_X + nest;
      const right = used.length
        ? Math.max(Math.max(...used) + BLOCK_SPAN_PAD - nest, left + 160)
        : Math.max(lastX + BLOCK_PADDING_X, left + 200);
      blocks.push({
        path: stepPath,
        block: step.block,
        ...(step.title ? { title: step.title } : {}),
        x: left,
        y: top,
        width: right - left,
        height: y - top,
        dividers,
      });
      // Odstęp za ramką: bez niego linia sekcji bloku nadrzędnego (`else`)
      // wypadała dokładnie na dolnej krawędzi zamkniętego bloku.
      y += 22;
    });
  };

  walk(script.steps, [], 0);

  // Aktywacje bez `deactivate` ciągną się do końca przebiegu.
  for (const [participant, stack] of open) {
    for (const top of stack) activations.push({ participant, x: xOf(participant), top, bottom: y });
  }

  const footerY = Math.max(y + FOOTER_GAP, FIRST_ROW + FOOTER_GAP);

  return {
    participants,
    messages,
    notes,
    blocks,
    activations,
    width: Math.max(participants.length * columnGap + headWidth / 2, 320),
    // Wysokość musi objąć powtórzone nagłówki — inaczej zostałyby ucięte.
    height: footerY + HEAD_HEIGHT + HEAD_TOP,
    headHeight: HEAD_TOP + HEAD_HEIGHT,
    footerY,
  };
}
