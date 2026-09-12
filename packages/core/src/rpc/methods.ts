import { z } from 'zod';
import { defineRpcMethod } from './types';

export const ping = defineRpcMethod({
  name: 'ping',
  description: 'Health check / connectivity test',
  tags: ['System'],
  input: z.object({
    echo: z.string().optional().describe('Optional string to echo back'),
  }),
  output: z.object({
    pong: z.literal(true),
    echo: z.string().optional(),
    timestamp: z.number().describe('Server timestamp in ms'),
    version: z.string().describe('API version'),
  }),
});

const telemetryMetricSchema = z.object({
  key: z.string(),
  value: z.union([z.number(), z.boolean(), z.string()]),
  unit: z.string().optional(),
});

export const getDeviceStatuses = defineRpcMethod({
  name: 'getDeviceStatuses',
  description: 'Get online/offline status of all IoT devices for a user',
  tags: ['IoT'],
  input: z.object({
    userName: z.string().describe('User name'),
  }),
  fieldMeta: {
    userName: { autocomplete: 'users' },
  },
  output: z.object({
    items: z.array(z.object({
      deviceId: z.string(),
      status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']),
      lastSeenAt: z.number().describe('Timestamp in ms'),
    })),
  }),
});

export const sendCommand = defineRpcMethod({
  name: 'sendCommand',
  description: 'Send a command to an IoT device',
  tags: ['IoT'],
  input: z.object({
    userName: z.string().describe('User name'),
    deviceName: z.string().describe('Device name'),
    commandName: z.string().describe('Command name'),
    payload: z.record(z.unknown()).optional().describe('Command payload'),
  }),
  fieldMeta: {
    userName: { autocomplete: 'users' },
    deviceName: { autocomplete: 'userDevices', dependsOn: 'userName' },
  },
  output: z.object({
    id: z.string(),
    deviceId: z.string(),
    name: z.string(),
    payload: z.record(z.unknown()),
    status: z.enum(['PENDING', 'SENT', 'ACKNOWLEDGED', 'FAILED', 'TIMEOUT']),
    createdAt: z.number(),
    resolvedAt: z.number().optional(),
    failureReason: z.string().optional(),
  }),
});

export const getLatestTelemetry = defineRpcMethod({
  name: 'getLatestTelemetry',
  description: 'Get the latest telemetry record for a device',
  tags: ['IoT'],
  input: z.object({
    userName: z.string().describe('User name'),
    deviceName: z.string().describe('Device name'),
  }),
  fieldMeta: {
    userName: { autocomplete: 'users' },
    deviceName: { autocomplete: 'userDevices', dependsOn: 'userName' },
  },
  output: z.object({
    deviceId: z.string(),
    userId: z.string(),
    timestamp: z.number(),
    metrics: z.array(telemetryMetricSchema),
    rssi: z.number().optional(),
    battery: z.number().optional(),
  }).nullable(),
});

export const rpcMethods = {
  ping,
  getDeviceStatuses,
  sendCommand,
  getLatestTelemetry,
} as const;

export type RpcMethodRegistry = typeof rpcMethods;
export type RpcMethodName = keyof RpcMethodRegistry;
