// filesystem
export { FileSystem } from './filesystem/FileSystem';
export type { FileData, BinaryFileData, DirectoryTree, FileChangeEvent, DirinfoData, DirinfoFile, DirinfoFileComponent } from './filesystem/FileSystem';

// datasource
export { DataSource } from './datasource/DataSource';

// httpserver
export { HttpUploadServer } from './httpserver/HttpUploadServer';

// mqttserver
export { MqttServer } from './mqttserver/MqttServer';
export type { MqttMessageHandler, MqttAuthenticateFn } from './mqttserver/MqttServer';
export { Client } from './mqttserver/Client';
export { Packet } from './mqttserver/packets/Packet';
export type { PacketData } from './mqttserver/packets/Packet';
export { FileReadPacket } from './mqttserver/packets/FileReadPacket';
export { FileWritePacket } from './mqttserver/packets/FileWritePacket';
export { FileDeletePacket } from './mqttserver/packets/FileDeletePacket';
export { FileListPacket } from './mqttserver/packets/FileListPacket';
export { FileWriteBinaryPacket } from './mqttserver/packets/FileWriteBinaryPacket';
export { FileReadBinaryPacket } from './mqttserver/packets/FileReadBinaryPacket';
export { FileChangedPacket } from './mqttserver/packets/FileChangedPacket';
export { AutomateRunPacket } from './mqttserver/packets/AutomateRunPacket';
export { ResponsePacket } from './mqttserver/packets/ResponsePacket';
export { ErrorPacket } from './mqttserver/packets/ErrorPacket';

// auth
export { PasswordService, JwtService, ApiKeyService, extractBearerToken, checkAuth } from './auth/index';

// rpc
export { RpcRouter } from './rpc/index';
export type { RpcHandler, RpcContext } from './rpc/index';

// scripts
export { ScriptsService } from './scripts/ScriptsService';
export type { ScriptInfo, RunResult } from './scripts/ScriptsService';

// interfaces
export type {
  IAutomateService,
  IOcrService,
  IReceiptParser,
  ExecutionResult,
  ExecutionLog,
  LogEntry,
  NotificationEntry,
  WebhookData,
  OcrResult,
  ParsedReceipt,
  ParsedReceiptItem,
} from './interfaces';

/*
 * Hestia's own part — a lightweight HTTP server and a JSON file store.
 * The rest of this directory is a verbatim copy of the MyCastle base.
 */
export * from './simple';
