/**
 * umlProjectSource.ts — skąd wtyczka bierze diagramy UML.
 *
 * ## Dlaczego to jest wstrzykiwane, a nie wbudowane
 *
 * `packages/texteditor` jest osadzany w kilku aplikacjach: w Drive MyCastle,
 * w samodzielnym edytorze Monaco i w cad-app. Tylko pierwsza z nich ma stronę
 * Programming/UML i katalog `drive/uml`. Gdyby wtyczka sięgała tam wprost,
 * pozostałe hosty ciągnęłyby za sobą zależność od backendu, którego nie mają —
 * a użytkownik dostawałby pustą listę projektów bez wyjaśnienia.
 *
 * Dlatego źródło jest **argumentem**: host podaje obiekt albo nie podaje nic.
 * Brak źródła jest stanem normalnym, nie awarią — edytor bloczkowy działa
 * wtedy na samych bloczkach standardowych, a okno opcji mówi wprost, czego
 * brakuje.
 */

import { extractCallables, type UmlCallable, type UmlProjectLike } from '../umlCallables';

/** Projekt UML na liście wyboru. */
export interface UmlProjectRef {
    /**
     * Identyfikator zapisywany w ustawieniach pliku.
     *
     * Musi być stabilny między sesjami: zapisany wybór odwołuje się do niego
     * po nazwie, więc identyfikator liczony z pozycji na liście unieważniałby
     * konfigurację przy każdym dodaniu projektu.
     */
    id: string;
    /** Nazwa pokazywana użytkownikowi. */
    label: string;
}

export interface UmlProjectSource {
    /** Krótki opis źródła do nagłówka okna opcji (np. „ten serwer, użytkownik marcin"). */
    describe?(): string;
    /** Lista dostępnych projektów. Może rzucić — komunikat trafia do okna opcji. */
    list(): Promise<UmlProjectRef[]>;
    /** Treść projektu; `null`, gdy pliku nie da się odczytać. */
    load(id: string): Promise<UmlProjectLike | null>;
}

/**
 * Funkcje z wybranych projektów, gotowe do zamiany na bloczki.
 *
 * Odporność na błędy jest tu celowa i asymetryczna: **jeden** zepsuty albo
 * niedostępny projekt nie może odciąć bloczków ze wszystkich pozostałych.
 * Awaria całego źródła (brak sieci, zły token) wychodzi na jaw przy listowaniu,
 * czyli w oknie opcji, gdzie użytkownik może na nią zareagować.
 */
export async function loadCallables(
    source: UmlProjectSource | undefined,
    projectIds: readonly string[],
): Promise<UmlCallable[]> {
    if (!source || projectIds.length === 0) return [];

    const out: UmlCallable[] = [];
    const seen = new Set<string>();
    for (const id of projectIds) {
        let project: UmlProjectLike | null = null;
        try {
            project = await source.load(id);
        } catch {
            continue;   // patrz komentarz wyżej
        }
        if (!project) continue;
        for (const callable of extractCallables(project, id)) {
            // Klucz bez identyfikatora projektu: ten sam diagram bywa kopiowany
            // między projektami, a dwa bloczki o tej samej nazwie nie niosą
            // dodatkowej informacji — zaśmiecają tylko przybornik.
            const key = `${callable.owner}::${callable.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(callable);
        }
    }
    return out;
}

/** Opis źródła do nagłówka okna opcji. */
export function describeSource(source: UmlProjectSource | undefined): string {
    if (!source) {
        return 'Źródło projektów UML nie zostało podłączone w tej aplikacji — '
            + 'dostępne są tylko bloczki standardowe.';
    }
    return source.describe?.() ?? 'podłączone źródło projektów UML';
}
