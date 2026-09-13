/**
 * generators.ts — generator kodu dla dialektu, ładowany na żądanie.
 *
 * Generatory Blockly'ego to osobne wejścia pakietu (`blockly/javascript`,
 * `blockly/python`, …), każde z własnym kompletem funkcji dla wszystkich
 * bloczków standardowych. Wciągnięcie wszystkich naraz oznaczałoby doliczenie
 * ich do paczki edytora niezależnie od tego, czy ktoś kiedykolwiek otworzy plik
 * w Lui — stąd import dynamiczny i pamięć podręczna na wynik.
 */

import type { CodeGenerator } from 'blockly';

import type { GeneratorKind, LanguageDialect } from './dialects';
import { createCppGenerator } from './cppGenerator';

const cache = new Map<GeneratorKind, CodeGenerator>();

export async function generatorFor(dialect: LanguageDialect): Promise<CodeGenerator> {
    const cached = cache.get(dialect.generator);
    if (cached) return cached;

    const generator = await load(dialect.generator);
    cache.set(dialect.generator, generator);
    return generator;
}

/**
 * Rzutowanie na typ bazowy — świadome i konieczne.
 *
 * `PythonGenerator` i pozostałe **nie są** przypisywalne do `CodeGenerator`
 * mimo dziedziczenia: pole `forBlock` jest mapą funkcji przyjmujących konkretny
 * generator, a TypeScript sprawdza parametry przeciwzmiennie. Klasa pochodna
 * wychodzi więc „węższa" niż bazowa, choć w każdym praktycznym sensie nią jest.
 * Rzutowanie zamyka to w jednym miejscu, zamiast rozlewać `any` po wszystkich
 * wywołaniach.
 */
const asBase = (g: unknown): CodeGenerator => g as CodeGenerator;

async function load(kind: GeneratorKind): Promise<CodeGenerator> {
    switch (kind) {
        // Własny — Blockly nie dostarcza generatora C++ (patrz `cppGenerator.ts`).
        case 'cpp': return createCppGenerator();
        case 'python': return asBase((await import('blockly/python')).pythonGenerator);
        case 'php': return asBase((await import('blockly/php')).phpGenerator);
        case 'lua': return asBase((await import('blockly/lua')).luaGenerator);
        case 'dart': return asBase((await import('blockly/dart')).dartGenerator);
        default: return asBase((await import('blockly/javascript')).javascriptGenerator);
    }
}
