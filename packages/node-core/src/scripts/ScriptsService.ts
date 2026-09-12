import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface ScriptInfo {
  name: string;
  size: number;
  updatedAt: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
}

const SCRIPT_NAME_PATTERN = /^[a-zA-Z0-9_-]+\.(js|mjs)$/;
const TIMEOUT_MS = 30_000;

export class ScriptsService {
  private readonly scriptsDir: string;

  constructor(rootDir: string) {
    this.scriptsDir = path.join(rootDir, 'scripts');
    fs.mkdirSync(this.scriptsDir, { recursive: true });
  }

  listScripts(): ScriptInfo[] {
    return fs.readdirSync(this.scriptsDir)
      .filter(f => SCRIPT_NAME_PATTERN.test(f))
      .map(name => {
        const stat = fs.statSync(path.join(this.scriptsDir, name));
        return { name, size: stat.size, updatedAt: stat.mtime.toISOString() };
      });
  }

  readScript(name: string): string {
    this.validateName(name);
    const scriptPath = path.join(this.scriptsDir, name);
    if (!fs.existsSync(scriptPath)) throw new Error(`Script not found: ${name}`);
    return fs.readFileSync(scriptPath, 'utf-8');
  }

  writeScript(name: string, content: string): void {
    this.validateName(name);
    fs.writeFileSync(path.join(this.scriptsDir, name), content, 'utf-8');
  }

  deleteScript(name: string): void {
    this.validateName(name);
    const scriptPath = path.join(this.scriptsDir, name);
    if (!fs.existsSync(scriptPath)) throw new Error(`Script not found: ${name}`);
    fs.unlinkSync(scriptPath);
  }

  runScript(name: string, args: string[] = [], env: Record<string, string> = {}): Promise<RunResult> {
    this.validateName(name);
    const scriptPath = path.join(this.scriptsDir, name);
    if (!fs.existsSync(scriptPath)) throw new Error(`Script not found: ${name}`);

    return new Promise((resolve) => {
      const start = Date.now();
      const stdout: string[] = [];
      const stderr: string[] = [];

      const proc = spawn('node', [scriptPath, ...args], {
        env: { ...process.env, ...env },
        timeout: TIMEOUT_MS,
      });

      proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk.toString()));
      proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));

      proc.on('close', (code) => {
        resolve({ stdout: stdout.join(''), stderr: stderr.join(''), exitCode: code, duration: Date.now() - start });
      });

      proc.on('error', (err) => {
        resolve({ stdout: stdout.join(''), stderr: err.message, exitCode: -1, duration: Date.now() - start });
      });
    });
  }

  private validateName(name: string): void {
    if (!SCRIPT_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid script name: "${name}". Must match [a-zA-Z0-9_-]+.(js|mjs)`);
    }
  }
}
