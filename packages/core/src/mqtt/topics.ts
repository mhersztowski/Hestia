import { z } from 'zod';

// --- Types ---

export type MqttDirection = 'device→server' | 'server→device' | 'server→client' | 'server→shared';

export interface MqttTopicDef<T extends z.ZodTypeAny = z.ZodTypeAny> {
  pattern: string;
  description: string;
  direction: MqttDirection;
  payloadSchema: T;
  tags?: string[];
}

export function defineMqttTopic<T extends z.ZodTypeAny>(
  def: MqttTopicDef<T>,
): MqttTopicDef<T> {
  return def;
}

export type MqttPayload<T extends MqttTopicDef> = z.infer<T['payloadSchema']>;

// --- Shared schemas ---

const telemetryMetricSchema = z.object({
  key: z.string(),
  value: z.union([z.number(), z.boolean(), z.string()]),
  unit: z.string().optional(),
});

// --- Topic definitions ---

export const telemetry = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/telemetry',
  description: 'Raw telemetry data from device',
  direction: 'device→server',
  tags: ['IoT', 'Telemetry'],
  payloadSchema: z.object({
    metrics: z.array(telemetryMetricSchema),
    timestamp: z.number().optional(),
    rssi: z.number().optional(),
    battery: z.number().optional(),
  }),
});

export const heartbeat = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/heartbeat',
  description: 'Device heartbeat (keep-alive). App instances include sessionId, intervalSec, isInteractive, context.',
  direction: 'device→server',
  tags: ['IoT', 'Presence'],
  payloadSchema: z.object({
    uptime: z.number().optional(),
    rssi: z.number().optional(),
    battery: z.number().optional(),
    // App-instance fields (web / mobile / desktop presence)
    sessionId: z.string().optional(),
    intervalSec: z.number().optional(),
    isInteractive: z.boolean().optional(),
    context: z.object({ type: z.string(), id: z.string().optional() }).optional(),
  }),
});

export const hello = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/hello',
  description: 'Device announces itself on connect with current state; server syncs extensions if different',
  direction: 'device→server',
  tags: ['IoT', 'Presence'],
  payloadSchema: z.object({
    uptime: z.number().optional(),
    extensions: z.array(z.object({
      type: z.string(),
      enabled: z.boolean(),
      options: z.record(z.unknown()).optional(),
    })).optional(),
    entities: z.array(z.object({
      id: z.string(),
      type: z.enum(['sensor', 'binary_sensor', 'switch', 'number', 'button', 'select']),
      name: z.string(),
      icon: z.string().optional(),
      deviceClass: z.string().optional(),
      // sensor
      unit: z.string().optional(),
      // binary_sensor
      onLabel: z.string().optional(),
      offLabel: z.string().optional(),
      // number
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
      // select
      options: z.array(z.string()).optional(),
    })).optional(),
    // App-instance fields (web / mobile / desktop presence)
    platform: z.enum(['web', 'mobile', 'desktop']).optional(),
    sessionId: z.string().optional(),
    label: z.string().optional(),
    userAgent: z.string().optional(),
  }),
});

export const command = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/command',
  description: 'Command sent to device',
  direction: 'server→device',
  tags: ['IoT', 'Command'],
  payloadSchema: z.object({
    id: z.string(),
    name: z.string(),
    payload: z.record(z.unknown()),
  }),
});

export const commandAck = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/command/ack',
  description: 'Device acknowledges or rejects a command',
  direction: 'device→server',
  tags: ['IoT', 'Command'],
  payloadSchema: z.object({
    id: z.string(),
    status: z.enum(['ACKNOWLEDGED', 'FAILED']),
    reason: z.string().optional(),
  }),
});

export const status = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/status',
  description: 'Device online/offline status change',
  direction: 'server→client',
  tags: ['IoT', 'Presence'],
  payloadSchema: z.object({
    status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']),
    lastSeenAt: z.number(),
  }),
});

export const telemetryLive = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/telemetry/live',
  description: 'Republished telemetry for frontend subscribers',
  direction: 'server→client',
  tags: ['IoT', 'Telemetry'],
  payloadSchema: z.object({
    deviceId: z.string(),
    userId: z.string(),
    timestamp: z.number(),
    metrics: z.array(telemetryMetricSchema),
    rssi: z.number().optional(),
    battery: z.number().optional(),
  }),
});

export const alert = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/alert',
  description: 'Alert triggered by telemetry rule evaluation',
  direction: 'server→client',
  tags: ['IoT', 'Alert'],
  payloadSchema: z.object({
    id: z.string(),
    ruleId: z.string(),
    deviceId: z.string(),
    userId: z.string(),
    severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']),
    title: z.string(),
    message: z.string(),
    triggeredAt: z.number(),
    metricSnapshot: telemetryMetricSchema.optional(),
  }),
});

export const sharedTelemetryLive = defineMqttTopic({
  pattern: 'minis/{targetUser}/shared/{ownerUser}/{deviceName}/telemetry/live',
  description: 'Telemetry forwarded to users with shared device access',
  direction: 'server→shared',
  tags: ['IoT', 'Telemetry', 'Sharing'],
  payloadSchema: z.object({
    deviceId: z.string(),
    userId: z.string(),
    timestamp: z.number(),
    metrics: z.array(telemetryMetricSchema),
    rssi: z.number().optional(),
    battery: z.number().optional(),
  }),
});

export const sharedStatus = defineMqttTopic({
  pattern: 'minis/{targetUser}/shared/{ownerUser}/{deviceName}/status',
  description: 'Device status forwarded to users with shared device access',
  direction: 'server→shared',
  tags: ['IoT', 'Presence', 'Sharing'],
  payloadSchema: z.object({
    status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']),
    lastSeenAt: z.number(),
  }),
});

// --- Extension topics ---

/** Request sent from server to device to perform an extension operation */
export const extReq = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/ext/{extType}/req',
  description: 'Extension request from server to device',
  direction: 'server→device',
  tags: ['IoT', 'Extension'],
  payloadSchema: z.object({
    /** Correlation ID — matched in the response */
    id: z.string(),
    /** Operation name, e.g. stat | readdir | readfile | writefile | delete | rename | mkdir */
    op: z.string(),
    /** Primary path argument */
    path: z.string().optional(),
    /** Secondary path (used by rename) */
    newPath: z.string().optional(),
    /** File content as base64 (used by writefile) */
    data: z.string().optional(),
    /** Operation options (create, overwrite, recursive, …) */
    options: z.record(z.unknown()).optional(),
  }),
});

/** Response sent from device to server with the result of an extension operation */
export const extRes = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/ext/{extType}/res',
  description: 'Extension response from device to server',
  direction: 'device→server',
  tags: ['IoT', 'Extension'],
  payloadSchema: z.object({
    /** Correlation ID matching the request */
    id: z.string(),
    ok: z.boolean(),
    /** Operation result (shape depends on op) */
    data: z.unknown().optional(),
    error: z.object({
      code: z.string(),
      message: z.string().optional(),
    }).optional(),
  }),
});

export const twinDesired = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/twin/desired',
  description: 'Server → device: push desired state on connect or when desired state changes',
  direction: 'server→device',
  tags: ['IoT', 'Twin'],
  payloadSchema: z.record(z.unknown()),
});

export const twinReported = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/twin/reported',
  description: 'Device → server: device reports its current state',
  direction: 'device→server',
  tags: ['IoT', 'Twin'],
  payloadSchema: z.record(z.unknown()),
});

export const registerRequest = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/register-request',
  description: 'A device asks to be added to the user\'s list; the request waits for acceptance in Electronics -> Devices',
  direction: 'device→server',
  tags: ['IoT', 'Presence'],
  payloadSchema: z.object({
    /** The name shown in the request panel; absent = `deviceName` from the topic. */
    label: z.string().optional(),
    /** The kind of client — it tells firmware apart from a desktop/mobile application. */
    kind: z.enum(['firmware', 'desktop', 'mobile', 'web', 'service']).optional(),
    /** Serial number (firmware injects `MINIS_DEVICE_SN`). */
    sn: z.string().optional(),
    description: z.string().optional(),
    /** Firmware/client version — it makes what is asking easier to recognise. */
    version: z.string().optional(),
    /** The IP/host the client sees — a help in identifying it. */
    address: z.string().optional(),
  }),
});

// --- Registry ---

export const mqttTopics = {
  telemetry,
  heartbeat,
  hello,
  registerRequest,
  command,
  commandAck,
  status,
  telemetryLive,
  alert,
  sharedTelemetryLive,
  sharedStatus,
  extReq,
  extRes,
  twinDesired,
  twinReported,
} as const;

export type MqttTopicRegistry = typeof mqttTopics;
export type MqttTopicName = keyof MqttTopicRegistry;

// --- Matching ---

/**
 * Match a concrete MQTT topic against registered patterns.
 * Pattern params use `{paramName}` syntax (e.g. `minis/{userName}/{deviceName}/telemetry`).
 * Returns the matched definition and extracted params, or null if no match.
 */
export function matchTopic(fullTopic: string): { name: MqttTopicName; def: MqttTopicDef; params: Record<string, string> } | null {
  const parts = fullTopic.split('/');

  for (const [name, def] of Object.entries(mqttTopics)) {
    const patternParts = def.pattern.split('/');
    if (patternParts.length !== parts.length) continue;

    const params: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      if (pp.startsWith('{') && pp.endsWith('}')) {
        params[pp.slice(1, -1)] = parts[i];
      } else if (pp !== parts[i]) {
        matched = false;
        break;
      }
    }

    if (matched) return { name: name as MqttTopicName, def, params };
  }

  return null;
}
