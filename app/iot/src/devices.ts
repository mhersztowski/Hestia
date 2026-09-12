/**
 * The device registry — pure logic, no I/O.
 *
 * The state is kept by the platform (a file in the VFS); here there are only
 * the rules: what a device looks like, when it is online and what an incoming
 * reading means.
 */

import { z } from 'zod';

export const Device = z.object({
    /** The device name is the **key** — the same as in MQTT and in the registries. */
    deviceName: z.string().min(1),
    label: z.string().default(''),
    /** Last "I am here" in epoch milliseconds; 0 = it never spoke. */
    lastSeen: z.number().default(0),
    /** Latest readings: quantity name → value. */
    metrics: z.record(z.number()).default({}),
    /** API key authenticating the device in MQTT (the hash, not the key itself). */
    apiKeyHash: z.string().optional(),
});
export type Device = z.infer<typeof Device>;

export const DeviceRegistry = z.object({
    devices: z.array(Device).default([]),
});
export type DeviceRegistry = z.infer<typeof DeviceRegistry>;

/** After how many milliseconds of silence a device counts as absent. */
export const PRESENCE_THRESHOLD_MS = 90_000;

/**
 * Whether a device is online.
 *
 * Computed from the time of the last signal rather than stored as a field: a
 * stored "online" state stays forever when a device disappears without saying
 * goodbye — and that is the most common way they disappear.
 */
export function isOnline(d: Device, now = Date.now()): boolean {
    return d.lastSeen > 0 && now - d.lastSeen <= PRESENCE_THRESHOLD_MS;
}

/** Adds a device or updates an existing one — by name. */
export function register(registry: DeviceRegistry, deviceName: string, label = ''): DeviceRegistry {
    const existing = registry.devices.find((d) => d.deviceName === deviceName);
    if (existing) {
        return {
            devices: registry.devices.map((d) => d.deviceName === deviceName
                // An empty label from registration does not erase one named by hand earlier.
                ? { ...d, label: label || d.label }
                : d),
        };
    }
    return { devices: [...registry.devices, Device.parse({ deviceName, label })] };
}

/**
 * Records a reading.
 *
 * An unknown device is **added** rather than rejected: telemetry from a sensor
 * nobody registered is the information that such a sensor exists — and once
 * rejected it is lost along with whatever it had to say.
 */
export function recordReading(
    registry: DeviceRegistry, deviceName: string, metrics: Record<string, number>, now = Date.now(),
): DeviceRegistry {
    const withDevice = register(registry, deviceName);
    return {
        devices: withDevice.devices.map((d) => d.deviceName === deviceName
            ? { ...d, lastSeen: now, metrics: { ...d.metrics, ...metrics } }
            : d),
    };
}

/** Devices with presence computed — ordered with the online ones first. */
export function withPresence(registry: DeviceRegistry, now = Date.now()): Array<Device & { online: boolean }> {
    return registry.devices
        .map((d) => ({ ...d, online: isOnline(d, now) }))
        .sort((a, b) => Number(b.online) - Number(a.online) || a.deviceName.localeCompare(b.deviceName));
}
