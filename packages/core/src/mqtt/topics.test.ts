import { describe, it, expect } from 'vitest';
import { mqttTopics, matchTopic, defineMqttTopic } from './topics';
import { z } from 'zod';

describe('mqtt topic registry', () => {
  it('every topic pattern starts with a known prefix and defines a schema', () => {
    for (const [name, def] of Object.entries(mqttTopics)) {
      expect(typeof def.pattern).toBe('string');
      expect(def.pattern.startsWith('minis/')).toBe(true);
      expect(def.payloadSchema).toBeDefined();
      expect(typeof def.description).toBe('string');
      expect(name).toBeTruthy();
    }
  });

  describe('defineMqttTopic', () => {
    it('returns the definition unchanged (identity helper)', () => {
      const def = defineMqttTopic({
        pattern: 'minis/{a}/x',
        description: 'test',
        direction: 'device→server',
        payloadSchema: z.object({ v: z.number() }),
      });
      expect(def.pattern).toBe('minis/{a}/x');
      expect(def.payloadSchema.safeParse({ v: 1 }).success).toBe(true);
    });
  });

  describe('payload schema validation', () => {
    it('telemetry accepts valid metrics array', () => {
      const res = mqttTopics.telemetry.payloadSchema.safeParse({
        metrics: [{ key: 'temp', value: 21.5, unit: '°C' }],
        timestamp: 123,
      });
      expect(res.success).toBe(true);
    });

    it('telemetry rejects a non-array metrics field', () => {
      const res = mqttTopics.telemetry.payloadSchema.safeParse({ metrics: 'nope' });
      expect(res.success).toBe(false);
    });

    it('commandAck restricts status to the allowed enum', () => {
      expect(mqttTopics.commandAck.payloadSchema.safeParse({ id: '1', status: 'ACKNOWLEDGED' }).success).toBe(true);
      expect(mqttTopics.commandAck.payloadSchema.safeParse({ id: '1', status: 'DONE' }).success).toBe(false);
    });

    it('status requires lastSeenAt', () => {
      expect(mqttTopics.status.payloadSchema.safeParse({ status: 'ONLINE' }).success).toBe(false);
      expect(mqttTopics.status.payloadSchema.safeParse({ status: 'ONLINE', lastSeenAt: 1 }).success).toBe(true);
    });

    it('hello validates entity types', () => {
      const ok = mqttTopics.hello.payloadSchema.safeParse({
        entities: [{ id: 'e1', type: 'sensor', name: 'Temp', unit: '°C' }],
        platform: 'web',
      });
      expect(ok.success).toBe(true);
      const bad = mqttTopics.hello.payloadSchema.safeParse({
        entities: [{ id: 'e1', type: 'unknown', name: 'X' }],
      });
      expect(bad.success).toBe(false);
    });

    it('extReq requires id and op', () => {
      expect(mqttTopics.extReq.payloadSchema.safeParse({ id: '1', op: 'stat', path: '/a' }).success).toBe(true);
      expect(mqttTopics.extReq.payloadSchema.safeParse({ op: 'stat' }).success).toBe(false);
    });

    it('twinDesired accepts arbitrary record payloads', () => {
      expect(mqttTopics.twinDesired.payloadSchema.safeParse({ any: 1, thing: 'x' }).success).toBe(true);
    });
  });

  describe('matchTopic', () => {
    it('matches telemetry and extracts params', () => {
      const m = matchTopic('minis/alice/esp32/telemetry');
      expect(m).not.toBeNull();
      expect(m!.name).toBe('telemetry');
      expect(m!.params).toEqual({ userName: 'alice', deviceName: 'esp32' });
    });

    it('distinguishes telemetry from telemetry/live by segment count', () => {
      expect(matchTopic('minis/alice/esp32/telemetry')!.name).toBe('telemetry');
      expect(matchTopic('minis/alice/esp32/telemetry/live')!.name).toBe('telemetryLive');
    });

    it('matches command vs command/ack', () => {
      expect(matchTopic('minis/bob/dev/command')!.name).toBe('command');
      expect(matchTopic('minis/bob/dev/command/ack')!.name).toBe('commandAck');
    });

    it('extracts extType from extension topics', () => {
      const m = matchTopic('minis/carol/dev/ext/vfs/req');
      expect(m!.name).toBe('extReq');
      expect(m!.params.extType).toBe('vfs');
    });

    it('returns null for unknown topics', () => {
      expect(matchTopic('foo/bar/baz')).toBeNull();
      expect(matchTopic('minis/only')).toBeNull();
    });
  });
});
