import { CoreObject } from './CoreObject';
import { Signal } from './Signal';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
  timestamp: number;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Categorized, hierarchical logger that emits a signal on every record.
 *
 * Each logger has a category (e.g. "app", "iot.device", "ui.editor").
 * Listeners can subscribe globally (root logger) or per-category.
 *
 * Usage:
 *   const log = new Logger('iot.sensor', parent);
 *   log.info('Telemetry received', { value: 42 });
 *   log.warn('Battery low');
 *
 *   Logger.root().logged.connect((rec) => console.log(rec));
 */
export class Logger extends CoreObject {
  /** Fires for every message logged to THIS logger (not children). */
  readonly logged = new Signal<[record: LogRecord]>();

  #minLevel: LogLevel;

  constructor(
    public readonly category: string,
    parent?: CoreObject,
    options: { minLevel?: LogLevel } = {},
  ) {
    super(parent, `Logger:${category}`);
    this.#minLevel = options.minLevel ?? 'debug';
  }

  // ── Logging methods ───────────────────────────────────────────────────────

  debug(message: string, data?: unknown): void {
    this.#log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.#log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.#log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.#log('error', message, data);
  }

  #log(level: LogLevel, message: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.#minLevel]) return;

    const record: LogRecord = {
      level,
      category: this.category,
      message,
      data,
      timestamp: Date.now(),
    };

    this.logged.emit(record);
    Logger.root().#forwardRecord(record);
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  setMinLevel(level: LogLevel): void {
    this.#minLevel = level;
  }

  get minLevel(): LogLevel {
    return this.#minLevel;
  }

  // ── Root logger (process-wide aggregator) ─────────────────────────────────

  static #root: Logger | null = null;

  static root(): Logger {
    if (!Logger.#root) {
      Logger.#root = new Logger('root');
      // Install default console sink
      Logger.#root.logged.connect((rec) => {
        const prefix = `[${rec.category}]`;
        switch (rec.level) {
          case 'debug': console.debug(prefix, rec.message, rec.data ?? ''); break;
          case 'info':  console.info(prefix, rec.message, rec.data ?? ''); break;
          case 'warn':  console.warn(prefix, rec.message, rec.data ?? ''); break;
          case 'error': console.error(prefix, rec.message, rec.data ?? ''); break;
        }
      });
    }
    return Logger.#root;
  }

  /** Disable console output (e.g. in tests). */
  static silenceConsole(): void {
    Logger.root().logged.disconnectAll();
  }

  static resetRoot(): void {
    Logger.#root?.destroy();
    Logger.#root = null;
  }

  /** Internal: root receives forwarded records from child loggers. */
  #forwardRecord(record: LogRecord): void {
    if (this.category !== 'root') return;
    // emit only if not already this logger (avoids double-emit for root.log())
    if (record.category !== 'root') {
      this.logged.emit(record);
    }
  }
}
