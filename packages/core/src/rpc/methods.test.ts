import { describe, it, expect } from 'vitest';
import { rpcMethods } from './methods';
import { defineRpcMethod } from './types';
import { z } from 'zod';

describe('rpc methods', () => {
  it('registry names match the method definitions', () => {
    for (const [key, def] of Object.entries(rpcMethods)) {
      expect(def.name).toBe(key);
      expect(def.input).toBeDefined();
      expect(def.output).toBeDefined();
    }
  });

  describe('defineRpcMethod', () => {
    it('returns definition unchanged', () => {
      const def = defineRpcMethod({
        name: 'x',
        input: z.object({ a: z.number() }),
        output: z.object({ b: z.string() }),
      });
      expect(def.name).toBe('x');
      expect(def.input.safeParse({ a: 1 }).success).toBe(true);
    });
  });

  describe('ping', () => {
    it('accepts empty input (echo optional)', () => {
      expect(rpcMethods.ping.input.safeParse({}).success).toBe(true);
      expect(rpcMethods.ping.input.safeParse({ echo: 'hi' }).success).toBe(true);
    });

    it('output requires pong=true literal, timestamp and version', () => {
      const ok = rpcMethods.ping.output.safeParse({ pong: true, timestamp: 1, version: '1' });
      expect(ok.success).toBe(true);
      expect(rpcMethods.ping.output.safeParse({ pong: false, timestamp: 1, version: '1' }).success).toBe(false);
      expect(rpcMethods.ping.output.safeParse({ pong: true, version: '1' }).success).toBe(false);
    });
  });

  describe('getDeviceStatuses', () => {
    it('requires userName', () => {
      expect(rpcMethods.getDeviceStatuses.input.safeParse({ userName: 'a' }).success).toBe(true);
      expect(rpcMethods.getDeviceStatuses.input.safeParse({}).success).toBe(false);
    });

    it('validates status enum in output items', () => {
      expect(
        rpcMethods.getDeviceStatuses.output.safeParse({
          items: [{ deviceId: 'd', status: 'ONLINE', lastSeenAt: 1 }],
        }).success,
      ).toBe(true);
      expect(
        rpcMethods.getDeviceStatuses.output.safeParse({
          items: [{ deviceId: 'd', status: 'BOGUS', lastSeenAt: 1 }],
        }).success,
      ).toBe(false);
    });

    it('exposes autocomplete field metadata', () => {
      expect(rpcMethods.getDeviceStatuses.fieldMeta?.userName?.autocomplete).toBe('users');
    });
  });

  describe('sendCommand', () => {
    it('requires userName, deviceName and commandName', () => {
      expect(
        rpcMethods.sendCommand.input.safeParse({ userName: 'a', deviceName: 'd', commandName: 'on' }).success,
      ).toBe(true);
      expect(rpcMethods.sendCommand.input.safeParse({ userName: 'a' }).success).toBe(false);
    });

    it('deviceName autocomplete depends on userName', () => {
      expect(rpcMethods.sendCommand.fieldMeta?.deviceName?.dependsOn).toBe('userName');
    });
  });

  describe('getLatestTelemetry', () => {
    it('output can be null', () => {
      expect(rpcMethods.getLatestTelemetry.output.safeParse(null).success).toBe(true);
    });

    it('validates a full telemetry record', () => {
      const res = rpcMethods.getLatestTelemetry.output.safeParse({
        deviceId: 'd',
        userId: 'u',
        timestamp: 1,
        metrics: [{ key: 'x', value: 1 }],
      });
      expect(res.success).toBe(true);
    });
  });
});
