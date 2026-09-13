/**
 * cppGenerator.ts — generator kodu C++ dla bloczków Blockly.
 *
 * ## Dlaczego własny
 *
 * Blockly dostarcza generatory dla JavaScriptu, Pythona, PHP, Lui i Darta.
 * C++ na tej liście nie ma, a to jego wymaga większość projektów w tym
 * repozytorium (Hydra, Arduino, MinisC). Bez generatora edytor bloczkowy dla
 * pliku `.cpp` układałby klocki, z których nic by nie wychodziło.
 *
 * ## Czego tu nie ma i dlaczego
 *
 * Zakres jest świadomie węższy niż pełny zestaw Blockly'ego: logika, pętle,
 * matematyka, tekst i zmienne. **Listy pominięte** — `lists_create_with` miesza
 * typy w jednym literale, a `std::vector` tego nie zniesie; wygenerowany kod
 * kompilowałby się tylko przypadkiem. Zamiast wypisywać zaślepkę, przybornik
 * dla C++ w ogóle nie pokazuje tej kategorii (patrz `umlToolbox`).
 *
 * ## Typy zmiennych
 *
 * Pierwsze przypisanie deklaruje przez `auto`, kolejne już nie. To jedyny
 * sposób, żeby z bloczków — które o typach nie mówią nic — wyszedł kod, który
 * się kompiluje. Ceną jest zasięg: zmienna użyta po raz pierwszy wewnątrz `if`
 * zostaje zadeklarowana wewnątrz `if`. Alternatywą było deklarowanie wszystkiego
 * na górze jako `double`, co psuje każdy napis.
 */

import * as Blockly from 'blockly';
import { CodeGenerator, Names } from 'blockly';

/**
 * Priorytety operatorów — pilnują, żeby generator nawiasował tam, gdzie trzeba.
 * Wartości jak w tabeli pierwszeństwa C++ (niższa = mocniej wiąże).
 */
export const CppOrder = {
    ATOMIC: 0,
    UNARY: 3,
    MULTIPLICATIVE: 5,
    ADDITIVE: 6,
    RELATIONAL: 9,
    EQUALITY: 10,
    LOGICAL_AND: 14,
    LOGICAL_OR: 15,
    CONDITIONAL: 16,
    ASSIGNMENT: 16,
    NONE: 99,
} as const;

/** Słowa, których nie wolno użyć jako nazwy zmiennej. */
const RESERVED = [
    'alignas', 'alignof', 'and', 'asm', 'auto', 'bool', 'break', 'case', 'catch',
    'char', 'class', 'const', 'constexpr', 'continue', 'decltype', 'default',
    'delete', 'do', 'double', 'else', 'enum', 'explicit', 'export', 'extern',
    'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long',
    'mutable', 'namespace', 'new', 'not', 'nullptr', 'operator', 'or', 'private',
    'protected', 'public', 'register', 'return', 'short', 'signed', 'sizeof',
    'static', 'struct', 'switch', 'template', 'this', 'throw', 'true', 'try',
    'typedef', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void',
    'volatile', 'while', 'xor',
].join(',');

/**
 * Widok na generator obejmujący składowe chronione, które trzeba podstawić.
 *
 * `CodeGenerator` Blockly'ego zakłada dziedziczenie: `quote_`, `scrub_`
 * i `nameDB_` są chronione. Budujemy generator złożeniem, a nie podklasą, bo
 * rejestracje bloczków i tak są przypisaniami do `forBlock` — podklasa dodałaby
 * warstwę, nie odbierając ani jednej z nich.
 */
type MutableGenerator = CodeGenerator & {
    quote_(text: string): string;
    multiline_quote_(text: string): string;
    scrubNakedValue(line: string): string;
    scrub_(block: Blockly.Block, code: string, thisOnly?: boolean): string;
    nameDB_?: Names;
    RESERVED_WORDS_?: string;
};

/** Dokłada `#include`; powtórzenia są scalane. */
type AddInclude = (header: string) => void;

/** Zapisuje definicję funkcji; powtórzona nazwa nadpisuje poprzednią. */
type AddFunction = (name: string, code: string) => void;

export function createCppGenerator(): CodeGenerator {
    const generator = new CodeGenerator('Cpp') as MutableGenerator;

    let includes = new Set<string>();
    const addInclude: AddInclude = (header) => { includes.add(header); };

    // Definicje funkcji zbierane osobno od reszty kodu: w C++ funkcja musi
    // stać przed miejscem, w którym się ją woła, a bloczek definicji może
    // leżeć na warsztacie gdziekolwiek.
    let functions = new Map<string, string>();
    const addFunction: AddFunction = (name, code) => { functions.set(name, code); };

    generator.INDENT = '  ';
    generator.addReservedWords(RESERVED);

    generator.init = function (this: MutableGenerator, workspace: Blockly.Workspace): void {
        includes = new Set<string>();
        functions = new Map<string, string>();
        if (!this.nameDB_) this.nameDB_ = new Names(this.RESERVED_WORDS_);
        else this.nameDB_.reset();
        this.nameDB_.setVariableMap(workspace.getVariableMap());
        this.nameDB_.populateVariables(workspace);
    };

    generator.finish = function (this: MutableGenerator, code: string): string {
        const header = [...includes].sort().map((h) => `#include <${h}>`).join('\n');
        // Kolejność definicji jest ta, w której bloczki wpadły do generatora.
        // Wzajemne wywołanie dwóch funkcji zwracających wartość wymaga więc
        // ręcznego ułożenia — deklaracja zapowiadająca nic by nie dała, bo
        // typu `auto` nie da się użyć przed poznaniem ciała funkcji.
        const defs = [...functions.values()].join('\n\n');
        this.nameDB_?.reset();
        return [header, defs, code].filter(Boolean).join('\n\n');
    };

    /** Wyrażenie w miejscu instrukcji — samo w sobie nic nie robi, więc odpada. */
    generator.scrubNakedValue = (line: string): string => `${line};\n`;

    generator.quote_ = (text: string): string =>
        `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

    generator.multiline_quote_ = function (this: MutableGenerator, text: string): string {
        return text.split('\n').map((l) => this.quote_(l)).join(' "\\n"\n');
    };

    /** Skleja bloczek z następnym w stosie i dokleja komentarze. */
    generator.scrub_ = function (this: MutableGenerator, block: Blockly.Block, code: string, thisOnly?: boolean): string {
        const next = block.nextConnection?.targetBlock();
        if (thisOnly || !next) return code;
        return code + this.blockToCode(next);
    };

    registerLogic(generator);
    registerLoops(generator);
    registerMath(generator, addInclude);
    registerText(generator, addInclude);
    registerVariables(generator);
    registerProcedures(generator, addFunction);

    return generator;
}

// ── Logika ───────────────────────────────────────────────────────────────────

function registerLogic(gen: MutableGenerator): void {
    gen.forBlock['controls_if'] = (block, g) => {
        let n = 0;
        let code = '';
        do {
            const condition = g.valueToCode(block, `IF${n}`, CppOrder.NONE) || 'false';
            const branch = g.statementToCode(block, `DO${n}`);
            code += `${n === 0 ? '' : ' else '}if (${condition}) {\n${branch}}`;
            n++;
        } while (block.getInput(`IF${n}`));
        if (block.getInput('ELSE')) {
            code += ` else {\n${g.statementToCode(block, 'ELSE')}}`;
        }
        return `${code}\n`;
    };

    const COMPARE: Record<string, [string, number]> = {
        EQ: ['==', CppOrder.EQUALITY], NEQ: ['!=', CppOrder.EQUALITY],
        LT: ['<', CppOrder.RELATIONAL], LTE: ['<=', CppOrder.RELATIONAL],
        GT: ['>', CppOrder.RELATIONAL], GTE: ['>=', CppOrder.RELATIONAL],
    };
    gen.forBlock['logic_compare'] = (block, g) => {
        const [op, order] = COMPARE[block.getFieldValue('OP')] ?? COMPARE['EQ'];
        const a = g.valueToCode(block, 'A', order) || '0';
        const b = g.valueToCode(block, 'B', order) || '0';
        return [`${a} ${op} ${b}`, order];
    };

    gen.forBlock['logic_operation'] = (block, g) => {
        const and = block.getFieldValue('OP') === 'AND';
        // `&&` i `||`, a nie `and`/`or`: te drugie są w C++ legalne, ale
        // w kodzie, który ma czytać człowiek znający C++, wyglądają obco.
        const op = and ? '&&' : '||';
        const order = and ? CppOrder.LOGICAL_AND : CppOrder.LOGICAL_OR;
        const a = g.valueToCode(block, 'A', order) || (and ? 'true' : 'false');
        const b = g.valueToCode(block, 'B', order) || (and ? 'true' : 'false');
        return [`${a} ${op} ${b}`, order];
    };

    gen.forBlock['logic_negate'] = (block, g) =>
        [`!${g.valueToCode(block, 'BOOL', CppOrder.UNARY) || 'true'}`, CppOrder.UNARY];

    gen.forBlock['logic_boolean'] = (block) =>
        [block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', CppOrder.ATOMIC];

    gen.forBlock['logic_null'] = () => ['nullptr', CppOrder.ATOMIC];

    gen.forBlock['logic_ternary'] = (block, g) => {
        const condition = g.valueToCode(block, 'IF', CppOrder.CONDITIONAL) || 'false';
        const then = g.valueToCode(block, 'THEN', CppOrder.CONDITIONAL) || 'nullptr';
        const other = g.valueToCode(block, 'ELSE', CppOrder.CONDITIONAL) || 'nullptr';
        return [`${condition} ? ${then} : ${other}`, CppOrder.CONDITIONAL];
    };
}

// ── Pętle ────────────────────────────────────────────────────────────────────

function registerLoops(gen: MutableGenerator): void {
    gen.forBlock['controls_repeat_ext'] = (block, g) => {
        const times = g.valueToCode(block, 'TIMES', CppOrder.NONE) || '0';
        const branch = g.statementToCode(block, 'DO');
        const i = g.nameDB_!.getDistinctName('i', Blockly.Names.NameType.VARIABLE);
        return `for (int ${i} = 0; ${i} < ${times}; ${i}++) {\n${branch}}\n`;
    };

    gen.forBlock['controls_whileUntil'] = (block, g) => {
        const until = block.getFieldValue('MODE') === 'UNTIL';
        const raw = g.valueToCode(block, 'BOOL', until ? CppOrder.UNARY : CppOrder.NONE) || 'false';
        const branch = g.statementToCode(block, 'DO');
        return `while (${until ? `!${raw}` : raw}) {\n${branch}}\n`;
    };

    gen.forBlock['controls_for'] = (block, g) => {
        const name = g.getVariableName(block.getFieldValue('VAR'));
        const from = g.valueToCode(block, 'FROM', CppOrder.ASSIGNMENT) || '0';
        const to = g.valueToCode(block, 'TO', CppOrder.NONE) || '0';
        const by = g.valueToCode(block, 'BY', CppOrder.NONE) || '1';
        const branch = g.statementToCode(block, 'DO');
        return `for (auto ${name} = ${from}; ${name} <= ${to}; ${name} += ${by}) {\n${branch}}\n`;
    };

    gen.forBlock['controls_forEach'] = (block, g) => {
        const name = g.getVariableName(block.getFieldValue('VAR'));
        const list = g.valueToCode(block, 'LIST', CppOrder.NONE) || '{}';
        const branch = g.statementToCode(block, 'DO');
        return `for (const auto& ${name} : ${list}) {\n${branch}}\n`;
    };

    gen.forBlock['controls_flow_statements'] = (block) =>
        block.getFieldValue('FLOW') === 'BREAK' ? 'break;\n' : 'continue;\n';
}

// ── Matematyka ───────────────────────────────────────────────────────────────

function registerMath(gen: MutableGenerator, addInclude: AddInclude): void {
    gen.forBlock['math_number'] = (block) => {
        const value = Number(block.getFieldValue('NUM'));
        // Liczba całkowita zapisana jako `3`, a nie `3.0`: druga postać
        // sugeruje typ zmiennoprzecinkowy, którego użytkownik nie wybierał.
        const text = Number.isInteger(value) ? String(value) : String(value);
        return [text, value < 0 ? CppOrder.UNARY : CppOrder.ATOMIC];
    };

    const ARITH: Record<string, [string, number]> = {
        ADD: ['+', CppOrder.ADDITIVE], MINUS: ['-', CppOrder.ADDITIVE],
        MULTIPLY: ['*', CppOrder.MULTIPLICATIVE], DIVIDE: ['/', CppOrder.MULTIPLICATIVE],
    };
    gen.forBlock['math_arithmetic'] = (block, g) => {
        const op = block.getFieldValue('OP');
        if (op === 'POWER') {
            // `^` w C++ to XOR bitowy. `2 ^ 3` kompiluje się i daje 1 —
            // najbardziej podstępna pułapka przy przenoszeniu bloczków z JS-a.
            addInclude('cmath');
            const a = g.valueToCode(block, 'A', CppOrder.NONE) || '0';
            const b = g.valueToCode(block, 'B', CppOrder.NONE) || '0';
            return [`std::pow(${a}, ${b})`, CppOrder.ATOMIC];
        }
        const [symbol, order] = ARITH[op] ?? ARITH['ADD'];
        const a = g.valueToCode(block, 'A', order) || '0';
        const b = g.valueToCode(block, 'B', order) || '0';
        return [`${a} ${symbol} ${b}`, order];
    };

    const SINGLE: Record<string, string> = {
        ROOT: 'std::sqrt', ABS: 'std::abs', LN: 'std::log', LOG10: 'std::log10',
        EXP: 'std::exp', SIN: 'std::sin', COS: 'std::cos', TAN: 'std::tan',
        ASIN: 'std::asin', ACOS: 'std::acos', ATAN: 'std::atan',
    };
    gen.forBlock['math_single'] = (block, g) => {
        const op = block.getFieldValue('OP');
        const arg = g.valueToCode(block, 'NUM', CppOrder.NONE) || '0';
        if (op === 'NEG') return [`-${arg}`, CppOrder.UNARY];
        if (op === 'POW10') {
            addInclude('cmath');
            return [`std::pow(10, ${arg})`, CppOrder.ATOMIC];
        }
        addInclude('cmath');
        return [`${SINGLE[op] ?? 'std::abs'}(${arg})`, CppOrder.ATOMIC];
    };

    gen.forBlock['math_round'] = (block, g) => {
        addInclude('cmath');
        const fn = { ROUND: 'std::round', ROUNDUP: 'std::ceil', ROUNDDOWN: 'std::floor' }[
            block.getFieldValue('OP') as string] ?? 'std::round';
        return [`${fn}(${g.valueToCode(block, 'NUM', CppOrder.NONE) || '0'})`, CppOrder.ATOMIC];
    };

    gen.forBlock['math_modulo'] = (block, g) => {
        const a = g.valueToCode(block, 'DIVIDEND', CppOrder.MULTIPLICATIVE) || '0';
        const b = g.valueToCode(block, 'DIVISOR', CppOrder.MULTIPLICATIVE) || '1';
        return [`${a} % ${b}`, CppOrder.MULTIPLICATIVE];
    };

    gen.forBlock['math_constrain'] = (block, g) => {
        addInclude('algorithm');
        const value = g.valueToCode(block, 'VALUE', CppOrder.NONE) || '0';
        const low = g.valueToCode(block, 'LOW', CppOrder.NONE) || '0';
        const high = g.valueToCode(block, 'HIGH', CppOrder.NONE) || '0';
        return [`std::min(std::max(${value}, ${low}), ${high})`, CppOrder.ATOMIC];
    };

    gen.forBlock['math_random_int'] = (block, g) => {
        addInclude('cstdlib');
        const from = g.valueToCode(block, 'FROM', CppOrder.NONE) || '0';
        const to = g.valueToCode(block, 'TO', CppOrder.NONE) || '0';
        return [`(${from} + std::rand() % ((${to}) - (${from}) + 1))`, CppOrder.ATOMIC];
    };

    gen.forBlock['math_number_property'] = (block, g) => {
        const value = g.valueToCode(block, 'NUMBER_TO_CHECK', CppOrder.MULTIPLICATIVE) || '0';
        switch (block.getFieldValue('PROPERTY')) {
            case 'EVEN': return [`${value} % 2 == 0`, CppOrder.EQUALITY];
            case 'ODD': return [`${value} % 2 != 0`, CppOrder.EQUALITY];
            case 'POSITIVE': return [`${value} > 0`, CppOrder.RELATIONAL];
            case 'NEGATIVE': return [`${value} < 0`, CppOrder.RELATIONAL];
            default: return [`${value} == 0`, CppOrder.EQUALITY];
        }
    };
}

// ── Tekst ────────────────────────────────────────────────────────────────────

function registerText(gen: MutableGenerator, addInclude: AddInclude): void {
    gen.forBlock['text'] = (block, g) =>
        // Cudzysłów podwójny: pojedynczy tworzy w C++ stałą **znakową**,
        // a `'abc'` jest wtedy liczbą o wartości zależnej od implementacji.
        [(g as MutableGenerator).quote_(block.getFieldValue('TEXT')), CppOrder.ATOMIC];

    gen.forBlock['text_join'] = (block, g) => {
        addInclude('string');
        const count = (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 0;
        if (count === 0) return ['std::string("")', CppOrder.ATOMIC];
        const parts: string[] = [];
        for (let i = 0; i < count; i++) parts.push(g.valueToCode(block, `ADD${i}`, CppOrder.ADDITIVE) || '""');
        return [`std::string(${parts[0]})${parts.slice(1).map((p) => ` + ${p}`).join('')}`, CppOrder.ADDITIVE];
    };

    gen.forBlock['text_append'] = (block, g) => {
        const name = g.getVariableName(block.getFieldValue('VAR'));
        const value = g.valueToCode(block, 'TEXT', CppOrder.ADDITIVE) || '""';
        return `${name} += ${value};\n`;
    };

    gen.forBlock['text_length'] = (block, g) =>
        [`${g.valueToCode(block, 'VALUE', CppOrder.ATOMIC) || '""'}.size()`, CppOrder.ATOMIC];

    gen.forBlock['text_isEmpty'] = (block, g) =>
        [`${g.valueToCode(block, 'VALUE', CppOrder.ATOMIC) || '""'}.empty()`, CppOrder.ATOMIC];

    gen.forBlock['text_print'] = (block, g) => {
        // Bez tego nagłówka kod nie kompiluje się, a komunikat wskazuje linię,
        // której użytkownik nie pisał.
        addInclude('iostream');
        const value = g.valueToCode(block, 'TEXT', CppOrder.NONE) || '""';
        return `std::cout << ${value} << std::endl;\n`;
    };
}

// ── Zmienne ──────────────────────────────────────────────────────────────────

function registerVariables(gen: MutableGenerator): void {
    // Zbiór zadeklarowanych trzymamy przy generatorze, a nie w module: dwa
    // edytory otwarte naraz mają własne generatory i nie mogą sobie nawzajem
    // „zjadać" deklaracji.
    const declaredOf = new WeakMap<object, Set<string>>();
    const declaredIn = (g: CodeGenerator): Set<string> => {
        let set = declaredOf.get(g);
        if (!set) { set = new Set<string>(); declaredOf.set(g, set); }
        return set;
    };

    const originalInit = gen.init.bind(gen);
    gen.init = function (workspace: Blockly.Workspace): void {
        declaredIn(this).clear();
        originalInit(workspace);
    };

    gen.forBlock['variables_get'] = (block, g) =>
        [g.getVariableName(block.getFieldValue('VAR')), CppOrder.ATOMIC];

    gen.forBlock['variables_set'] = (block, g) => {
        const name = g.getVariableName(block.getFieldValue('VAR'));
        const value = g.valueToCode(block, 'VALUE', CppOrder.ASSIGNMENT) || '0';
        const seen = declaredIn(g);
        if (seen.has(name)) return `${name} = ${value};\n`;
        seen.add(name);
        // `auto` przy pierwszym przypisaniu — patrz nagłówek pliku.
        return `auto ${name} = ${value};\n`;
    };

    gen.forBlock['math_change'] = (block, g) => {
        const name = g.getVariableName(block.getFieldValue('VAR'));
        const delta = g.valueToCode(block, 'DELTA', CppOrder.ADDITIVE) || '0';
        return `${name} += ${delta};\n`;
    };
}

// ── Funkcje ──────────────────────────────────────────────────────────────────

/**
 * Definicje i wywołania funkcji.
 *
 * ## Typy parametrów
 *
 * Bloczek definicji zna nazwy parametrów, ale o typach nie mówi nic — tak samo
 * jak przy zmiennych. Przy zmiennej wystarcza `auto` w miejscu przypisania;
 * przy parametrze `auto` to dopiero C++20, a repozytorium buduje pod starszy
 * standard. Stąd szablon: `template <typename T0> auto f(T0 a)` działa od C++11
 * i nie kłamie o typie, którego użytkownik nie podał.
 *
 * Funkcja bez wyniku dostaje `void` — czytelniejsze niż `auto` i pozwala użyć
 * gołego `return;` z bloczka wcześniejszego wyjścia.
 */
function registerProcedures(gen: MutableGenerator, addFunction: AddFunction): void {
    /** Nazwa funkcji przepuszczona przez słownik nazw (kolizje ze słowami kluczowymi). */
    const funcName = (g: CodeGenerator, raw: string): string =>
        (g as MutableGenerator).nameDB_?.getName(raw, Blockly.Names.NameType.PROCEDURE) ?? raw;

    const paramNames = (g: CodeGenerator, block: Blockly.Block): string[] =>
        (block as Blockly.Block & { getVars?: () => string[] }).getVars?.().map(
            (v) => (g as MutableGenerator).nameDB_?.getName(v, Blockly.Names.NameType.VARIABLE) ?? v,
        ) ?? [];

    const define = (block: Blockly.Block, g: CodeGenerator, hasReturn: boolean): null => {
        const name = funcName(g, block.getFieldValue('NAME'));
        const params = paramNames(g, block);
        const body = g.statementToCode(block, 'STACK');
        const returned = hasReturn ? g.valueToCode(block, 'RETURN', CppOrder.NONE) : '';
        const tail = returned ? `${g.INDENT}return ${returned};\n` : '';

        const template = params.length
            ? `template <${params.map((_, i) => `typename T${i}`).join(', ')}>\n`
            : '';
        const args = params.map((p, i) => `T${i} ${p}`).join(', ');
        const kind = hasReturn ? 'auto' : 'void';

        addFunction(name, `${template}${kind} ${name}(${args}) {\n${body}${tail}}`);
        // Definicja nie jest instrukcją w miejscu, w którym leży bloczek —
        // trafia do sekcji funkcji, a tu nie zostaje nic.
        return null;
    };

    gen.forBlock['procedures_defnoreturn'] = (block, g) => define(block, g, false);
    gen.forBlock['procedures_defreturn'] = (block, g) => define(block, g, true);

    const callArgs = (block: Blockly.Block, g: CodeGenerator): string => {
        const vars = (block as Blockly.Block & { getVars?: () => string[] }).getVars?.() ?? [];
        return vars
            .map((_, i) => g.valueToCode(block, `ARG${i}`, CppOrder.NONE) || 'nullptr')
            .join(', ');
    };

    gen.forBlock['procedures_callreturn'] = (block, g) =>
        [`${funcName(g, block.getFieldValue('NAME'))}(${callArgs(block, g)})`, CppOrder.ATOMIC];

    gen.forBlock['procedures_callnoreturn'] = (block, g) =>
        `${funcName(g, block.getFieldValue('NAME'))}(${callArgs(block, g)});\n`;

    gen.forBlock['procedures_ifreturn'] = (block, g) => {
        const condition = g.valueToCode(block, 'CONDITION', CppOrder.NONE) || 'false';
        // Czy wracamy z wartością, wynika z funkcji, w której bloczek siedzi.
        // Blockly trzyma to w `hasReturnValue_`, ale ustawia je dopiero
        // `onchange` — a to zależy od zdarzeń warsztatu, których przy samym
        // generowaniu nie ma. Odczytanie rodzica jest niezależne od zdarzeń.
        let parent = block.getSurroundParent();
        while (parent && !parent.type.startsWith('procedures_def')) parent = parent.getSurroundParent();
        const withValue = parent?.type === 'procedures_defreturn';
        const value = withValue ? ` ${g.valueToCode(block, 'VALUE', CppOrder.NONE) || '{}'}` : '';
        return `if (${condition}) {\n${g.INDENT}return${value};\n}\n`;
    };
}
