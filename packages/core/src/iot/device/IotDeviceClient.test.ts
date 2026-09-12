import { describe, it, expect, vi } from 'vitest';
import { IotDeviceClient } from './IotDeviceClient';
import type { IotDeviceExtension } from './IotDeviceExtension';

function makeExt(type: string) {
  const handleRequest = vi.fn();
  const ext: IotDeviceExtension = { type, handleRequest };
  return { ext, handleRequest };
}

describe('IotDeviceClient', () => {
  const opts = { topicPrefix: 'minis/alice/device', publishFn: vi.fn() };

  it('addExtension is chainable and routes matching requests', () => {
    const client = new IotDeviceClient(opts);
    const { ext, handleRequest } = makeExt('vfs');
    expect(client.addExtension(ext)).toBe(client);

    client.handleMessage('ext/vfs/req', JSON.stringify({ id: '1', op: 'stat' }));
    expect(handleRequest).toHaveBeenCalledTimes(1);
    expect(handleRequest).toHaveBeenCalledWith({ id: '1', op: 'stat' });
  });

  it('does not route to a removed extension', () => {
    const client = new IotDeviceClient(opts);
    const { ext, handleRequest } = makeExt('vfs');
    client.addExtension(ext);
    expect(client.removeExtension('vfs')).toBe(client);
    client.handleMessage('ext/vfs/req', '{"id":"1","op":"stat"}');
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('ignores non-extension sub-topics', () => {
    const client = new IotDeviceClient(opts);
    const { ext, handleRequest } = makeExt('vfs');
    client.addExtension(ext);
    client.handleMessage('telemetry', '{}');
    client.handleMessage('ext/vfs/res', '{}'); // res, not req
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('ignores malformed ext topics (wrong segment count)', () => {
    const client = new IotDeviceClient(opts);
    const { ext, handleRequest } = makeExt('vfs');
    client.addExtension(ext);
    client.handleMessage('ext/vfs/extra/req', '{}');
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('warns and skips when no extension is registered for the type', () => {
    const client = new IotDeviceClient(opts);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    client.handleMessage('ext/unknown/req', '{"id":"1"}');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns and skips on invalid JSON payloads', () => {
    const client = new IotDeviceClient(opts);
    const { ext, handleRequest } = makeExt('vfs');
    client.addExtension(ext);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    client.handleMessage('ext/vfs/req', '{not json');
    expect(handleRequest).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('extResTopic builds the full response topic', () => {
    const client = new IotDeviceClient(opts);
    expect(client.extResTopic('vfs')).toBe('minis/alice/device/ext/vfs/res');
  });
});
