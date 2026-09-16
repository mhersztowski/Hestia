import { SubpathFS } from './SubpathFS';
import type { FileSystemProvider } from '@hestia/core';

function makeInner() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const rec =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
      return Promise.resolve(`${op}-result`);
    };
  const inner = {
    scheme: 'mock',
    capabilities: { readOnly: false } as unknown,
    onDidChangeFile: 'EVENT-TOKEN' as unknown,
    stat: rec('stat'),
    readDirectory: rec('readDirectory'),
    readFile: rec('readFile'),
    writeFile: rec('writeFile'),
    mkdir: rec('mkdir'),
    delete: rec('delete'),
    rename: rec('rename'),
  } as unknown as FileSystemProvider;
  return { inner, calls };
}

describe('SubpathFS', () => {
  it('inherits scheme, capabilities and change event from the inner provider', () => {
    const { inner } = makeInner();
    const fs = new SubpathFS(inner, '/base');
    expect(fs.scheme).toBe('mock');
    expect(fs.capabilities).toBe(inner.capabilities);
    expect(fs.onDidChangeFile).toBe(inner.onDidChangeFile);
  });

  it('prefixes normal paths', async () => {
    const { inner, calls } = makeInner();
    const fs = new SubpathFS(inner, '/base');
    await fs.readFile('/dir/file.txt');
    expect(calls[0]).toEqual({ op: 'readFile', args: ['/base/dir/file.txt'] });
  });

  it('maps root "/" to the bare prefix (no trailing slash)', async () => {
    const { inner, calls } = makeInner();
    const fs = new SubpathFS(inner, '/base');
    await fs.readDirectory('/');
    expect(calls[0]).toEqual({ op: 'readDirectory', args: ['/base'] });
  });

  it('prefixes both operands for rename', async () => {
    const { inner, calls } = makeInner();
    const fs = new SubpathFS(inner, '/base');
    await fs.rename('/a', '/b', { overwrite: true });
    expect(calls[0]).toEqual({ op: 'rename', args: ['/base/a', '/base/b', { overwrite: true }] });
  });

  it('forwards write content and options unchanged', async () => {
    const { inner, calls } = makeInner();
    const fs = new SubpathFS(inner, '/base');
    const content = new Uint8Array([1, 2, 3]);
    await fs.writeFile('/f', content, { create: true });
    expect(calls[0].op).toBe('writeFile');
    expect(calls[0].args[0]).toBe('/base/f');
    expect(calls[0].args[1]).toBe(content);
    expect(calls[0].args[2]).toEqual({ create: true });
  });

  it('delegates stat/mkdir/delete with the prefixed path', async () => {
    const { inner, calls } = makeInner();
    const fs = new SubpathFS(inner, '/root');
    await fs.stat('/x');
    await fs.mkdir('/y');
    await fs.delete('/z', { recursive: true });
    expect(calls.map((c) => [c.op, c.args[0]])).toEqual([
      ['stat', '/root/x'],
      ['mkdir', '/root/y'],
      ['delete', '/root/z'],
    ]);
  });
});
