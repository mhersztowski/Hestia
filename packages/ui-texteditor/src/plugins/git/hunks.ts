/**
 * hunks.ts — różnica podzielona na fragmenty i przepisana na łatkę.
 *
 * To jest fundament trzech rzeczy naraz: przygotowania **części** pliku do
 * commita, cofnięcia pojedynczej zmiany i pokazania, gdzie właściwie ta zmiana
 * jest. Wszystkie trzy sprowadzają się do jednego pytania — które wiersze
 * należą do jednej spójnej poprawki.
 *
 * ## Dlaczego łatka, a nie „zapisz wybrane wiersze"
 *
 * Git przyjmuje zmiany indeksu wyłącznie jako łatkę (`git apply --cached`).
 * Można by zamiast tego złożyć nową treść pliku i ją zapisać — ale wtedy
 * przygotowanie połowy zmian nadpisywałoby drugą połowę w katalogu roboczym.
 * Łatka dotyka tylko tego, co w niej jest.
 *
 * ## Format ma znaczenie co do znaku
 *
 * `git apply` odrzuca łatkę, w której liczby w nagłówku fragmentu nie zgadzają
 * się z treścią — i robi to słusznie, bo przyjęcie takiej łatki cicho zepsułoby
 * plik. Dlatego liczby liczymy z rzeczywistych wierszy, a nie szacujemy.
 */

/** Jeden wiersz różnicy. */
export interface DiffLine {
  op: ' ' | '+' | '-';
  text: string;
}

/** Spójny fragment zmian razem z otaczającym kontekstem. */
export interface Hunk {
  /** Numer pierwszego wiersza w wersji „przed" (liczony od 1). */
  oldStart: number;
  oldLines: number;
  /** Numer pierwszego wiersza w wersji „po". */
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  /** Zakres w bieżącej treści — po nim edytor wie, gdzie postawić przycisk. */
  newRange: { from: number; to: number };
}

/**
 * Wiersze tekstu, bez pustego ogona po końcowym znaku nowej linii.
 *
 * Plik zakończony `\n` ma tyle wierszy, ile ich widać — `split` daje po nim
 * dodatkowy pusty element, który nie jest wierszem. Policzony jako wiersz
 * zawyża liczby w nagłówku łatki i git odrzuca ją jako niepasującą. To wychodzi
 * dopiero na prawdziwych plikach, bo prawie każdy kończy się nową linią,
 * a teksty pisane w teście zwykle nie.
 */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const wiersze = text.split('\n');
  if (wiersze[wiersze.length - 1] === '') wiersze.pop();
  return wiersze;
}

/** Czy tekst kończy się znakiem nowej linii — decyduje o adnotacji w łatce. */
export function endsWithNewline(text: string): boolean {
  return text === '' || text.endsWith('\n');
}

/**
 * Różnica wiersz po wierszu metodą najdłuższego wspólnego podciągu.
 *
 * Kwadratowa pamięć jest tu do przyjęcia, bo porównujemy jeden plik ze sobą
 * samym sprzed zmian — a plik, który by tego nie zniósł, i tak nie nadaje się
 * do przeglądania w edytorze. Powyżej granicy zwracamy różnicę „całość za
 * całość": lepsza szczera zgrubna odpowiedź niż zawieszona karta.
 */
export function diffLines(przed: string, po: string, maxLines = 20_000): DiffLine[] {
  const a = splitLines(przed);
  const b = splitLines(po);

  if (a.length * b.length > maxLines * maxLines) {
    return [
      ...a.map((text): DiffLine => ({ op: '-', text })),
      ...b.map((text): DiffLine => ({ op: '+', text })),
    ];
  }

  const m = a.length;
  const n = b.length;
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const wynik: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      wynik.push({ op: ' ', text: a[i] });
      i++;
      j++;
    }
    // Przy remisie wybieramy usunięcie przed dodaniem — dzięki temu zmiana
    // wiersza wychodzi jako para „−" i „+" obok siebie, a nie rozdzielona
    // kontekstem, co czyta się jak dwie osobne zmiany.
    else if (dp[i + 1][j] >= dp[i][j + 1]) {
      wynik.push({ op: '-', text: a[i++] });
    } else {
      wynik.push({ op: '+', text: b[j++] });
    }
  }
  while (i < m) wynik.push({ op: '-', text: a[i++] });
  while (j < n) wynik.push({ op: '+', text: b[j++] });
  return wynik;
}

/**
 * Grupuje różnicę we fragmenty z kontekstem.
 *
 * Fragmenty oddalone od siebie o mniej niż dwa razy kontekst **scalamy w jeden**:
 * inaczej ten sam wiersz kontekstu należałby do dwóch łatek, a przygotowanie
 * pierwszej przesunęłoby wiersze drugiej i git odrzuciłby ją jako niepasującą.
 */
export function toHunks(diff: readonly DiffLine[], context = 3): Hunk[] {
  const indeksyZmian = diff.map((l, i) => (l.op === ' ' ? -1 : i)).filter((i) => i >= 0);
  if (indeksyZmian.length === 0) return [];

  const grupy: Array<{ od: number; do: number }> = [];
  let od = indeksyZmian[0];
  let doIndeksu = indeksyZmian[0];
  for (const i of indeksyZmian.slice(1)) {
    // Liczy się liczba wierszy MIĘDZY zmianami, a nie odległość indeksów.
    // Przy porównaniu wprost dwie sąsiadujące zmiany (usunięcie i dodanie
    // tego samego wiersza) rozpadały się na dwa fragmenty, choć nie ma
    // między nimi ani jednego wiersza kontekstu do rozdzielenia.
    if (i - doIndeksu - 1 <= context * 2) {
      doIndeksu = i;
      continue;
    }
    grupy.push({ od, do: doIndeksu });
    od = i;
    doIndeksu = i;
  }
  grupy.push({ od, do: doIndeksu });

  const hunki: Hunk[] = [];
  for (const grupa of grupy) {
    const start = Math.max(0, grupa.od - context);
    const koniec = Math.min(diff.length - 1, grupa.do + context);

    // Numery wierszy liczymy przechodząc po całej różnicy od początku:
    // każde „−" zużywa wiersz wersji przed, każde „+" wersji po.
    let stary = 1;
    let nowy = 1;
    for (let i = 0; i < start; i++) {
      if (diff[i].op !== '+') stary++;
      if (diff[i].op !== '-') nowy++;
    }

    const lines = diff.slice(start, koniec + 1);
    const oldLines = lines.filter((l) => l.op !== '+').length;
    const newLines = lines.filter((l) => l.op !== '-').length;

    // Zakres w bieżącej treści — bez wierszy usuniętych, bo tych w niej nie ma.
    let pierwszyNowy = nowy;
    let licznik = nowy;
    let doNowy = nowy;
    for (const l of lines) {
      if (l.op === '-') continue;
      doNowy = licznik;
      licznik++;
    }
    if (newLines === 0) pierwszyNowy = Math.max(1, nowy - 1);

    hunki.push({
      oldStart: oldLines === 0 ? Math.max(0, stary - 1) : stary,
      oldLines,
      newStart: newLines === 0 ? Math.max(0, nowy - 1) : nowy,
      newLines,
      lines,
      newRange: { from: pierwszyNowy, to: Math.max(pierwszyNowy, doNowy) },
    });
  }
  return hunki;
}

/**
 * Składa łatkę w formacie zunifikowanym, gotową dla `git apply`.
 *
 * Ścieżka pojawia się dwa razy z przedrostkami `a/` i `b/` — tego oczekuje git
 * i po tym rozpoznaje, którego pliku dotyczy łatka. Brak znaku nowej linii na
 * końcu pliku wymaga osobnej adnotacji, bo inaczej git dopisze go po cichu.
 */
export function formatPatch(
  path: string,
  hunki: readonly Hunk[],
  opts: {
    oldEndsWithNewline?: boolean;
    newEndsWithNewline?: boolean;
    totalOldLines?: number;
    totalNewLines?: number;
  } = {}
): string {
  if (hunki.length === 0) return '';
  const wiersze: string[] = [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
  for (const h of hunki) {
    wiersze.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    const ostatniIndeks = h.lines.length - 1;
    h.lines.forEach((l, i) => {
      wiersze.push(`${l.op}${l.text}`);
      // Adnotacja idzie zaraz za wierszem, którego dotyczy, i tylko wtedy,
      // gdy ten wiersz jest ostatni w pliku po swojej stronie. Postawiona
      // na końcu całej łatki opisywałaby cudzy wiersz — a git czyta ją
      // dosłownie i po cichu dopisałby albo usunął znak końca.
      if (i !== ostatniIndeks) return;
      const koniecStarego =
        l.op !== '+' &&
        opts.totalOldLines !== undefined &&
        h.oldStart + h.oldLines - 1 >= opts.totalOldLines &&
        opts.oldEndsWithNewline === false;
      const koniecNowego =
        l.op !== '-' &&
        opts.totalNewLines !== undefined &&
        h.newStart + h.newLines - 1 >= opts.totalNewLines &&
        opts.newEndsWithNewline === false;
      if (koniecStarego || koniecNowego) wiersze.push('\\ No newline at end of file');
    });
  }
  return `${wiersze.join('\n')}\n`;
}

/**
 * Odwraca fragment — łatka cofająca zamiast wprowadzającej.
 *
 * Używane przy „cofnij tę zmianę": zamiana `+` z `−` i liczb miejscami daje
 * łatkę, która przywraca stan sprzed. Liczenie tego drugi raz z pierwotnych
 * treści dałoby ten sam wynik dłuższą drogą i z ryzykiem rozjazdu.
 */
export function reverseHunk(h: Hunk): Hunk {
  const lines = h.lines.map((l): DiffLine => ({
    op: l.op === '+' ? '-' : l.op === '-' ? '+' : ' ',
    text: l.text,
  }));
  return {
    oldStart: h.newStart,
    oldLines: h.newLines,
    newStart: h.oldStart,
    newLines: h.oldLines,
    lines,
    newRange: h.newRange,
  };
}

/** Krótki opis fragmentu do podpowiedzi: ile dodano, ile usunięto. */
export function describeHunk(h: Hunk): string {
  const dodane = h.lines.filter((l) => l.op === '+').length;
  const usuniete = h.lines.filter((l) => l.op === '-').length;
  const czesci: string[] = [];
  if (dodane) czesci.push(`+${dodane}`);
  if (usuniete) czesci.push(`−${usuniete}`);
  return czesci.join(' ') || 'bez zmian';
}
