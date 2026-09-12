import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IotDeviceVfsExtension } from './IotDeviceVfsExtension';
import { MemoryFS } from '../../vfs/MemoryFS';

const RES_TOPIC = 'minis/alice/device/ext/vfs/res';

function b64(text: string): string {
  return btoa(text);
}
function fromB64(text: string): string {
  return atob(text);
}

describe('IotDeviceVfsExtension', () => {
  let fs: MemoryFS;
  let published: Array<{ topic: string; payload: any }>;
  let ext: IotDeviceVfsExtension;

  beforeEach(() => {
    fs = new MemoryFS();
    published = [];
    ext = new IotDeviceVfsExtension({
      provider: fs,
      publishFn: (topic, payload) => published.push({ topic, payload: JSON.parse(payload) }),
      resTopic: RES_TOPIC,
    });
  });

  const lastRes = () => published[published.length - 1].payload;

  it('exposes type "vfs"', () => {
    expect(ext.type).toBe('vfs');
  });

  it('ignores invalid request payloads (schema failure)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ext.handleRequest({ nope: true });
    expect(published).toHaveLength(0);
    warn.mockRestore();
  });

  it('writefile then readfile round-trips content via base64', async () => {
    await ext.handleRequest({ id: 'w1', op: 'writefile', path: '/hello.txt', data: b64('hi there') });
    let res = lastRes();
    expect(res).toEqual({ id: 'w1', ok: true, data: {} });
    expect(published[published.length - 1].topic).toBe(RES_TOPIC);

    await ext.handleRequest({ id: 'r1', op: 'readfile', path: '/hello.txt' });
    res = lastRes();
    expect(res.ok).toBe(true);
    expect(fromB64(res.data.data)).toBe('hi there');
  });

  it('stat returns file metadata', async () => {
    await ext.handleRequest({ id: 'w', op: 'writefile', path: '/a.txt', data: b64('abc') });
    await ext.handleRequest({ id: 's', op: 'stat', path: '/a.txt' });
    const res = lastRes();
    expect(res.ok).toBe(true);
    expect(res.data.size).toBe(3);
  });

  it('readdir lists directory entries', async () => {
    await ext.handleRequest({ id: '1', op: 'writefile', path: '/dir/a.txt', data: b64('a') });
    await ext.handleRequest({ id: '2', op: 'writefile', path: '/dir/b.txt', data: b64('b') });
    await ext.handleRequest({ id: '3', op: 'readdir', path: '/dir' });
    const res = lastRes();
    expect(res.ok).toBe(true);
    const names = res.data.entries.map((e: any) => e.name).sort();
    expect(names).toEqual(['a.txt', 'b.txt']);
  });

  it('mkdir creates a directory', async () => {
    await ext.handleRequest({ id: 'm', op: 'mkdir', path: '/newdir' });
    expect(lastRes().ok).toBe(true);
    const stat = await fs.stat('/newdir');
    expect(stat.type).toBeDefined();
  });

  it('delete removes a file', async () => {
    await ext.handleRequest({ id: 'w', op: 'writefile', path: '/gone.txt', data: b64('x') });
    await ext.handleRequest({ id: 'd', op: 'delete', path: '/gone.txt' });
    expect(lastRes().ok).toBe(true);
    await expect(fs.stat('/gone.txt')).rejects.toThrow();
  });

  it('rename moves a file', async () => {
    await ext.handleRequest({ id: 'w', op: 'writefile', path: '/old.txt', data: b64('x') });
    await ext.handleRequest({ id: 'r', op: 'rename', path: '/old.txt', newPath: '/new.txt' });
    expect(lastRes().ok).toBe(true);
    await expect(fs.stat('/old.txt')).rejects.toThrow();
    expect((await fs.stat('/new.txt')).size).toBe(1);
  });

  it('responds with an error for unknown operations', async () => {
    await ext.handleRequest({ id: 'x', op: 'nonsense' });
    const res = lastRes();
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('Unknown');
  });

  it('responds with an error when a required path is missing', async () => {
    await ext.handleRequest({ id: 'x', op: 'stat' });
    const res = lastRes();
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('Unknown');
  });

  it('surfaces VfsError codes (reading a missing file)', async () => {
    await ext.handleRequest({ id: 'x', op: 'readfile', path: '/missing.txt' });
    const res = lastRes();
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('FileNotFound');
  });

  it('rename without newPath errors', async () => {
    await ext.handleRequest({ id: 'w', op: 'writefile', path: '/o.txt', data: b64('x') });
    await ext.handleRequest({ id: 'r', op: 'rename', path: '/o.txt' });
    const res = lastRes();
    expect(res.ok).toBe(false);
  });
});
