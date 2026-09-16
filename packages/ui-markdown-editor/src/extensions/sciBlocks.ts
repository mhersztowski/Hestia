/**
 * sciBlocks.ts — wpięcie bloków bazy wiedzy do MdEditora.
 *
 * Całe wpięcie to jedno wywołanie: pakiet `sci-blocks` dostaje funkcję
 * rejestrującą i sam mówi, które infostringi obsługuje. Edytor nie wie, czym
 * jest wzór ani symulacja, a pakiet nie wie, że hostem jest TipTap.
 *
 * Drugie wpięcie to **rozpoznawanie pisma rysikiem**. Pakiet zna tylko port
 * `(obraz, tryb) => zapis`; że po drugiej stronie stoi model wizyjny Claude'a,
 * wie wyłącznie ta aplikacja — bo to ona ma konfigurację AI i klucz.
 *
 * Import dla efektu ubocznego — tak samo jak widok diagramu Mermaida.
 */
import { registerSciBlocks } from '@hestia/ui-sci-blocks';
import { registerBlockRenderer } from './blockRenderers';

registerSciBlocks(registerBlockRenderer);

/**
 * Handwriting recognition and the `simscript` code editor are **not wired here**.
 *
 * `sci-blocks` declares a port for each — `setInkRecognizer` and
 * `setCodeEditor` — and what stands on the other side is the host's business:
 * in MyCastle a vision model behind the application's AI key, and Monaco from
 * the Automate designer's setup. Neither came over: one needs a service this
 * package must not know about, the other went with Automate.
 *
 * A host that wants them calls the two setters from `@hestia/ui-sci-blocks`
 * itself. Until it does, a `simscript` block shows a plain text area and the pen
 * produces no text — which is exactly what the blocks do outside an application
 * anyway, in the static export and in the preview.
 */
