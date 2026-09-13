/**
 * dialogHost.tsx — korzeń Reacta dla okna „Opcje pliku".
 *
 * Host edytora nie ma usługi okien dialogowych, a „Opcje pliku" wywołuje się
 * z menu kontekstowego Monaco — czyli spoza drzewa Reacta jakiegokolwiek
 * panelu. Montujemy więc własny korzeń w `document.body` i sprzątamy go po
 * zamknięciu.
 *
 * Odmontowanie jest odroczone o przejście pętli zdarzeń: React 18 zgłasza
 * ostrzeżenie przy synchronicznym `unmount()` wywołanym z wnętrza obsługi
 * zdarzenia własnego drzewa.
 */

import type { OptionsStorage } from './fileOptions';
import type { UmlProjectSource } from './umlProjectSource';

export interface MountOptions {
    file: string;
    storage: OptionsStorage;
    umlSource?: UmlProjectSource;
    onClose(): void;
}

/** Montuje okno i zwraca funkcję sprzątającą. */
export async function mountFileOptionsDialog(options: MountOptions): Promise<() => void> {
    const [{ createRoot }, { BlocklyFileOptionsDialog }] = await Promise.all([
        import('react-dom/client'),
        import('./BlocklyFileOptionsDialog'),
    ]);

    const container = document.createElement('div');
    container.dataset.blocklyDialog = 'file-options';
    document.body.appendChild(container);
    const root = createRoot(container);

    let disposed = false;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        setTimeout(() => {
            root.unmount();
            container.remove();
        }, 0);
    };

    root.render(
        <BlocklyFileOptionsDialog
            file={options.file}
            storage={options.storage}
            {...(options.umlSource ? { umlSource: options.umlSource } : {})}
            onClose={() => { options.onClose(); dispose(); }}
        />,
    );

    return dispose;
}
