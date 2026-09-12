/**
 * callout.ts — blok wyróżnienia (Notion „callout") i jego zapis w markdownie.
 *
 * Zapisujemy go jako **alert w stylu GitHuba**:
 *
 *     > [!NOTE]
 *     > treść
 *
 * a nie jako własny znacznik czy HTML, bo dzięki temu plik pozostaje czytelny
 * w surowym markdownie, poprawnie renderuje się na GitHubie i w Obsidianie, a
 * edytory bez wsparcia dla callouta pokażą zwykły cytat zamiast śmieci.
 */

export type CalloutVariant = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export interface CalloutStyle {
  label: string;
  /** Kolor obwódki, ikony i paska — tło pochodzi z niego z przezroczystością. */
  color: string;
  /** Znak pokazywany w podglądzie i w edytorach bez ikon MUI. */
  emoji: string;
}

/** Pięć typów zgodnych z alertami GitHuba — ten sam zestaw, te same nazwy. */
export const CALLOUT_VARIANTS: Record<CalloutVariant, CalloutStyle> = {
  note:      { label: 'Notatka',  color: '#0969da', emoji: 'ℹ️' },
  tip:       { label: 'Wskazówka', color: '#1a7f37', emoji: '💡' },
  important: { label: 'Ważne',    color: '#8250df', emoji: '❗' },
  warning:   { label: 'Uwaga',    color: '#9a6700', emoji: '⚠️' },
  caution:   { label: 'Ostrzeżenie', color: '#cf222e', emoji: '🛑' },
};

export function isCalloutVariant(value: string): value is CalloutVariant {
  return Object.prototype.hasOwnProperty.call(CALLOUT_VARIANTS, value.toLowerCase());
}

/** Czyta `[!NOTE]` z pierwszej linii cytatu; `null` dla zwykłego cytatu. */
export function parseCalloutMarker(firstLine: string): CalloutVariant | null {
  const m = /^\s*\[!([A-Za-z]+)\]/.exec(firstLine);
  if (!m) return null;
  const key = m[1].toLowerCase();
  return isCalloutVariant(key) ? key : null;
}

/** Składa blok markdown: znacznik typu + treść z prefiksem cytatu. */
export function calloutToMarkdown(variant: CalloutVariant, body: string): string {
  const head = `> [!${variant.toUpperCase()}]`;
  const trimmed = body.replace(/\s+$/, '');
  if (!trimmed.trim()) return head;
  // Puste linie zapisujemy jako samo `>`; bez tego cytat urywa się w miejscu
  // przerwy i druga połowa callouta wypada poza blok.
  const lines = trimmed.split('\n').map((l) => (l.trim() ? `> ${l}` : '>'));
  return [head, ...lines].join('\n');
}

export interface ExtractedCallout {
  variant: CalloutVariant;
  /** Treść bez prefiksów `> `, gotowa do konwersji na HTML. */
  body: string;
}

export interface ExtractCalloutsResult {
  /** Markdown z calloutami zastąpionymi znacznikami `%%CALLOUT{n}%%`. */
  result: string;
  callouts: ExtractedCallout[];
}

/**
 * Wyjmuje callouty z markdownu przed konwersją na HTML.
 *
 * Robimy to przed showdownem, bo ten zamieniłby blok w zwykły `<blockquote>` i
 * informacja o typie by przepadła. W miejsce callouta wchodzi znacznik, który
 * konwerter podmienia na `<div data-callout>` z treścią już przetworzoną.
 */
export function extractCallouts(markdown: string): ExtractCalloutsResult {
  const callouts: ExtractedCallout[] = [];
  const lines = markdown.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const quoted = /^\s*>\s?(.*)$/.exec(line);
    const variant = quoted ? parseCalloutMarker(quoted[1]) : null;
    if (!quoted || !variant) {
      out.push(line);
      continue;
    }

    // Treść może zaczynać się w tej samej linii co znacznik (GitHub na to pozwala).
    const bodyLines: string[] = [];
    const rest = quoted[1].replace(/^\s*\[![A-Za-z]+\]\s?/, '');
    if (rest.trim()) bodyLines.push(rest);

    while (i + 1 < lines.length) {
      const next = /^\s*>\s?(.*)$/.exec(lines[i + 1]);
      if (!next) break;
      bodyLines.push(next[1]);
      i++;
    }

    callouts.push({ variant, body: bodyLines.join('\n').replace(/\s+$/, '') });
    out.push(`%%CALLOUT${callouts.length - 1}%%`);
  }

  return { result: out.join('\n'), callouts };
}
