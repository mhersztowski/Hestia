/**
 * umlFormat.ts — projekt UML (`*.umlproj.json`) jako format diagramu.
 *
 * Adapter jest cienki, bo cała trudna część siedzi w `umlProject.ts`: on tłumaczy
 * kształty, ten dokłada rozpoznanie pliku i zasadę zachowania treści.
 *
 * **Zasada zachowania treści jest tu ważniejsza niż gdziekolwiek indziej.**
 * Plik projektu niesie historię commitów, listę diagramów, `linkedPath` i
 * `updatedAt` — rzeczy, których model diagramu nie modeluje i modelować nie
 * powinien. Zapis z bloku w notatce musi je oddać nietknięte, inaczej pierwsza
 * poprawka skasowałaby historię całego projektu, i to bez ostrzeżenia. Dlatego
 * oryginał wraca w `meta.umlProject`, dokładnie tak jak nierozpoznane linie
 * Mermaida wracają w `unknown`.
 *
 * Praktyczne spięcie ze stroną Programming → UML dostajemy za darmo: blok kodu
 * w edytorze markdown umie być **związany z plikiem w Drive** (`externalSrc`),
 * więc ten sam projekt da się oglądać i poprawiać w obu miejscach bez kopiowania.
 */
import type { DiagramDocument } from '../../model/diagram';
import type { DiagramFormat, ParseResult } from '../../model/format';
import { emptyDiagram } from '../../model/diagram';
import { documentToUmlDiagram, umlDiagramToDocument, type UmlDiagramLike } from './umlProject';

/** Podzbiór `UmlProject` z `devtools` — patrz uwaga o powtórzeniu w `umlProject.ts`. */
interface UmlProjectLike {
  type?: string;
  version?: number;
  name?: string;
  linkedPath?: string;
  diagrams?: UmlDiagramLike[];
  history?: unknown;
  updatedAt?: number;
}

const MARKER = /"type"\s*:\s*"uml-project"/;

/** Który diagram projektu pokazuje blok. Na razie zawsze pierwszy. */
const INDEKS_DIAGRAMU = 0;

function pustyProjekt(): UmlProjectLike {
  return { type: 'uml-project', version: 2, name: 'Model', diagrams: [] };
}

export const umlProjectFormat: DiagramFormat = {
  id: 'umlproj',
  label: 'Projekt UML',
  kinds: ['class'],

  /**
   * Rozpoznanie po znaczniku typu, nie po tym, że „to jakiś JSON".
   *
   * Adapter ma być ostrożny: zawyżona pewność odbiera tekst właściwemu
   * formatowi, a JSON-a w blokach kodu jest pełno.
   */
  detect(text) {
    return MARKER.test(text) ? 0.98 : 0;
  },

  parse(text): ParseResult {
    let project: UmlProjectLike;
    try {
      project = JSON.parse(text) as UmlProjectLike;
    } catch (e) {
      const doc = emptyDiagram('class');
      return {
        document: doc,
        issues: [{ message: `Nie umiem odczytać projektu UML: ${e instanceof Error ? e.message : String(e)}` }],
      };
    }

    const diagram = project.diagrams?.[INDEKS_DIAGRAMU];
    if (!diagram) {
      const doc = emptyDiagram('class');
      // Pusty projekt nie jest awarią — blok mógł dopiero powstać. Zapamiętujemy
      // go, żeby zapis dołożył klasy do tego projektu, a nie zrobił nowego.
      doc.meta = { umlProject: JSON.stringify(project) };
      return { document: doc, issues: [{ message: 'Projekt UML nie ma żadnego diagramu.' }] };
    }

    const doc = umlDiagramToDocument(diagram);
    doc.meta = { ...doc.meta, umlProject: JSON.stringify(project) };
    return { document: doc, issues: [] };
  },

  serialize(doc: DiagramDocument): string {
    let project: UmlProjectLike;
    try {
      project = doc.meta?.umlProject ? (JSON.parse(doc.meta.umlProject) as UmlProjectLike) : pustyProjekt();
    } catch {
      // Zepsuty odcisk oryginału nie może zablokować zapisu diagramu, który
      // użytkownik właśnie narysował.
      project = pustyProjekt();
    }

    const diagrams = [...(project.diagrams ?? [])];
    const previous = diagrams[INDEKS_DIAGRAMU];
    diagrams[INDEKS_DIAGRAMU] = documentToUmlDiagram(doc, previous);

    return JSON.stringify({ ...project, diagrams }, null, 2);
  },
};
