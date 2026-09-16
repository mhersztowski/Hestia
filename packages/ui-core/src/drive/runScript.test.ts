import { describe, it, expect, vi } from 'vitest';
import {
  formatConsoleArg,
  isRunnableScript,
  runScript,
  stopScript,
  stripImports,
  type ConsoleLine,
  type ScriptSession,
} from './runScript';

const session = (): ScriptSession => ({ stopped: false, timers: [] });

describe('what a console line says', () => {
  it('passes a string through', () => {
    expect(formatConsoleArg('gotowe')).toBe('gotowe');
  });

  /** `JSON.stringify(new Error('x'))` is `{}` — and the error is the one thing worth reading. */
  it('prints an error rather than an empty object', () => {
    expect(formatConsoleArg(new TypeError('zła wartość'))).toBe('TypeError: zła wartość');
  });

  it('survives something that cannot be serialised', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => formatConsoleArg(circular)).not.toThrow();
  });
});

describe('imports', () => {
  /** `new Function` is not a module: an `import` in it fails before line one runs. */
  it('are removed, including a multi-line list of names', () => {
    const out = stripImports(
      [
        "import { a } from 'x';",
        'import {',
        '  b,',
        '  c,',
        "} from 'y';",
        "import 'side-effect';",
        'console.log(1);',
      ].join('\n')
    );

    expect(out).not.toMatch(/import/);
    expect(out).toContain('console.log(1)');
  });

  it('leaves the word alone where it is not a statement', () => {
    expect(stripImports("const s = 'import this';")).toContain("'import this'");
  });
});

describe('running', () => {
  it('collects what the script printed', async () => {
    const lines: ConsoleLine[] = [];
    await runScript("console.log('a'); console.error('b');", session(), {
      onLine: (l) => lines.push(l),
    });

    expect(lines).toEqual([
      { level: 'log', text: 'a' },
      { level: 'error', text: 'b' },
    ]);
  });

  it('awaits the script', async () => {
    const lines: ConsoleLine[] = [];
    await runScript(
      "await new Promise((r) => setTimeout(r, 1)); console.log('po czekaniu');",
      session(),
      { onLine: (l) => lines.push(l) }
    );
    expect(lines.map((l) => l.text)).toContain('po czekaniu');
  });

  it('reports a script that left a timer behind as still running', async () => {
    const s = session();
    const result = await runScript('setInterval(() => {}, 1000);', s, { onLine: () => {} });
    expect(result.stillRunning).toBe(true);
    stopScript(s);
  });

  it('a script that finished is not still running', async () => {
    const result = await runScript("console.log('koniec');", session(), { onLine: () => {} });
    expect(result.stillRunning).toBe(false);
  });

  it('lets an error out, so the caller can print it', async () => {
    await expect(
      runScript("throw new Error('bum');", session(), { onLine: () => {} })
    ).rejects.toThrow('bum');
  });
});

describe('stopping', () => {
  /**
   * The point of the session: a stopped script must stop printing. Without
   * this a leftover interval writes into a console whose panel is closed.
   */
  it('silences output from a timer that fires after the stop', async () => {
    vi.useFakeTimers();
    const lines: ConsoleLine[] = [];
    const s = session();
    try {
      await runScript("setTimeout(() => console.log('spóźnione'), 50);", s, {
        onLine: (l) => lines.push(l),
      });
      stopScript(s);
      vi.advanceTimersByTime(100);
      expect(lines).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('can be called twice', () => {
    const s = session();
    stopScript(s);
    expect(() => stopScript(s)).not.toThrow();
  });
});

describe('which files offer to run', () => {
  it('takes js and ts', () => {
    for (const name of ['a.js', 'a.mjs', 'a.cjs', 'a.ts', 'A.JS']) {
      expect(isRunnableScript(name), name).toBe(true);
    }
  });

  it('leaves everything else alone', () => {
    for (const name of ['a.json', 'a.md', 'a.tsx', 'typescript.txt']) {
      expect(isRunnableScript(name), name).toBe(false);
    }
  });
});
