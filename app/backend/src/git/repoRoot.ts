/**
 * Szukanie korzenia repozytorium — z twardą granicą na katalogu drive.
 *
 * Panel kontroli źródeł ma działać w **każdym** katalogu, który leży wewnątrz
 * repozytorium, tak jak w VS Code: otwierasz plik gdziekolwiek w drzewie i
 * widzisz zmiany tego repozytorium. Sam git robi dokładnie to samo (`rev-parse
 * --show-toplevel` wspina się w górę), ale bez ograniczenia — a `data/` leży
 * wewnątrz repozytorium MyCastle, więc wspinaczka bez granicy kończyła się
 * panelem pokazującym 134 pliki monorepo, gotowe do zacommitowania z Drive.
 *
 * Dlatego szukamy sami i zatrzymujemy się na korzeniu drive użytkownika.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Korzeń repozytorium zawierającego `startDir`, nie wyżej niż `driveRoot`.
 *
 * `istnieje` jest wstrzykiwane, żeby regułę dało się sprawdzić testem bez
 * zakładania katalogów. Sprawdzamy samo istnienie wpisu `.git`, a nie to, czy
 * jest katalogiem: w worktree i w podmodule `.git` jest **plikiem** ze
 * wskazaniem na prawdziwy katalog gita.
 */
export function znajdzKorzenRepo(
    startDir: string,
    driveRoot: string,
    istnieje: (p: string) => boolean = (p) => fs.existsSync(p),
): string | null {
    const korzen = path.resolve(driveRoot);
    let biezacy = path.resolve(startDir);
    if (biezacy !== korzen && !biezacy.startsWith(korzen + path.sep)) return null;

    for (;;) {
        if (istnieje(path.join(biezacy, '.git'))) return biezacy;
        if (biezacy === korzen) return null;
        const wyzej = path.dirname(biezacy);
        // Zabezpieczenie przed pętlą, gdyby `dirname` przestał się skracać
        // (korzeń systemu plików) — do `driveRoot` i tak byśmy nie dotarli.
        if (wyzej === biezacy) return null;
        biezacy = wyzej;
    }
}

/**
 * Gdzie może leżeć `.repo.json` opisujący dane repozytorium.
 *
 * Marker trzyma URL i klucz tokena, więc `pull`/`push` z podkatalogu repozytorium
 * mają szansę działać tak samo jak z jego korzenia — ale tylko wtedy, gdy uda się
 * ten marker odnaleźć. Kandydaci są dwaj, bo tyle znaczeń ma nazwa pliku:
 * `.repo.json` w samym korzeniu i `{nazwa}.repo.json` obok, w katalogu wyżej.
 * Repozytorium założone spoza Drive nie ma żadnego z nich i to jest w porządku —
 * wtedy zdalne operacje idą przez `remote` zapisany w samym repozytorium.
 */
export function sciezkiMarkera(repoDir: string): string[] {
    const katalog = path.resolve(repoDir);
    const nazwa = path.basename(katalog);
    return [
        path.join(katalog, '.repo.json'),
        path.join(path.dirname(katalog), `${nazwa}.repo.json`),
    ];
}
