/**
 * callout.ts — notka kontekstowa, czyli **jedyna nasza treść w dokumencie**.
 *
 * Podręcznik konsekwentnie przemilcza kontekst: mówi, że „rachunek różniczkowy
 * został wynaleziony, aby być wygodnym narzędziem przy rozważaniu podstawowych
 * zagadnień mechaniki", i nie podaje ani jednego nazwiska. Notka wypełnia tę
 * lukę **obok** tekstu Resnicka, nigdy w nim — dlatego jest osobnym blokiem
 * z własną ramką, a nie akapitem.
 *
 * Trzy rodzaje wynikają z tego, czego szukamy przy skanowaniu rozdziału: prawa
 * i zasady, postaci nauki oraz urządzenia i doświadczenia. Rodzaj jest
 * **deklarowany**, nie zgadywany — gdyby parser zgadywał, literówka cicho
 * zamieniłaby jedno w drugie, tak jak nie-przypisanie cicho stałoby się
 * `relation` w bloku `formula`.
 *
 * Identyfikator (`rh1-nota-newton`) **nie niesie numeru rozdziału**, bo ta sama
 * postać wraca w wielu miejscach i ma mieć jedną notkę, do której reszta się
 * odsyła.
 */

export type CalloutKind = 'law' | 'person' | 'device';

export const CALLOUT_KINDS: readonly CalloutKind[] = ['law', 'person', 'device'];

export interface CalloutIssue {
  message: string;
}

export interface CalloutBlock {
  id: string;
  /** Co notka wiąże: prawo, postać albo urządzenie. */
  kind?: CalloutKind;
  /** Tytuł notki — pierwszy wiersz bez `@`. */
  title: string;
  /** Nasza treść: fakt sprawdzalny, trzy do pięciu zdań. */
  body?: string;
  /** Miejsce w książce, przy którym notka stoi — podrozdział i strona. */
  source?: string;
  issues: CalloutIssue[];
  unknown: string[];
}

export const CALLOUT_FENCE = /```callout:([A-Za-z0-9_-]+)\n([\s\S]*?)```/g;

/**
 * Czyta notkę kontekstową.
 *
 * Format celowo bliski blokom `term` i `formula`: pierwszy wiersz bez `@` to
 * tytuł, reszta to dyrektywy. Autor uczy się jednej konwencji, nie trzech.
 */
export function parseCalloutBlock(id: string, code: string): CalloutBlock {
  const block: CalloutBlock = { id, title: '', issues: [], unknown: [] };

  // Treść notki bywa dłuższa niż wiersz pliku — dokumenty bazy są zawijane na
  // 80 kolumn, więc bez sklejania kontynuacji zostałoby z niej pierwsze zdanie.
  let ostatnia: 'body' | undefined;

  for (const surowa of code.split('\n')) {
    const linia = surowa.trim();
    if (!linia) continue;

    if (!linia.startsWith('@')) {
      if (ostatnia === 'body' && surowa.startsWith(' ')) {
        block.body = `${block.body} ${linia}`;
        continue;
      }
      if (!block.title) block.title = linia;
      else block.unknown.push(linia);
      continue;
    }

    ostatnia = undefined;
    const spacja = linia.indexOf(' ');
    const nazwa = (spacja < 0 ? linia : linia.slice(0, spacja)).slice(1);
    const reszta = spacja < 0 ? '' : linia.slice(spacja + 1).trim();

    switch (nazwa) {
      case 'kind':
        if ((CALLOUT_KINDS as readonly string[]).includes(reszta)) block.kind = reszta as CalloutKind;
        else {
          block.issues.push({
            message: `Nieznany rodzaj notki „${reszta}" w @kind — dozwolone: ${CALLOUT_KINDS.join(', ')}.`,
          });
        }
        break;
      case 'body':
        block.body = reszta;
        ostatnia = 'body';
        break;
      case 'source':
        block.source = reszta;
        break;
      default:
        block.unknown.push(linia);
        break;
    }
  }

  if (!block.kind && !block.issues.length) {
    block.issues.push({ message: 'Notka musi deklarować rodzaj: @kind law, person albo device.' });
  }
  if (!block.title) block.issues.push({ message: 'Notka musi mieć tytuł w pierwszym wierszu.' });
  if (!block.body) block.issues.push({ message: 'Notka musi mieć treść w @body.' });

  return block;
}
