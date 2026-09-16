/**
 * umlToolbox.ts — funkcje z projektu UML jako bloczki Blockly.
 *
 * Parsowanie projektu robi `../umlCallables` (ten sam kod, którego używa
 * MinisLib Graph). Tutaj zostaje jedno: zamiana gotowej listy funkcji na
 * definicje bloczków i kategorie przybornika — **dla wskazanego języka**.
 *
 * ## Dlaczego tożsamość bloczka zależy od języka
 *
 * `Blockly.Blocks` jest mapą globalną, a etykieta bloczka pokazuje wywołanie
 * tak, jak wyląduje w kodzie: `Api.load` w JavaScripcie, `Api::load` w C++.
 * Jeden wspólny typ znaczyłby, że plik otwarty jako drugi przemalowuje bloczki
 * pierwszego — użytkownik widzi wtedy w pliku C++ składnię JavaScriptu i nie ma
 * jak zgadnąć, dlaczego.
 *
 * Klucz obejmuje **generator**, nie nazwę dialektu: TypeScript i JavaScript to
 * ta sama składnia i ten sam generator, więc dzielą bloczki. Osobne byłyby
 * dwiema nazwami tej samej rzeczy.
 */

import * as Blockly from 'blockly';
import type { CodeGenerator } from 'blockly';

import { groupByCategory, returnsValue, docSections, type UmlCallable } from '../umlCallables';
import {
  callExpressionIn,
  statementIn,
  type GeneratorKind,
  type LanguageDialect,
} from './dialects';

export interface ToolboxBlockEntry {
  kind: 'block';
  type: string;
}
export interface ToolboxCategory {
  kind: 'category';
  name: string;
  colour: string;
  contents: ToolboxBlockEntry[];
}
export interface ToolboxSeparator {
  kind: 'sep';
}
/** Kategoria wypełniana przez Blockly'ego (zmienne, procedury). */
export interface ToolboxCustomCategory {
  kind: 'category';
  name: string;
  colour: string;
  custom: string;
}
export interface ToolboxDefinition {
  kind: 'categoryToolbox';
  contents: Array<ToolboxCategory | ToolboxCustomCategory | ToolboxSeparator>;
}

const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9]/g, '_');

/** Barwa kategorii wyliczona z nazwy — ta sama klasa zawsze tym samym kolorem. */
function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Typ bloczka dla funkcji w danym języku — patrz nagłówek pliku. */
export function umlBlockType(
  callable: Pick<UmlCallable, 'owner' | 'name'>,
  dialect: LanguageDialect
): string {
  return `uml_${dialect.generator}_${sanitize(callable.owner)}_${sanitize(callable.name)}`;
}

/**
 * Rejestruje bloczki dla podanych funkcji i zwraca kategorie przybornika.
 *
 * Idempotentne: ponowne wywołanie nadpisuje definicje tymi samymi. Wtyczka
 * wywołuje to przy każdym otwarciu zakładki i po każdej zmianie wyboru
 * projektów, więc wyjątek przy drugim przebiegu zamykałby edytor.
 */
export function defineUmlBlocks(
  callables: readonly UmlCallable[],
  dialect: LanguageDialect,
  generator: CodeGenerator
): ToolboxCategory[] {
  const categories: ToolboxCategory[] = [];

  for (const group of groupByCategory([...callables])) {
    const hue = hueFor(group.category);
    const contents: ToolboxBlockEntry[] = [];

    for (const callable of group.items) {
      const type = umlBlockType(callable, dialect);
      const hasValue = returnsValue(callable);
      const label = qualifiedLabel(callable, dialect);

      Blockly.Blocks[type] = {
        init(this: Blockly.Block) {
          this.appendDummyInput().appendField(label);
          callable.params.forEach((param, i) => {
            const type_ = callable.paramTypes[i];
            this.appendValueInput(`ARG${i}`).appendField(type_ ? `${param}: ${type_}` : param);
          });
          // Przy jednym–dwóch argumentach bloczek w linii czyta się
          // jak wywołanie; przy większej liczbie rozjeżdża się poza ekran.
          this.setInputsInline(callable.params.length <= 2);
          if (hasValue) this.setOutput(true, null);
          else {
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
          }
          this.setColour(hue);
          this.setTooltip(tooltipFor(callable, dialect));
        },
      };

      generator.forBlock[type] = (block: Blockly.Block, gen: CodeGenerator) => {
        const args = callable.params.map(
          (_, i) =>
            // Brak podłączonej wartości daje pustą nazwę argumentu, a nie
            // pusty tekst: `f(, 2)` nie jest kodem w żadnym z tych języków.
            gen.valueToCode(block, `ARG${i}`, 0) || placeholderFor(dialect)
        );
        const expression = callExpressionIn(dialect, callable, args);
        return hasValue ? ([expression, 0] as [string, number]) : statementIn(dialect, expression);
      };

      contents.push({ kind: 'block', type });
    }

    if (contents.length) {
      categories.push({ kind: 'category', name: group.category, colour: String(hue), contents });
    }
  }

  return categories;
}

/** Etykieta bloczka — wywołanie w składni języka, bez argumentów. */
function qualifiedLabel(callable: UmlCallable, dialect: LanguageDialect): string {
  return callExpressionIn(dialect, callable, [])
    .replace(/\(\)$/, '')
    .replace(/^await\s+/, '');
}

/** Wartość wstawiana za niepodłączony argument. */
function placeholderFor(dialect: LanguageDialect): string {
  switch (dialect.generator) {
    case 'cpp':
      return '0';
    case 'python':
      return 'None';
    case 'lua':
      return 'nil';
    case 'php':
      return 'null';
    default:
      return 'null';
  }
}

/**
 * Podpowiedź bloczka: sygnatura plus dokumentacja z UML-a.
 *
 * Dokumentacja pochodzi z TSDoc przeniesionego przy generowaniu diagramu
 * „z kodu" — jeśli autor biblioteki ją napisał, nie ma powodu, żeby nie
 * dotarła do osoby układającej bloczki.
 */
function tooltipFor(callable: UmlCallable, dialect: LanguageDialect): string {
  const params = callable.params
    .map((p, i) => (callable.paramTypes[i] ? `${p}: ${callable.paramTypes[i]}` : p))
    .join(', ');
  const signature =
    `${qualifiedLabel(callable, dialect)}(${params})` +
    (callable.returnType ? `: ${callable.returnType}` : '');
  const doc = docSections(callable)
    .map((s) => (s.title ? `${s.title}: ${s.lines.join(' ')}` : s.lines.join(' ')))
    .join('\n');
  return doc ? `${signature}\n\n${doc}` : signature;
}

/**
 * Standardowe kategorie Blockly'ego, wspólne dla wszystkich języków.
 *
 * Nazwy po polsku, bo cały interfejs edytora jest po polsku, a angielskie
 * „Logic/Loops/Math" wyglądałyby jak niedokończone tłumaczenie.
 */
const STANDARD_CATEGORIES: ToolboxCategory[] = [
  {
    kind: 'category',
    name: 'Logika',
    colour: '210',
    contents: [
      { kind: 'block', type: 'controls_if' },
      { kind: 'block', type: 'logic_compare' },
      { kind: 'block', type: 'logic_operation' },
      { kind: 'block', type: 'logic_negate' },
      { kind: 'block', type: 'logic_boolean' },
      { kind: 'block', type: 'logic_null' },
      { kind: 'block', type: 'logic_ternary' },
    ],
  },
  {
    kind: 'category',
    name: 'Pętle',
    colour: '120',
    contents: [
      { kind: 'block', type: 'controls_repeat_ext' },
      { kind: 'block', type: 'controls_whileUntil' },
      { kind: 'block', type: 'controls_for' },
      { kind: 'block', type: 'controls_forEach' },
      { kind: 'block', type: 'controls_flow_statements' },
    ],
  },
  {
    kind: 'category',
    name: 'Matematyka',
    colour: '230',
    contents: [
      { kind: 'block', type: 'math_number' },
      { kind: 'block', type: 'math_arithmetic' },
      { kind: 'block', type: 'math_single' },
      { kind: 'block', type: 'math_number_property' },
      { kind: 'block', type: 'math_round' },
      { kind: 'block', type: 'math_modulo' },
      { kind: 'block', type: 'math_constrain' },
      { kind: 'block', type: 'math_random_int' },
    ],
  },
  {
    kind: 'category',
    name: 'Tekst',
    colour: '160',
    contents: [
      { kind: 'block', type: 'text' },
      { kind: 'block', type: 'text_join' },
      { kind: 'block', type: 'text_append' },
      { kind: 'block', type: 'text_length' },
      { kind: 'block', type: 'text_isEmpty' },
      { kind: 'block', type: 'text_print' },
    ],
  },
  {
    kind: 'category',
    name: 'Listy',
    colour: '260',
    contents: [
      { kind: 'block', type: 'lists_create_with' },
      { kind: 'block', type: 'lists_repeat' },
      { kind: 'block', type: 'lists_length' },
      { kind: 'block', type: 'lists_isEmpty' },
      { kind: 'block', type: 'lists_indexOf' },
      { kind: 'block', type: 'lists_getIndex' },
      { kind: 'block', type: 'lists_setIndex' },
    ],
  },
];

/**
 * Kategorie standardowe, których dany generator **nie** obsługuje.
 *
 * Pokazanie bloczka, z którego nie wychodzi kod, jest gorsze niż jego brak:
 * użytkownik układa z niego program i dowiaduje się o problemie dopiero
 * z pustego miejsca w wyniku. Listy odpadają w C++, bo `lists_create_with`
 * miesza typy w jednym literale, a `std::vector` tego nie zniesie.
 */
const UNSUPPORTED: Partial<Record<GeneratorKind, readonly string[]>> = {
  cpp: ['Listy'],
};

/**
 * Pełny przybornik: bloczki standardowe, zmienne, a pod nimi kategorie z UML-a.
 *
 * Kolejność nie jest kosmetyką. Bloczki standardowe są wspólne dla wszystkich
 * plików, a te z UML-a zmieniają się razem z wyborem diagramu — stałe miejsce
 * na górze znaczy, że pamięć mięśniowa nie przestaje działać po podmianie
 * projektu.
 */
export function toolboxWithUml(
  umlCategories: readonly ToolboxCategory[],
  dialect?: LanguageDialect
): ToolboxDefinition {
  const skip = new Set(dialect ? (UNSUPPORTED[dialect.generator] ?? []) : []);
  const standard = STANDARD_CATEGORIES.filter((c) => !skip.has(c.name));

  // Zmienne wypełnia sam Blockly — lista zależy od tego, co użytkownik
  // utworzył, więc nie da się jej wypisać z góry.
  const variables: ToolboxCustomCategory = {
    kind: 'category',
    name: 'Zmienne',
    colour: '330',
    custom: 'VARIABLE',
  };

  // Funkcje tak samo: w kategorii są bloczki definicji, a pod nimi wywołanie
  // każdej funkcji, którą użytkownik zdążył zdefiniować. Stała lista
  // pokazywałaby definicje, ale nigdy wywołań.
  const procedures: ToolboxCustomCategory = {
    kind: 'category',
    name: 'Funkcje',
    colour: '290',
    custom: 'PROCEDURE',
  };

  return {
    kind: 'categoryToolbox',
    contents: [
      ...standard,
      variables,
      procedures,
      ...(umlCategories.length ? [{ kind: 'sep' } as ToolboxSeparator, ...umlCategories] : []),
    ],
  };
}
