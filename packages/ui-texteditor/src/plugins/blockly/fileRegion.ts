/**
 * fileRegion.ts — miejsce w pliku źródłowym, do którego trafia kod z bloczków.
 *
 * ## Dlaczego nie nadpisujemy całego pliku
 *
 * Plik zwykle zawiera więcej niż to, co ułożono z bloczków: importy, resztę
 * klasy, funkcje pisane ręcznie. Zapis „całą treścią" skasowałby to bez pytania
 * i bez śladu — a zapisany warsztat nie odtworzy tego, czego nigdy w nim nie
 * było. Kod ląduje więc w **oznaczonym obszarze**, a reszta pliku zostaje.
 *
 * ## Dlaczego stan warsztatu też idzie do pliku
 *
 * Z bloczków wychodzi kod, ale z kodu nie wychodzą bloczki. Gdyby układ mieszkał
 * wyłącznie w pamięci przeglądarki, kto otworzyłby plik na innej maszynie —
 * albo po wyczyszczeniu danych witryny — dostałby wygenerowany kod, którego nie
 * da się już edytować bloczkami. Stan jedzie więc razem z kodem, zakodowany
 * base64 w komentarzu.
 *
 * ## Dlaczego znaczniki są w składni języka
 *
 * `//` w Pythonie to dzielenie całkowite, a nie komentarz. Znacznik wpisany
 * na sztywno psułby plik, do którego miał tylko coś dopisać.
 */

import type { LanguageDialect } from './dialects';

const BEGIN = '@blockly-begin';
const END = '@blockly-end';
const STATE = '@blockly-state:';

const NOTE = 'obszar generowany z bloczków — zmiany zrobione tutaj znikną przy następnym zapisie';

export interface BlocklyRegion {
    /** Indeks pierwszego znaku znacznika otwierającego. */
    start: number;
    /** Indeks tuż za znacznikiem zamykającym (wraz z jego znakiem nowej linii). */
    end: number;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function markerRe(dialect: LanguageDialect, marker: string): RegExp {
    return new RegExp(`^[ \\t]*${escapeRe(dialect.comment)}[ \\t]*${escapeRe(marker)}.*$`, 'm');
}

/**
 * Obszar bloczków w pliku albo `null`.
 *
 * Sam znacznik otwierający, bez zamykającego, **nie** tworzy obszaru. Taki plik
 * ktoś ruszał ręcznie, a domyślne „do końca pliku" skasowałoby wszystko, co pod
 * nim napisano.
 */
export function findBlocklyRegion(text: string, dialect: LanguageDialect): BlocklyRegion | null {
    const begin = markerRe(dialect, BEGIN).exec(text);
    if (!begin) return null;
    const rest = text.slice(begin.index);
    const end = markerRe(dialect, END).exec(rest);
    if (!end) return null;
    const endStop = begin.index + end.index + end[0].length;
    // Znak nowej linii po znaczniku należy do obszaru — inaczej każda podmiana
    // zostawiałaby po sobie pustą linię więcej.
    const withNewline = text[endStop] === '\n' ? endStop + 1 : endStop;
    return { start: begin.index, end: withNewline };
}

/** Kodowanie odporne na znaki spoza latin-1 — `btoa` samo się nimi dławi. */
function encodeState(state: object): string {
    const json = JSON.stringify(state);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function decodeState(base64: string): object | null {
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return JSON.parse(new TextDecoder().decode(bytes)) as object;
    } catch {
        // Uszkodzony zapis znaczy „brak układu", a nie awarię: kod w pliku jest
        // dalej poprawny i nie ma powodu odmawiać jego otwarcia.
        return null;
    }
}

/** Stan warsztatu zapisany w pliku albo `null`. */
export function readBlocklyState(text: string, dialect: LanguageDialect): object | null {
    const line = new RegExp(
        `^[ \\t]*${escapeRe(dialect.comment)}[ \\t]*${escapeRe(STATE)}[ \\t]*(\\S+)[ \\t]*$`, 'm',
    ).exec(text);
    return line ? decodeState(line[1]) : null;
}

/**
 * Wstawia kod (i stan warsztatu) do pliku.
 *
 * Obszar istniejący jest **podmieniany w miejscu**; gdy go nie ma, powstaje na
 * końcu pliku. Dopisanie na końcu, a nie na początku, bo importy i nagłówki
 * zwykle są u góry, a wstawienie się między nie zmieniłoby znaczenie pliku.
 */
export function applyBlocklyRegion(
    text: string,
    code: string,
    state: object | null,
    dialect: LanguageDialect,
): string {
    const c = dialect.comment;
    const lines = [
        `${c} ${BEGIN} — ${NOTE}`,
        ...(state ? [`${c} ${STATE} ${encodeState(state)}`] : []),
        ...(code.trim() ? [code.replace(/\n+$/, '')] : []),
        `${c} ${END}`,
        '',
    ];
    const block = lines.join('\n');

    const region = findBlocklyRegion(text, dialect);
    if (region) return text.slice(0, region.start) + block + text.slice(region.end);

    const base = text.length && !text.endsWith('\n') ? `${text}\n` : text;
    return base.length ? `${base}\n${block}` : block;
}
