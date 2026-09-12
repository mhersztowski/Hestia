import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HttpUploadServer } from './HttpUploadServer';
import { FileSystem } from '../filesystem/FileSystem';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let fileSystem: FileSystem;
let server: HttpUploadServer;
let port: number;
let baseUrl: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'http-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();

  // Use port 0 to get a random available port
  server = new HttpUploadServer(0, fileSystem);
  await server.start();
  const address = server.getHttpServer().address();
  port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await server.stop();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('HttpUploadServer', () => {
  describe('CORS', () => {
    it('sets CORS headers on responses', async () => {
      const res = await fetch(`${baseUrl}/nonexistent`);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('OPTIONS returns 204', async () => {
      const res = await fetch(baseUrl, { method: 'OPTIONS' });
      expect(res.status).toBe(204);
    });
  });

  describe('POST /upload', () => {
    it('stores file with X-File-Path header', async () => {
      const body = Buffer.from('test file content');
      const res = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        headers: {
          'X-File-Path': 'upload/test.bin',
          'X-Mime-Type': 'application/octet-stream',
        },
        body,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('returns 400 without X-File-Path header', async () => {
      const res = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        body: 'data',
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('GET /files/', () => {
    it('serves files from data/public/', async () => {
      // The FileSystem root IS the data/ dir; the /files/ handler strips the
      // leading data/ prefix, so the file must live at public/hello.txt on disk.
      await fileSystem.writeBinaryFile(
        'public/hello.txt',
        Buffer.from('hello world').toString('base64'),
        'text/plain'
      );

      const res = await fetch(`${baseUrl}/files/data/public/hello.txt`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('hello world');
    });

    it('returns 403 for files outside data/public/', async () => {
      await fileSystem.writeFile('private/secret.txt', 'secret');
      const res = await fetch(`${baseUrl}/files/private/secret.txt`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /ocr/status', () => {
    it('returns availability (no ocr service)', async () => {
      const res = await fetch(`${baseUrl}/ocr/status`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.available).toBe(false);
    });
  });

  describe('404 for unknown routes', () => {
    it('returns 404 for unknown path', async () => {
      const res = await fetch(`${baseUrl}/unknown`);
      expect(res.status).toBe(404);
    });
  });
});
