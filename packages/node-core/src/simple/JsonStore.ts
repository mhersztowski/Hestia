/**
 * A data store in a single JSON file.
 *
 * At the scale of household finances a database would be a burden with no
 * upside: a file can be opened in an editor, committed to git and copied with
 * `cp`. In exchange we have to take care of two things a database would handle
 * for us — and both are here:
 *
 *  • **atomic writes** — write to a sibling file and rename; an in-place write
 *    cut in half leaves the store holding half a JSON document, i.e. unreadable;
 *  • **queued changes** — two concurrent modifications read the same value and
 *    the second overwrites the result of the first.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { z } from 'zod';

export class JsonStore<S extends z.ZodType> {
    /** Tail of the change queue: each change waits for the previous one. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly file: string,
        private readonly schema: S,
        private readonly fallback: () => z.infer<S>,
    ) { }

    /**
     * Reads and validates the contents.
     *
     * A missing file is the initial state (first run), but a damaged file or one
     * that does not match the schema is an **error**: replacing such contents
     * with defaults would erase the data without a trace, and this is the only
     * copy.
     */
    async read(): Promise<z.infer<S>> {
        let text: string;
        try {
            text = await fs.readFile(this.file, 'utf8');
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return this.fallback();
            throw e;
        }
        let raw: unknown;
        try {
            raw = JSON.parse(text);
        } catch (e) {
            throw new Error(`Cannot read ${path.basename(this.file)}: ${(e as Error).message}`);
        }
        return this.schema.parse(raw) as z.infer<S>;
    }

    /** Writes the whole contents (after validating against the schema). */
    async write(data: z.infer<S>): Promise<z.infer<S>> {
        return this.queued(async () => {
            const validated = this.schema.parse(data) as z.infer<S>;
            await this.writeAtomically(validated);
            return validated;
        });
    }

    /** Reads, runs `change` over it and writes — with no window for a race. */
    async update(change: (data: z.infer<S>) => z.infer<S> | Promise<z.infer<S>>): Promise<z.infer<S>> {
        return this.queued(async () => {
            const current = await this.read();
            const next = this.schema.parse(await change(current)) as z.infer<S>;
            await this.writeAtomically(next);
            return next;
        });
    }

    private queued<T>(operation: () => Promise<T>): Promise<T> {
        // One operation failing must not block the queue for the next ones —
        // hence the `catch` on the tail, not on the result handed to the caller.
        const result = this.queue.then(operation, operation);
        this.queue = result.catch(() => undefined);
        return result;
    }

    private async writeAtomically(data: unknown): Promise<void> {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${process.pid}.tmp`;
        await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        await fs.rename(temporary, this.file);
    }
}
