/**
 * Running a script from the drive, in the page that shows it.
 *
 * MyCastle had this inside the Drive page, wired to its own MQTT client, its
 * backend façade and its scene host. What is left here is what the feature
 * actually is: take the source, run it, and show what it printed — plus the
 * one thing that is easy to get wrong, which is **stopping** it.
 *
 * A script does not end when its last line does: it leaves timers behind, and
 * those keep printing into a console whose panel the reader has closed. So a
 * run is a session that owns every timer it started, and stopping it clears
 * them. Without that, "Stop" stops nothing visible and the output goes on.
 */

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ConsoleLine {
    level: ConsoleLevel;
    text: string;
}

type TimerId = ReturnType<typeof setTimeout>;

/** Everything one run holds, so that stopping it can let go of all of it. */
export interface ScriptSession {
    stopped: boolean;
    /** Timer handles, for clearing on stop. */
    timers: TimerId[];
}

export const MAX_CONSOLE_LINES = 500;

/**
 * One console argument as a line of text.
 *
 * An Error prints its message and not `{}`, which is what `JSON.stringify`
 * makes of it — and an error is the argument a reader most needs to read.
 */
export function formatConsoleArg(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        // Circular, or something that refuses to be serialised.
        return String(value);
    }
}

/**
 * Source with its ES `import` statements removed.
 *
 * `new Function` is not a module, so an `import` inside it is a syntax error
 * and the script fails before its first line runs. Dropping them leaves the
 * imported names undefined, which fails where they are used — a smaller and
 * more legible failure than one that points at line 1.
 */
export function stripImports(source: string): string {
    return source
        // `import … from '…'`, including multi-line brace lists
        .replace(/^\s*import\s+[\s\S]*?\s+from\s*['"][^'"]+['"]\s*;?\s*$/gm, '')
        // `import '…'` for its side effects
        .replace(/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
}

export interface RunOptions {
    /** Called for every line the script printed. */
    onLine(line: ConsoleLine): void;
}

export interface RunResult {
    /** True when timers are still pending — the session stays alive until Stop. */
    stillRunning: boolean;
}

/**
 * Runs JavaScript, with `console` and the timers pointed at this session.
 *
 * The source is expected to be JavaScript: TypeScript is transpiled by whoever
 * has a compiler — the editor — before it gets here.
 */
export async function runScript(
    source: string, session: ScriptSession, { onLine }: RunOptions,
): Promise<RunResult> {
    const push = (level: ConsoleLevel, args: unknown[]) => {
        if (session.stopped) return;
        onLine({ level, text: args.map(formatConsoleArg).join(' ') });
    };

    const sandboxConsole = {
        log: (...a: unknown[]) => push('log', a),
        info: (...a: unknown[]) => push('info', a),
        warn: (...a: unknown[]) => push('warn', a),
        error: (...a: unknown[]) => push('error', a),
        debug: (...a: unknown[]) => push('debug', a),
    };

    // Every timer the script starts is remembered, so Stop can clear it.
    const wrapTimer = (original: (handler: () => void, timeout?: number) => TimerId) =>
        (handler: () => void, timeout?: number) => {
            const id = original(handler, timeout);
            session.timers.push(id);
            return id;
        };

    // eslint-disable-next-line no-new-func
    const fn = new Function(
        'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        `"use strict";\nreturn (async () => {\n${stripImports(source)}\n})();`,
    );

    await fn(
        sandboxConsole,
        wrapTimer((handler, timeout) => globalThis.setTimeout(handler, timeout)),
        wrapTimer((handler, timeout) => globalThis.setInterval(handler, timeout)),
        (id: TimerId) => globalThis.clearTimeout(id),
        (id: TimerId) => globalThis.clearInterval(id),
    );

    return { stillRunning: !session.stopped && session.timers.length > 0 };
}

/** Clears what a session left behind. Safe to call on a session already stopped. */
export function stopScript(session: ScriptSession): void {
    session.stopped = true;
    for (const id of session.timers) {
        globalThis.clearTimeout(id);
        globalThis.clearInterval(id);
    }
    session.timers = [];
}

/** Whether running this file makes any sense. */
export function isRunnableScript(name: string): boolean {
    return /\.(js|mjs|cjs|ts)$/i.test(name);
}
