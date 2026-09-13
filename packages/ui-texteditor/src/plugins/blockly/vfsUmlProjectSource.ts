/**
 * vfsUmlProjectSource.ts — gotowe źródło projektów UML dla hostów MyCastle.
 *
 * Czyta katalog `drive/uml` przez VFS backendu, korzystając z tej samej
 * konfiguracji („ten serwer" albo wskazany zdalny), którą ustawia się dla
 * MinisLib Graph. Dzięki temu obie wtyczki widzą te same projekty i nie ma
 * dwóch miejsc, w których podaje się adres serwera.
 *
 * Host, który tego nie chce — bo nie ma backendu MyCastle — po prostu tego
 * nie przekazuje. Wtedy okno opcji mówi wprost, że źródła nie podłączono,
 * a edytor działa na bloczkach standardowych.
 */

import {
    base64ToUtf8, describeUmlSource, filterUmlEntries, readUmlSource, umlEndpoint,
    type UmlSourceConfig,
} from '../umlSource';
import type { UmlProjectLike } from '../umlCallables';
import type { UmlProjectRef, UmlProjectSource } from './umlProjectSource';

export interface VfsUmlSourceOptions {
    /** Konfiguracja źródła; domyślnie ta zapisana przez MinisLib Graph. */
    config?: () => UmlSourceConfig;
}

export function createVfsUmlProjectSource(options: VfsUmlSourceOptions = {}): UmlProjectSource {
    const configOf = options.config ?? readUmlSource;

    return {
        describe: () => describeUmlSource(configOf()),

        async list(): Promise<UmlProjectRef[]> {
            const { url, headers } = umlEndpoint(configOf(), 'readdir');
            const response = await fetch(url, { headers });
            if (!response.ok) {
                // Powód musi dojść do okna opcji: pusta lista bez wyjaśnienia
                // jest nieodróżnialna od „nie ma żadnych projektów".
                const reason = response.status === 401 || response.status === 403
                    ? 'brak dostępu — sprawdź użytkownika i token'
                    : response.status === 404 ? 'katalog drive/uml nie istnieje'
                        : `HTTP ${response.status}`;
                throw new Error(`Nie udało się odczytać listy projektów UML: ${reason}`);
            }
            const { entries } = await response.json() as { entries?: Array<{ name: string; type: number }> };
            return filterUmlEntries(entries).map((name) => ({
                id: name,
                // Sam `.umlproj.json` nic nie wnosi na liście, na której każdy
                // wpis go ma.
                label: name.replace(/\.umlproj\.json$/i, ''),
            }));
        },

        async load(id: string): Promise<UmlProjectLike | null> {
            const { url, headers } = umlEndpoint(configOf(), 'readFile', id);
            const response = await fetch(url, { headers });
            if (!response.ok) return null;
            const { data } = await response.json() as { data: string };
            // `atob` samo zwraca bajty w latin-1 — polskie opisy z TSDoc
            // rozsypałyby się na krzaki w podpowiedziach bloczków.
            return JSON.parse(base64ToUtf8(data)) as UmlProjectLike;
        },
    };
}
