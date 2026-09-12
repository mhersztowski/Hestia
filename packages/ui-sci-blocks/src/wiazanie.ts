/**
 * wiazanie.ts — jak blok uruchomienia znajduje swoją matematykę.
 *
 * Konwencje były trzy: `sim` widział wszystkie bloki dokumentu, `field`
 * i `linalg` szukały bloku o dokładnie tym samym identyfikatorze, a `exercise`
 * deklarował wzory przez `@uses`. Trzy sposoby na jedno pojęcie znaczyły, że
 * autor musiał pamiętać, który obowiązuje gdzie — a dowiadywał się o pomyłce
 * dopiero z komunikatu po fakcie.
 *
 * Kanoniczna jest konwencja **identyfikator = identyfikator**: `field:cieplo`
 * szuka `formula:cieplo`. Jest jawna, widoczna w infostringu i nie zależy od
 * tego, co jeszcze stoi w dokumencie. `sim` bez identyfikatora działa dalej po
 * staremu (wszystkie wzory), bo inaczej każdy istniejący dokument wymagałby
 * poprawki — ale `sim:okres` zawęża się do jednego wzoru, tak jak reszta.
 *
 * Drugą połową roboty jest **komunikat**. „Nie ma wzoru X" jest prawdziwe
 * i bezużyteczne: autor patrzy wtedy na blok wzoru i nie widzi w nim nic złego,
 * bo przyczyną jest literówka albo brakująca dyrektywa. Dlatego mówimy, jak
 * blok ma wyglądać, i podpowiadamy najbliższą istniejącą nazwę.
 */

export interface BlokDokumentu {
  language: string;
  code: string;
}

/** Identyfikator bloku wzoru, np. `formula:cieplo` → `cieplo`. */
function idWzoru(language: string): string | undefined {
  return /^formula:([A-Za-z0-9_-]+)$/.exec(language)?.[1];
}

/** Wszystkie identyfikatory wzorów w dokumencie — do podpowiedzi. */
export function idyWzorow(bloki: BlokDokumentu[]): string[] {
  return bloki.map((b) => idWzoru(b.language)).filter((id): id is string => !!id);
}

/**
 * Wzór o zadanym identyfikatorze; `wymaga` zawęża do bloków z daną dyrektywą.
 *
 * Warunek treści jest potrzebny, bo `field:cieplo` ma sens tylko dla wzoru
 * z `@pde` — wzór o tej samej nazwie, ale zwykły, dałby pusty widok bez
 * wyjaśnienia.
 */
export function znajdzWzor(
  bloki: BlokDokumentu[],
  id: string | undefined,
  wymaga?: RegExp,
): BlokDokumentu | undefined {
  if (!id) return undefined;
  return bloki.find((b) => idWzoru(b.language) === id && (!wymaga || wymaga.test(b.code)));
}

/** Odległość edycyjna — na tyle, ile trzeba, żeby wyłapać literówkę. */
function odleglosc(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) d[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[a.length][b.length];
}

/** Najbliższa nazwa, jeśli jest na tyle blisko, że to pewnie literówka. */
function podobny(id: string, dostepne: string[]): string | undefined {
  const prog = Math.max(2, Math.floor(id.length / 3));
  return dostepne
    .map((kandydat) => ({ kandydat, d: odleglosc(id, kandydat) }))
    .filter(({ d }) => d <= prog)
    .sort((x, y) => x.d - y.d)[0]?.kandydat;
}

/**
 * Komunikat o braku wzoru — mówiący, co napisać, a nie tylko czego nie ma.
 */
export function opiszBrakWzoru(
  rodzaj: string,
  id: string,
  dyrektywa: string,
  dostepne: string[] = [],
): string {
  const czesci = [
    `Nie ma wzoru ${rodzaj} „${id}" w tym dokumencie.`,
    `Potrzebny jest blok formula:${id} z dyrektywą ${dyrektywa}.`,
  ];

  const bliski = podobny(id, dostepne);
  if (bliski) czesci.push(`Czy chodziło o „${bliski}"?`);
  else if (dostepne.length > 0 && dostepne.length <= 5) {
    czesci.push(`W dokumencie są: ${dostepne.join(', ')}.`);
  }

  return czesci.join(' ');
}

/**
 * Wzór razem z tymi, od których zależy.
 *
 * Zawężenie `sim:okres` do jednego bloku byłoby regresją: wzór wskazuje przez
 * `@derivedFrom` te, z których wynika, a graf bez nich nie skompiluje się albo
 * — gorzej — skompiluje się z brakującymi wielkościami jako parametrami.
 * Domknięcie liczymy wszerz, bo zależności bywają łańcuchem.
 */
export function zZaleznosciami<T extends { id: string; derivedFrom?: string[] }>(
  wszystkie: T[],
  id: string,
): T[] {
  const poId = new Map(wszystkie.map((f) => [f.id, f]));
  const wybrane = new Set<string>();
  const kolejka = [id];

  while (kolejka.length) {
    const biezacy = kolejka.shift()!;
    if (wybrane.has(biezacy)) continue;
    const wzor = poId.get(biezacy);
    if (!wzor) continue;
    wybrane.add(biezacy);
    kolejka.push(...(wzor.derivedFrom ?? []));
  }

  // Kolejność jak w dokumencie — graf i tak sam sobie ją poukłada, a
  // deterministyczna lista czyta się lepiej przy diagnostyce.
  return wszystkie.filter((f) => wybrane.has(f.id));
}
