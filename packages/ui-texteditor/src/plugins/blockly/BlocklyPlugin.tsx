/**
 * BlocklyPlugin — edytor bloczkowy dla pliku otwartego w edytorze.
 *
 * Dla pliku źródłowego w dowolnej zakładce otwiera zakładkę Blockly'ego
 * dobraną do **jego języka** (rozszerzenie → dialekt), a paletę bloczków
 * buduje z diagramu UML wskazanego w oknie „Opcje pliku".
 *
 * ## Trzy rzeczy, które wyglądają na drobiazgi, a nie są
 *
 * **Menu kontekstowe jest zawsze widoczne.** Host nie sprawdza `when` przy
 * pozycjach menu — rejestruje je jako akcje Monaco bez warunku. Pozycja
 * pojawia się więc także nad plikiem `.md`, a rozstrzyga dopiero polecenie.
 * Dlatego odmowa musi **mówić dlaczego**: cichy `return` wygląda identycznie
 * jak zepsuty przycisk.
 *
 * **Otwarcie zakładki jest odroczone o przejście pętli zdarzeń.** Podwójne
 * kliknięcie w eksploratorze obsługuje funkcja asynchroniczna: wczytuje plik,
 * budzi wtyczki, a po powrocie z `await` ustawia aktywną zakładkę na plik
 * tekstowy. Otwarcie synchroniczne przegrywa ten wyścig i użytkownik widzi
 * goły kod zamiast bloczków.
 *
 * **Okno dialogowe ma własny korzeń Reacta.** Host nie ma usługi okien, a
 * „Opcje pliku" wywołuje się z menu kontekstowego, czyli spoza drzewa Reacta
 * jakiegokolwiek panelu. Korzeń montujemy przy aktywacji i sprzątamy przy
 * wyłączeniu wtyczki.
 */

import type { ComponentType } from 'react';
import type { FileSystemProvider } from '@hestia/core';

import type { IDisposable, IPlugin, IPluginAPI } from '../../monaco/plugins/types';
import { dialectForPath, supportedExtensions } from './dialects';
import { effectiveDialect, readFileOptions } from './fileOptions';
import type { UmlProjectSource } from './umlProjectSource';

export const BLOCKLY_PLUGIN_ID = 'com.mycastle.blockly';

/** Schemat zakładki wtyczki — własny, żeby nie kolidować z zakładką tekstową. */
export const BLOCKLY_TAB_SCHEME = 'blockly://';

export interface BlocklyPluginOptions {
    /**
     * Skąd brać diagramy UML. Pomijalne: w aplikacji bez strony Programming/UML
     * edytor działa na samych bloczkach standardowych, a okno opcji mówi wprost,
     * że źródła nie podłączono.
     */
    umlSource?: UmlProjectSource;
    /**
     * System plików, do którego trafia „Zapisz".
     *
     * Bez niego zakładka pokazuje kod i pozwala go skopiować, a przycisk
     * zapisu mówi wprost, czego brakuje — zamiast być przyciskiem, który nic
     * nie robi.
     */
    fileSystem?: FileSystemProvider;
}

const command = (id: string): string => `${BLOCKLY_PLUGIN_ID}:${id}`;

/** Ikona paska — napis SVG, bo nazwy codiconów host rysuje jako tekst (§8). */
const ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">'
    + '<path d="M2 3h5v2h2V3h5v4h-2v2h2v4H9v-2H7v2H2V9h2V7H2V3z"/></svg>';

export function createBlocklyPlugin(options: BlocklyPluginOptions = {}): IPlugin {
    const disposables: IDisposable[] = [];
    let pendingTab: ReturnType<typeof setTimeout> | undefined;
    let unmountDialog: (() => void) | undefined;
    let activeFile: string | undefined;
    let api: IPluginAPI | undefined;

    /**
     * Plik, dla którego mają zadziałać polecenia, wraz z jego dialektem.
     *
     * Zwraca `undefined` **i wyjaśnia powód**, bo obie odmowy — brak pliku
     * i nieobsługiwany typ — wyglądają dla użytkownika tak samo: nic się nie
     * dzieje po kliknięciu w menu.
     */
    const targetOrExplain = (): { file: string; label: string } | undefined => {
        if (!activeFile) {
            api?.logger.warn('Blockly: nie ma otwartego pliku, dla którego można otworzyć edytor bloczkowy.');
            return undefined;
        }
        const options_ = api ? readFileOptions(api.storage, activeFile) : { projects: [] };
        const dialect = effectiveDialect(activeFile, options_);
        if (!dialect) {
            const name = activeFile.split('/').pop() ?? activeFile;
            api?.logger.warn(
                `Blockly: nie obsługuję pliku „${name}". Obsługiwane rozszerzenia: `
                + `${supportedExtensions().join(', ')}. Język można też wskazać ręcznie `
                + 'w „Blockly: opcje pliku…".',
            );
            return undefined;
        }
        return { file: activeFile, label: dialect.label };
    };

    return {
        manifest: {
            id: BLOCKLY_PLUGIN_ID,
            name: 'Blockly',
            version: '1.0.0',
            description: 'Edytor bloczkowy dla pliku źródłowego; bloczki z diagramu UML.',
            contributes: ['contextmenu', 'commandpalette', 'toolbar'],
        },

        async activate(host: IPluginAPI) {
            api = host;

            disposables.push(host.editor.onDidChangeModel((uri) => {
                // Zakładka Blockly'ego nie jest plikiem — gdyby nadpisała
                // `activeFile`, „Opcje pliku" otwarte z niej dotyczyłyby jej
                // samej, a nie edytowanego kodu.
                if (uri.startsWith(BLOCKLY_TAB_SCHEME)) return;
                activeFile = uri;
            }));

            host.commands.register('open', () => {
                const target = targetOrExplain();
                if (!target) return;
                // Odroczenie — patrz nagłówek pliku.
                pendingTab = setTimeout(() => {
                    pendingTab = undefined;
                    // Bez `catch` nieudany import komponentu zakładki kończył się
                    // odrzuconą obietnicą, której nikt nie czyta: kliknięcie
                    // w menu nie robiło nic i nie zostawiało śladu.
                    openBlocklyTab(host, target.file, target.label, options.umlSource)
                        .catch((e: unknown) => host.logger.error(
                            `Blockly: nie udało się otworzyć edytora bloczkowego: ${String(e)}`));
                }, 0);
            });

            host.commands.register('fileOptions', () => {
                if (!activeFile) {
                    host.logger.warn('Blockly: opcje dotyczą pliku, a żaden nie jest otwarty.');
                    return;
                }
                showFileOptions(host, activeFile, options.umlSource)
                    .catch((e: unknown) => host.logger.error(
                        `Blockly: nie udało się otworzyć okna opcji: ${String(e)}`));
            });

            disposables.push(host.ui.contextmenu.register({
                id: 'blockly.open', label: 'Blockly: edytor bloczkowy',
                group: 'blockly', order: 1, command: command('open'),
            }));
            disposables.push(host.ui.contextmenu.register({
                id: 'blockly.fileOptions', label: 'Blockly: opcje pliku…',
                group: 'blockly', order: 2, command: command('fileOptions'),
            }));
            disposables.push(host.ui.commandpalette.register({
                command: command('open'), title: 'Otwórz edytor bloczkowy', category: 'Blockly',
            }));
            disposables.push(host.ui.commandpalette.register({
                command: command('fileOptions'), title: 'Opcje pliku (diagram UML)', category: 'Blockly',
            }));
            disposables.push(host.ui.toolbar.register({
                id: 'blockly.open', label: 'Edytor bloczkowy', icon: ICON,
                group: 'blockly', order: 1, command: command('open'),
            }));
        },

        async deactivate() {
            if (pendingTab !== undefined) { clearTimeout(pendingTab); pendingTab = undefined; }
            unmountDialog?.();
            unmountDialog = undefined;
            disposables.splice(0).forEach((d) => d.dispose());
            api = undefined;
            activeFile = undefined;
        },
    };

    /** Zakładka z edytorem bloczkowym. Komponent ładowany leniwie — patrz §6. */
    async function openBlocklyTab(
        host: IPluginAPI, file: string, label: string, umlSource?: UmlProjectSource,
    ): Promise<void> {
        const { createBlocklyTab } = await import('./BlocklyEditorTab');
        const component = createBlocklyTab({
            file, storage: host.storage, umlSource, logger: host.logger,
            ...(options.fileSystem ? { fileSystem: options.fileSystem } : {}),
        });
        host.openEditorTab({
            uri: `${BLOCKLY_TAB_SCHEME}${file}`,
            title: `Bloczki (${label}): ${file.split('/').pop()}`,
            component: component as ComponentType,
            // Ten sam widok dokumentu, nie materiał do porównywania obok (§4).
            toSide: false,
        });
    }

    /** Okno „Opcje pliku" we własnym korzeniu Reacta — patrz nagłówek. */
    async function showFileOptions(
        host: IPluginAPI, file: string, umlSource?: UmlProjectSource,
    ): Promise<void> {
        unmountDialog?.();
        const { mountFileOptionsDialog } = await import('./dialogHost');
        unmountDialog = await mountFileOptionsDialog({
            file,
            storage: host.storage,
            umlSource,
            onClose: () => { unmountDialog?.(); unmountDialog = undefined; },
        });
    }
}

/** Czy wtyczka ma dla tego pliku cokolwiek do zaoferowania. */
export function isSupportedByBlockly(path: string): boolean {
    return dialectForPath(path) !== undefined;
}
