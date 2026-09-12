import { AutomateFlowModel } from '@hestia/core';

// --- Automate (used by MqttServer, HttpUploadServer) ---

export interface ExecutionLog {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: 'running' | 'completed' | 'error' | 'skipped';
  startTime: number;
  endTime?: number;
  result?: unknown;
  error?: string;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
}

export interface NotificationEntry {
  message: string;
  severity: 'success' | 'info' | 'warning' | 'error';
  timestamp: number;
}

export interface ExecutionResult {
  success: boolean;
  executionLog: ExecutionLog[];
  logs: LogEntry[];
  notifications: NotificationEntry[];
  variables: Record<string, unknown>;
  error?: string;
}

export interface WebhookData {
  payload: unknown;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
}

export interface IAutomateService {
  executeFlow(flowId: string, inputVars?: Record<string, unknown>): Promise<ExecutionResult>;
  executeFromWebhook(flowId: string, nodeId: string, data: WebhookData): Promise<ExecutionResult>;
  getFlowById(id: string): AutomateFlowModel | undefined;
  getAllFlows(): AutomateFlowModel[];
  validateWebhookSecret(flowId: string, nodeId: string, token: string | undefined): boolean;
  getWebhookAllowedMethods(flowId: string, nodeId: string): string[] | null;
  reload(): Promise<void>;
}

// --- OCR (used by HttpUploadServer) ---

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface IOcrService {
  isAvailable(): boolean;
  processMultipleImages(images: string[]): Promise<OcrResult>;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

// --- Receipt Parser (used by HttpUploadServer) ---

export interface ParsedReceiptItem {
  name: string;
  quantity?: number;
  unit?: string;
  price: number;
  originalPrice?: number;
  discount?: number;
}

export interface ParsedReceipt {
  storeName?: string;
  date?: string;
  items: ParsedReceiptItem[];
  total?: number;
  currency: string;
}

export interface IReceiptParser {
  parse(text: string): ParsedReceipt;
}
