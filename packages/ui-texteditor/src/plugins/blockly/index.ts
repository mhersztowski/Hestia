/**
 * Wtyczka Blockly — edytor bloczkowy dla pliku otwartego w edytorze.
 *
 * Eksport jest wąski celowo: host potrzebuje fabryki wtyczki i (opcjonalnie)
 * gotowego źródła projektów UML. Reszta to szczegóły, których zmiana nie
 * powinna być zmianą interfejsu pakietu.
 */

export { createBlocklyPlugin, isSupportedByBlockly, BLOCKLY_PLUGIN_ID } from './BlocklyPlugin';
export type { BlocklyPluginOptions } from './BlocklyPlugin';
export { createVfsUmlProjectSource } from './vfsUmlProjectSource';
export type { UmlProjectRef, UmlProjectSource } from './umlProjectSource';
export { allDialects, dialectForPath, supportedExtensions } from './dialects';
export type { LanguageDialect } from './dialects';
