/**
 * dialects.ts — języki, dla których wtyczka otwiera edytor Blockly.
 *
 * ## Po co osobny model dialektu
 *
 * Bloczki powstają z projektu UML, a UML opisuje **strukturę**, nie składnię:
 * „statyczna metoda `load` klasy `Api`, zwraca `Promise<T>`". Jak to zapisać,
 * zależy od języka pliku, w którym wynik wyląduje:
 *
 *   JavaScript   await Api.load(1);
 *   C++          Api::load(1);
 *   Python       await Api.load(1)
 *
 * Różnice są drobne i właśnie dlatego kosztowne: `Api.load()` w C++ **skompiluje
 * się**, jeśli `Api` przypadkiem jest obiektem, i wtedy nikt nie zauważy, że
 * generator wypisał składnię innego języka.
 *
 * ## Dlaczego rozpoznanie może zwrócić „nie wiem"
 *
 * `dialectForPath` oddaje `undefined` dla nieobsługiwanego rozszerzenia zamiast
 * podstawiać domyślny język. Wtyczka ma wtedy milczeć — edytor Blockly nad
 * plikiem `.md` generowałby kod, którego nie ma gdzie wkleić.
 */

import type { UmlCallable } from '../umlCallables';

/** Silnik kodu Blockly'ego, po którym poznajemy, skąd wziąć generator. */
export type GeneratorKind = 'javascript' | 'python' | 'php' | 'lua' | 'dart' | 'cpp';

export interface LanguageDialect {
    id: string;
    /** Nazwa dla użytkownika — trafia do podpisu zakładki i okna opcji. */
    label: string;
    /** Rozszerzenia plików (z kropką, małymi literami). */
    extensions: readonly string[];
    /** Który generator Blockly obsługuje ten język. */
    generator: GeneratorKind;
    /**
     * Jak odwołać się do składowej **statycznej**.
     *
     * `::` w C++ i PHP nie jest ozdobnikiem: kropka znaczy tam dostęp przez
     * obiekt, a UML opisuje metodę wołaną bez instancji.
     */
    staticAccess: '.' | '::';
    /** Czy język zna `await` — inaczej asynchroniczność UML-a nie ma jak wejść do kodu. */
    supportsAwait: boolean;
    /** Zakończenie instrukcji. Pusty napis dla języków bez średnika. */
    terminator: ';' | '';
    /** Znacznik komentarza jednowierszowego. */
    comment: '//' | '#' | '--';
    /** Identyfikator języka w Monaco — do podglądu wygenerowanego kodu. */
    monacoLanguage: string;
}

const DIALECTS: readonly LanguageDialect[] = [
    {
        id: 'javascript', label: 'JavaScript',
        extensions: ['.js', '.mjs', '.cjs', '.jsx'],
        generator: 'javascript',
        staticAccess: '.', supportsAwait: true, terminator: ';', comment: '//',
        monacoLanguage: 'javascript',
    },
    {
        // Osobny wpis, a nie alias JavaScriptu: generator jest ten sam, ale
        // tożsamość nie — podpis zakładki i okno opcji mają mówić „TypeScript".
        id: 'typescript', label: 'TypeScript',
        extensions: ['.ts', '.tsx', '.mts', '.cts'],
        generator: 'javascript',
        staticAccess: '.', supportsAwait: true, terminator: ';', comment: '//',
        monacoLanguage: 'typescript',
    },
    {
        id: 'cpp', label: 'C++',
        // `.ino` razem z C++: szkic Arduino to C++ z dorobionym `main()`.
        extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.h', '.ino'],
        generator: 'cpp',
        staticAccess: '::', supportsAwait: false, terminator: ';', comment: '//',
        monacoLanguage: 'cpp',
    },
    {
        id: 'python', label: 'Python',
        extensions: ['.py', '.pyw'],
        generator: 'python',
        staticAccess: '.', supportsAwait: true, terminator: '', comment: '#',
        monacoLanguage: 'python',
    },
    {
        id: 'lua', label: 'Lua',
        extensions: ['.lua'],
        generator: 'lua',
        staticAccess: '.', supportsAwait: false, terminator: '', comment: '--',
        monacoLanguage: 'lua',
    },
    {
        id: 'php', label: 'PHP',
        extensions: ['.php'],
        generator: 'php',
        staticAccess: '::', supportsAwait: false, terminator: ';', comment: '//',
        monacoLanguage: 'php',
    },
    {
        id: 'dart', label: 'Dart',
        extensions: ['.dart'],
        generator: 'dart',
        staticAccess: '.', supportsAwait: true, terminator: ';', comment: '//',
        monacoLanguage: 'dart',
    },
];

export function allDialects(): readonly LanguageDialect[] {
    return DIALECTS;
}

export function dialectById(id: string): LanguageDialect | undefined {
    return DIALECTS.find((d) => d.id === id);
}

/**
 * Dialekt pliku o tej ścieżce.
 *
 * Ścieżka bywa adresem zakładki wtyczki (`blockly:///user/…`) — schemat
 * odcinamy, bo to ten sam plik, a jego rozszerzenie nie przestaje znaczyć tego,
 * co znaczyło.
 */
export function dialectForPath(path: string): LanguageDialect | undefined {
    const clean = String(path ?? '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const dot = clean.lastIndexOf('.');
    if (dot < 0) return undefined;
    const ext = clean.slice(dot).toLowerCase();
    return DIALECTS.find((d) => d.extensions.includes(ext));
}

/** Wszystkie rozszerzenia, dla których wtyczka się odzywa. */
export function supportedExtensions(): string[] {
    return DIALECTS.flatMap((d) => [...d.extensions]);
}

/** Kształt funkcji z UML-a potrzebny do złożenia wywołania. */
type CallableShape = Pick<UmlCallable, 'callee' | 'owner' | 'ownerKind' | 'isAsync'>;

/**
 * Wyrażenie wywołania w składni danego języka.
 *
 * `callee` z UML-a jest zapisane po javascriptowemu (`Api.load`), bo tak
 * powstaje w parserze. Tutaj rozdzielamy je z powrotem i składamy zgodnie
 * z językiem — inaczej C++ dostawałby kropkę tam, gdzie potrzebuje `::`.
 */
export function callExpressionIn(
    dialect: LanguageDialect,
    callable: CallableShape,
    args: readonly string[],
): string {
    const call = `${qualify(dialect, callable)}(${args.join(', ')})`;
    // `await` tylko tam, gdzie język go zna. W pozostałych asynchroniczność
    // z UML-a jest informacją o źródle, a nie o składni docelowej.
    return callable.isAsync && dialect.supportsAwait ? `await ${call}` : call;
}

function qualify(dialect: LanguageDialect, callable: CallableShape): string {
    // Funkcja globalna nie ma kwalifikatora w żadnym z tych języków.
    if (callable.ownerKind === 'module') return callable.callee;
    if (dialect.staticAccess === '.') return callable.callee;
    // `Api.load` → `Api::load`; podmieniamy **pierwszą** kropkę, bo dalsze
    // (gdyby były) należą już do zagnieżdżonej nazwy.
    return callable.callee.replace('.', dialect.staticAccess);
}

/** Instrukcja: wyrażenie z zakończeniem właściwym dla języka. */
export function statementIn(dialect: LanguageDialect, expression: string): string {
    return `${expression}${dialect.terminator}\n`;
}

/** Komentarz jednowierszowy w składni języka. */
export function commentIn(dialect: LanguageDialect, text: string): string {
    return `${dialect.comment} ${text}`;
}
