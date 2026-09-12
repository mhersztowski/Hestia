export interface MinisDeviceBuild {
  platform: string;  // e.g. 'arduino', 'cmake', 'platformio'
  fqbn?: string;     // e.g. 'esp32:esp32:esp32s3'
  version?: string;
  at: number;        // unix ms
  success: boolean;
  projectId?: string;
  sketchName?: string;
}

export interface MinisDeviceModel {
  type: 'device';
  id: string;
  name: string;
  deviceDefId: string;
  isAssembled: boolean;
  isIot: boolean;
  sn: string;
  description?: string;
  localizationId?: string;
  lastBuild?: MinisDeviceBuild;
}

export interface MinisDevicesModel {
  type: 'devices';
  devices: MinisDeviceModel[];
}

/**
 * A device asking to be added to the user's list.
 *
 * The device publishes it on `minis/{user}/{device}/register-request`, the
 * backend keeps it as pending, and the user accepts or rejects it in
 * Electronics -> Devices. A new client (firmware, desktop, mobile) therefore
 * needs no entry created by hand, but neither does it add itself.
 */
export interface DeviceRegistrationRequest {
  type: 'device-request';
  /** The name from the topic — the key of the request within one user. */
  deviceName: string;
  /** The name to show; absent = `deviceName`. */
  label?: string;
  kind?: 'firmware' | 'desktop' | 'mobile' | 'web' | 'service';
  sn?: string;
  description?: string;
  version?: string;
  address?: string;
  /** First request (ms). */
  requestedAt: number;
  /** Last repeat — a device asks again on every connection. */
  lastSeenAt: number;
}
