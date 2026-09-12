import { describe, it, expect } from 'vitest';
import { isOnline, recordReading, register, withPresence, PRESENCE_THRESHOLD_MS, type DeviceRegistry } from './devices';

const empty: DeviceRegistry = { devices: [] };

describe('device registry', () => {
    it('registers a new device', () => {
        expect(register(empty, 'sensor-1', 'Living room').devices).toEqual([
            { deviceName: 'sensor-1', label: 'Living room', lastSeen: 0, metrics: {} },
        ]);
    });

    it('registering again does not create a duplicate', () => {
        const r = register(register(empty, 'sensor-1', 'Living room'), 'sensor-1', 'Living room');
        expect(r.devices).toHaveLength(1);
    });

    it('an empty label does not erase a name given by hand', () => {
        // After a restart a device announces itself with the technical name only.
        const r = register(register(empty, 'sensor-1', 'Living room'), 'sensor-1');
        expect(r.devices[0].label).toBe('Living room');
    });

    it('a reading from an unknown device adds it instead of being lost', () => {
        const r = recordReading(empty, 'newcomer', { temperature: 21.5 }, 1000);
        expect(r.devices).toEqual([
            { deviceName: 'newcomer', label: '', lastSeen: 1000, metrics: { temperature: 21.5 } },
        ]);
    });

    it('later readings add metrics rather than replacing them all', () => {
        let r = recordReading(empty, 'a', { temperature: 21 }, 1000);
        r = recordReading(r, 'a', { humidity: 55 }, 2000);
        expect(r.devices[0].metrics).toEqual({ temperature: 21, humidity: 55 });
        expect(r.devices[0].lastSeen).toBe(2000);
    });

    it('presence is computed from the time of the last signal', () => {
        // A stored "online" field would stay forever on a device that vanished
        // without saying goodbye — and that is how most of them vanish.
        const d = { deviceName: 'a', label: '', lastSeen: 1_000_000, metrics: {} };
        expect(isOnline(d, 1_000_000 + PRESENCE_THRESHOLD_MS - 1)).toBe(true);
        expect(isOnline(d, 1_000_000 + PRESENCE_THRESHOLD_MS + 1)).toBe(false);
    });

    it('a device that never spoke is not online', () => {
        expect(isOnline({ deviceName: 'a', label: '', lastSeen: 0, metrics: {} })).toBe(false);
    });

    it('the list shows online devices first', () => {
        let r = recordReading(empty, 'stale', { t: 1 }, 0);
        r = recordReading(r, 'alive', { t: 2 }, 1_000_000);
        expect(withPresence(r, 1_000_000).map((d) => d.deviceName)).toEqual(['alive', 'stale']);
    });
});
