import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { FileSystem, BinaryFileData } from '../filesystem/FileSystem';
import type { IOcrService, IAutomateService, IReceiptParser, ExecutionResult, ParsedReceipt } from '../interfaces';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';

// 500 MB — covers phone video uploads from the Drive UI. The /upload
// endpoint streams chunks straight to disk, so memory pressure is bounded
// by node's network buffer, not the file size itself.
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_OCR_BODY_SIZE = 30 * 1024 * 1024; // 30MB for multiple images

interface UploadResult {
  success: boolean;
  data?: BinaryFileData;
  error?: string;
}

interface OcrResponse {
  success: boolean;
  text?: string;
  parsed?: ParsedReceipt;
  confidence?: number;
  error?: string;
}

interface WebhookResponse {
  success: boolean;
  flowId?: string;
  nodeId?: string;
  executionTime?: number;
  result?: ExecutionResult;
  error?: string;
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
};

const STATIC_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
};

export class HttpUploadServer {
  protected server: Server;
  private port: number;
  protected fileSystem: FileSystem;
  private ocrService?: IOcrService;
  private automateService?: IAutomateService;
  private receiptParser?: IReceiptParser;
  private staticDir: string | null;

  constructor(port: number, fileSystem: FileSystem, ocrService?: IOcrService, automateService?: IAutomateService, receiptParser?: IReceiptParser, staticDir?: string) {
    this.port = port;
    this.fileSystem = fileSystem;
    this.ocrService = ocrService;
    this.automateService = automateService;
    this.receiptParser = receiptParser;
    this.staticDir = staticDir || null;
    this.server = createServer((req, res) => this.handleRequest(req, res));
  }

  getHttpServer(): Server {
    return this.server;
  }

  protected setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-File-Path, X-Mime-Type, X-Webhook-Token');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  protected async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/upload') {
      await this.handleUpload(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === '/ocr') {
      await this.handleOcr(req, res);
      return;
    }

    if (req.method === 'GET' && req.url === '/ocr/status') {
      this.handleOcrStatus(res);
      return;
    }

    // Handle webhook: /webhook/:flowId/:nodeId
    if (req.url?.startsWith('/webhook/')) {
      await this.handleWebhook(req, res);
      return;
    }

    // Handle file serving: GET /files/path/to/file.jpg
    if (req.method === 'GET' && req.url?.startsWith('/files/')) {
      await this.handleFileServe(req, res);
      return;
    }

    // Serve static frontend files
    if (req.method === 'GET' && this.staticDir) {
      const served = this.handleStaticFile(req, res);
      if (served) return;

      // SPA fallback: serve index.html for client-side routes
      this.serveSpaFallback(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private handleStaticFile(req: IncomingMessage, res: ServerResponse): boolean {
    if (!this.staticDir) return false;

    const parsedUrl = url.parse(req.url || '', false);
    const filePath = path.join(this.staticDir, parsedUrl.pathname || '/');

    // Prevent directory traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedStaticDir = path.resolve(this.staticDir);
    if (!resolvedPath.startsWith(resolvedStaticDir)) {
      return false;
    }

    try {
      const stat = fs.statSync(resolvedPath);
      if (stat.isFile()) {
        const ext = path.extname(resolvedPath).toLowerCase();
        const mimeType = STATIC_MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(resolvedPath);

        if (ext === '.js' || ext === '.css') {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }

        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(content);
        return true;
      }
    } catch {
      // File not found — fall through
    }
    return false;
  }

  private serveSpaFallback(res: ServerResponse): void {
    if (!this.staticDir) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const indexPath = path.join(this.staticDir, 'index.html');
    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  private async handleFileServe(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Extract file path from URL (remove /files/ prefix)
      const parsedUrl = url.parse(req.url || '', true);
      const filePath = decodeURIComponent((parsedUrl.pathname || '').replace(/^\/files\//, ''));

      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing file path' }));
        return;
      }

      // Security: Only allow files from data/public directory
      const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
      if (!normalizedPath.startsWith('data/public/') && normalizedPath !== 'data/public') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied: only files from data/public are allowed' }));
        return;
      }

      // FileSystem rootDir is the data/ directory, so strip the leading data/ prefix
      const readPath = normalizedPath.startsWith('data/') ? normalizedPath.slice('data/'.length) : normalizedPath;

      // Read the file
      const fileData = await this.fileSystem.readBinaryFile(readPath);

      // Get the correct mime type
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || fileData.mimeType || 'application/octet-stream';

      // Decode base64 to buffer
      const buffer = Buffer.from(fileData.data, 'base64');

      // Set caching headers
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);

      res.writeHead(200);
      res.end(buffer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'File not found';
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: errorMessage }));
    }
  }

  private async handleUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const filePath = req.headers['x-file-path'] as string;
    const mimeType = req.headers['x-mime-type'] as string || 'application/octet-stream';

    if (!filePath) {
      this.sendResponse(res, 400, { success: false, error: 'Missing X-File-Path header' });
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE) {
        this.sendResponse(res, 413, {
          success: false,
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
        });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const base64Data = buffer.toString('base64');

        const result = await this.fileSystem.writeBinaryFile(filePath, base64Data, mimeType);

        this.sendResponse(res, 200, { success: true, data: result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        this.sendResponse(res, 500, { success: false, error: errorMessage });
      }
    });

    req.on('error', (error) => {
      console.error('Upload error:', error);
      this.sendResponse(res, 500, { success: false, error: 'Upload failed' });
    });
  }

  private handleOcrStatus(res: ServerResponse): void {
    const available = this.ocrService?.isAvailable() ?? false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      available,
      languages: available ? ['pol'] : [],
    }));
  }

  private async handleOcr(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.ocrService?.isAvailable()) {
      this.sendOcrResponse(res, 503, { success: false, error: 'OCR service not available' });
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_OCR_BODY_SIZE) {
        this.sendOcrResponse(res, 413, { success: false, error: 'Request body too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        const { images } = JSON.parse(body) as { images: string[] };

        if (!images || !Array.isArray(images) || images.length === 0) {
          this.sendOcrResponse(res, 400, { success: false, error: 'Missing or empty images array' });
          return;
        }

        const ocrResult = await this.ocrService!.processMultipleImages(images);
        const parsed = this.receiptParser?.parse(ocrResult.text);

        this.sendOcrResponse(res, 200, {
          success: true,
          text: ocrResult.text,
          parsed,
          confidence: ocrResult.confidence,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'OCR processing failed';
        console.error('OCR error:', error);
        this.sendOcrResponse(res, 500, { success: false, error: errorMessage });
      }
    });

    req.on('error', (error) => {
      console.error('OCR request error:', error);
      this.sendOcrResponse(res, 500, { success: false, error: 'OCR request failed' });
    });
  }

  private async handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Check if automate service is available
    if (!this.automateService) {
      this.sendWebhookResponse(res, 503, { success: false, error: 'Automate service not available' });
      return;
    }

    // Parse URL: /webhook/{flowId}/{nodeId}?token=xxx
    const parsedUrl = url.parse(req.url || '', true);
    const pathParts = (parsedUrl.pathname || '').replace(/^\/webhook\//, '').split('/');

    if (pathParts.length < 2 || !pathParts[0] || !pathParts[1]) {
      this.sendWebhookResponse(res, 400, { success: false, error: 'Invalid webhook URL. Expected: /webhook/{flowId}/{nodeId}' });
      return;
    }

    const flowId = decodeURIComponent(pathParts[0]);
    const nodeId = decodeURIComponent(pathParts[1]);

    // Get flow to validate
    const flow = this.automateService.getFlowById(flowId);
    if (!flow) {
      this.sendWebhookResponse(res, 404, { success: false, error: `Flow not found: ${flowId}` });
      return;
    }

    // Validate secret token
    const token = (parsedUrl.query.token as string) || (req.headers['x-webhook-token'] as string);
    if (!this.automateService.validateWebhookSecret(flowId, nodeId, token)) {
      this.sendWebhookResponse(res, 401, { success: false, error: 'Unauthorized: Invalid or missing token' });
      return;
    }

    // Validate HTTP method
    const allowedMethods = this.automateService.getWebhookAllowedMethods(flowId, nodeId);
    if (!allowedMethods) {
      this.sendWebhookResponse(res, 404, { success: false, error: `Webhook node not found: ${nodeId}` });
      return;
    }

    if (!allowedMethods.includes(req.method || '')) {
      this.sendWebhookResponse(res, 405, {
        success: false,
        error: `Method not allowed. Allowed: ${allowedMethods.join(', ')}`
      });
      return;
    }

    // Parse request body
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const MAX_WEBHOOK_BODY = 5 * 1024 * 1024; // 5MB

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_WEBHOOK_BODY) {
        this.sendWebhookResponse(res, 413, { success: false, error: 'Request body too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (res.writableEnded) return;

      try {
        const startTime = Date.now();
        let payload: unknown = undefined;

        // Parse body based on content type
        const body = Buffer.concat(chunks).toString('utf-8');
        if (body) {
          const contentType = req.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            try {
              payload = JSON.parse(body);
            } catch {
              payload = body;
            }
          } else {
            payload = body;
          }
        }

        // Build headers object (filter out sensitive headers)
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            headers[key.toLowerCase()] = value;
          }
        }

        // Build query object
        const query: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsedUrl.query)) {
          if (typeof value === 'string' && key !== 'token') {
            query[key] = value;
          }
        }

        // Execute flow
        const result = await this.automateService!.executeFromWebhook(flowId, nodeId, {
          payload,
          method: req.method || 'POST',
          headers,
          query,
        });

        const executionTime = Date.now() - startTime;

        this.sendWebhookResponse(res, result.success ? 200 : 500, {
          success: result.success,
          flowId,
          nodeId,
          executionTime,
          result,
          error: result.error,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Webhook execution failed';
        console.error('Webhook error:', error);
        this.sendWebhookResponse(res, 500, { success: false, error: errorMessage });
      }
    });

    req.on('error', (error) => {
      console.error('Webhook request error:', error);
      this.sendWebhookResponse(res, 500, { success: false, error: 'Webhook request failed' });
    });
  }

  private sendWebhookResponse(res: ServerResponse, statusCode: number, data: WebhookResponse): void {
    if (!res.writableEnded) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
  }

  private sendOcrResponse(res: ServerResponse, statusCode: number, data: OcrResponse): void {
    if (!res.writableEnded) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
  }

  private sendResponse(res: ServerResponse, statusCode: number, data: UploadResult): void {
    if (!res.writableEnded) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
  }

  protected sendJsonResponse(res: ServerResponse, statusCode: number, data: unknown): void {
    if (!res.writableEnded) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}
