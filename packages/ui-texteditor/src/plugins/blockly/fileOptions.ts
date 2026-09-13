/**
 * fileOptions.ts — ustawienia Blockly'ego przypisane do **pliku**.
 *
 * Trzyma dwie rzeczy: z których projektów UML brać bloczki i — opcjonalnie —
 * jakim językiem jest ten plik, gdy rozszerzenie nie mówi prawdy (`.h` bywa
 * czystym C, `.ino` jest C++).
 *
 * ## Dlaczego per plik, a nie globalnie
 *
 * Diagram opisuje bibliotekę, z której **ten** plik korzysta. Jedno wspólne
 * ustawienie znaczyłoby, że otwarcie innego pliku po cichu zmienia paletę
 * bloczków w poprzednim — a zmiana palety unieważnia zapisany warsztat.
 *
 * ## Dlaczego klucz jest normalizowany
 *
 * Ten sam plik ma dwa adresy: zwykłą ścieżkę VFS (zakładka tekstowa) i adres
 * ze schematem wtyczki (`blockly:///…`). Bez sprowadzenia ich do wspólnej
 * postaci okno opcji otwarte z jednej zakładki nie widziałoby ustawień
 * zrobionych w drugiej — a obie pokazują ten sam plik.
 */

import { dialectById, dialectForPath, type LanguageDialect } from './dialects';

export interface BlocklyFileOptions {
    /** Nazwy plików projektów UML (`*.umlproj.json`) wybranych dla tego pliku. */
    projects: string[];
    /** Wymuszony dialekt; brak = rozpoznanie po rozszerzeniu. */
    dialectId?: string;
}

/** Minimalny kształt magazynu wtyczki — tyle, ile naprawdę używamy. */
export interface OptionsStorage {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    delete(key: string): void;
}

export function defaultFileOptions(): BlocklyFileOptions {
    return { projects: [] };
}

/** Ścieżka pliku bez schematu zakładki wtyczki — patrz nagłówek. */
export function fileKey(uri: string): string {
    return `file:${String(uri ?? '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')}`;
}

export function readFileOptions(storage: OptionsStorage, uri: string): BlocklyFileOptions {
    const raw = storage.get<unknown>(fileKey(uri));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultFileOptions();
    const record = raw as Record<string, unknown>;
    // Wpisy odsiewane po typie, bo zapis mógł powstać w innej wersji wtyczki
    // albo zostać ręcznie zepsuty w `localStorage`. Jeden zły element listy nie
    // może odbierać dostępu do pozostałych.
    const projects = Array.isArray(record['projects'])
        ? record['projects'].filter((p): p is string => typeof p === 'string')
        : [];
    const dialectId = typeof record['dialectId'] === 'string' ? record['dialectId'] : undefined;
    return { projects, ...(dialectId ? { dialectId } : {}) };
}

export function writeFileOptions(storage: OptionsStorage, uri: string, options: BlocklyFileOptions): void {
    storage.set(fileKey(uri), {
        projects: options.projects,
        ...(options.dialectId ? { dialectId: options.dialectId } : {}),
    });
}

/**
 * Czym jest ten plik: wskazaniem z opcji, a w jego braku — rozszerzeniem.
 *
 * Wskazanie nieznanego języka **nie** unieważnia rozpoznania po rozszerzeniu.
 * Zapis mógł powstać w nowszej wersji wtyczki, a cofnięcie się do rozszerzenia
 * jest lepsze niż odmowa otwarcia pliku, który da się otworzyć.
 */
export function effectiveDialect(uri: string, options: BlocklyFileOptions): LanguageDialect | undefined {
    const forced = options.dialectId ? dialectById(options.dialectId) : undefined;
    return forced ?? dialectForPath(uri);
}
