/**
 * Testy analizy C++ — z naciskiem na to, co zawiesiło edytor.
 *
 * Regresja: wyrażenie rozpoznające definicje funkcji miało w liście
 * kwalifikatorów alternatywę pasującą do pustego napisu (`[[nodiscard\]]*`).
 * Cała grupa redukowała się przez to do `(?:\s+)*`, czyli do pytania „na ile
 * sposobów podzielić ciąg spacji na niepuste kawałki" — a to rośnie
 * wykładniczo. Wiersz wcięty głęboko i niepasujący do wzorca (zawinięty
 * warunek, zawinięta lista argumentów) zajmował sekundy, potem minuty,
 * w końcu tyle, że karta przeglądarki przestawała odpowiadać.
 *
 * Analiza chodzi na wątku interfejsu przy otwarciu pliku, więc nie było to
 * spowolnienie, tylko zawieszenie całej strony.
 */

import { describe, expect, it } from 'vitest';

import { parseCppSource } from './CppIntelliSensePlugin';

/** Ile czasu wolno zająć analizie jednego pliku. Realnie chodzi o 0–1 ms. */
const BUDGET_MS = 500;

describe('parseCppSource — odporność na wcięcia', () => {
    it('nie zapętla się na głęboko wciętym wierszu bez dopasowania', () => {
        // Kształt wprost z rzeczywistego pliku: zawinięty operator warunkowy,
        // którego kolejne człony stoją pod pierwszym.
        const source = [
            'void loop() {',
            '    const char* state = a.inTrial()   ? "trial"',
            '                      : b.stopped()   ? "faulted"',
            '                                      : "running";',
            '}',
        ].join('\n');

        const started = Date.now();
        parseCppSource(source, 'probe.cpp');
        expect(Date.now() - started).toBeLessThan(BUDGET_MS);
    });

    it('nie zapętla się przy wcięciu absurdalnie głębokim', () => {
        // Dwieście spacji to nie jest kod, jaki ktoś napisze — ale wykładniczy
        // nawrót nie potrzebuje realistycznego wejścia, tylko długiego.
        const source = `${' '.repeat(200)}: "x";`;

        const started = Date.now();
        parseCppSource(source, 'probe.cpp');
        expect(Date.now() - started).toBeLessThan(BUDGET_MS);
    });
});

describe('parseCppSource — rozpoznawanie symboli', () => {
    it('znajduje funkcje razem z kwalifikatorami', () => {
        const source = [
            'void setup() {}',
            'static Status configureScript() {}',
            '[[nodiscard]] int policz(int a) {}',
            'inline const char* nazwa() {}',
        ].join('\n');

        const names = parseCppSource(source).map((s) => s.name);
        expect(names).toContain('setup');
        expect(names).toContain('configureScript');
        expect(names).toContain('policz');
        expect(names).toContain('nazwa');
    });

    it('znajduje klasy, wyliczenia i makra', () => {
        const source = [
            '#define KROK_MS 50',
            'enum class Stan { Bezczynny, Praca };',
            'class Silnik {',
            'public:',
            '    void rusz() {}',
            '};',
        ].join('\n');

        const symbols = parseCppSource(source);
        const byName = new Map(symbols.map((s) => [s.name, s]));

        expect(byName.has('KROK_MS')).toBe(true);
        expect(byName.has('Stan')).toBe(true);
        expect(byName.get('Silnik')?.members?.map((m) => m.name)).toContain('rusz');
    });
});
