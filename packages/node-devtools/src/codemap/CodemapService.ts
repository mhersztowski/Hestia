/**
 * High-level orchestrator tying the parsers to codemaps.
 *
 *   code → CodeModel → codemap        (create / update with history)
 *   codemap → CodeModel → source code (round-trip skeleton generation)
 *
 * Re-syncing an existing codemap preserves manual node layout (positions are
 * matched by deterministic node id) and records every add/remove/modify as a
 * commit on the codemap's current git-like branch.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CodeModel, Language } from './model/CodeModel.js';
import { nodeId } from './model/ids.js';
import { buildModel, SourceFile } from './parsers/index.js';
import { detectLanguage, SUPPORTED_EXTENSIONS } from './parsers/types.js';
import { generateCode, GeneratedFile } from './codegen/index.js';
import { Codemap, commitCodemap, createCodemap, SyncResult } from './document.js';
import { modelToDiagram } from './uml/generateUml.js';
import { diffDiagrams, summarizeChanges } from './uml/diffModel.js';
import { diagramToModel } from './uml/umlToModel.js';
import { UmlDiagram } from './uml/umlTypes.js';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'libraries', 'wasm-output']);

export interface ScanOptions {
  /** Make stored file paths relative to this dir (default: the scanned dir). */
  relativeTo?: string;
  maxFiles?: number;
}

export class CodemapService {
  /** Recursively collect parseable source files under `dir`. */
  async scanDirectory(dir: string, opts: ScanOptions = {}): Promise<SourceFile[]> {
    const base = opts.relativeTo ?? dir;
    const max = opts.maxFiles ?? 2000;
    const out: SourceFile[] = [];
    const exts = new Set(SUPPORTED_EXTENSIONS.map((e) => `.${e}`));

    const walk = async (cur: string): Promise<void> => {
      if (out.length >= max) return;
      let entries: import('node:fs').Dirent[];
      try { entries = await fs.readdir(cur, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (out.length >= max) break;
        const abs = path.join(cur, e.name);
        if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(abs); continue; }
        if (!exts.has(path.extname(e.name).toLowerCase())) continue;
        const lang = detectLanguage(e.name);
        if (!lang) continue;
        let content: string;
        try { content = await fs.readFile(abs, 'utf8'); } catch { continue; }
        out.push({ file: path.relative(base, abs).split(path.sep).join('/'), content, language: lang });
      }
    };
    await walk(dir);
    return out;
  }

  /**
   * Reads the given files (instead of a whole directory). Useful when a diagram
   * should come from a few chosen classes rather than a whole module — the rest
   * of the directory would add symbols to the diagram that nobody asked for.
   *
   * Paths may be absolute or relative to `baseDir`. Unreadable files and files in
   * an unsupported language are silently skipped — a selection from a file list
   * tends to be rough, and aborting the whole operation because of a single `.md`
   * would come as a surprise to the user.
   */
  async readFiles(files: string[], baseDir: string, opts: ScanOptions = {}): Promise<SourceFile[]> {
    const base = opts.relativeTo ?? baseDir;
    const max = opts.maxFiles ?? 2000;
    const out: SourceFile[] = [];
    for (const entry of files) {
      if (out.length >= max) break;
      const abs = path.isAbsolute(entry) ? entry : path.resolve(baseDir, entry);
      const lang = detectLanguage(path.basename(abs));
      if (!lang) continue;
      let content: string;
      try { content = await fs.readFile(abs, 'utf8'); } catch { continue; }
      out.push({ file: path.relative(base, abs).split(path.sep).join('/'), content, language: lang });
    }
    return out;
  }

  /** Parse a chosen set of files into a language-agnostic model. */
  async parseFiles(files: string[], baseDir: string, opts: ScanOptions = {}): Promise<CodeModel> {
    return buildModel(await this.readFiles(files, baseDir, opts));
  }

  /** Create a brand-new codemap from a chosen set of files. */
  async createFromFiles(
    files: string[], baseDir: string, name: string, opts: ScanOptions = {},
  ): Promise<Codemap> {
    const model = await this.parseFiles(files, baseDir, opts);
    const linked = opts.relativeTo ? path.relative(opts.relativeTo, baseDir).split(path.sep).join('/') : baseDir;
    return createCodemap(model, name, linked);
  }

  /** Re-parse a chosen set of files and update an existing codemap. */
  async updateFromFiles(
    codemap: Codemap, files: string[], baseDir: string, opts: ScanOptions = {},
  ): Promise<SyncResult> {
    return this.applyModel(codemap, await this.parseFiles(files, baseDir, opts));
  }

  /** Parse a directory into a language-agnostic model. */
  async parseDirectory(dir: string, opts: ScanOptions = {}): Promise<CodeModel> {
    return buildModel(await this.scanDirectory(dir, opts));
  }

  /** Create a brand-new codemap from a source directory. */
  async createFromDir(dir: string, name: string, opts: ScanOptions = {}): Promise<Codemap> {
    const model = await this.parseDirectory(dir, opts);
    return createCodemap(model, name, opts.relativeTo ? path.relative(opts.relativeTo, dir).split(path.sep).join('/') : dir);
  }

  /**
   * Re-parse a directory and update an existing codemap: refresh the generated
   * diagram (preserving layout), diff against the prior version and record the
   * changes as a commit.
   */
  async updateFromDir(codemap: Codemap, dir: string, opts: ScanOptions = {}): Promise<SyncResult> {
    const model = await this.parseDirectory(dir, opts);
    return this.applyModel(codemap, model);
  }

  /** Core update: merge a freshly parsed model into the codemap's diagram. */
  applyModel(codemap: Codemap, model: CodeModel): SyncResult {
    const generatedIds = new Set(model.symbols.map((s) => nodeId(s.id)));
    const target = this.pickTargetDiagram(codemap, generatedIds);

    // Preserve positions of nodes that already exist in the target diagram.
    const positions = new Map<string, { x: number; y: number }>();
    if (target) for (const n of target.nodes) positions.set(n.id, n.position);

    const fresh = modelToDiagram(model, { positions, diagramName: target?.name ?? 'Model' });
    const newDiagram: UmlDiagram = target
      ? { ...target, nodes: fresh.nodes, edges: fresh.edges }
      : fresh;

    const changes = diffDiagrams(target ?? undefined, newDiagram);
    const summary = summarizeChanges(changes);

    let diagrams: UmlDiagram[];
    if (target) diagrams = codemap.diagrams.map((d) => (d.id === target.id ? newDiagram : d));
    else diagrams = [...codemap.diagrams, newDiagram];

    let updated: Codemap = { ...codemap, diagrams, updatedAt: Date.now() };
    const committed = changes.length > 0;
    if (committed) updated = commitCodemap(updated, `Sync from code (${summary})`);

    return { codemap: updated, changes, summary, committed };
  }

  /** Reconstruct a model from the codemap's UML and emit source skeletons. */
  toSourceFiles(codemap: Codemap, language: Language, diagramId?: string): GeneratedFile[] {
    const diagram = (diagramId ? codemap.diagrams.find((d) => d.id === diagramId) : codemap.diagrams[0]);
    if (!diagram) return [];
    return generateCode(diagramToModel(diagram, language), language);
  }

  /** Write generated files to disk. Existing files are skipped unless overwrite. */
  async writeSourceFiles(files: GeneratedFile[], targetDir: string, overwrite = false): Promise<{ written: string[]; skipped: string[] }> {
    const written: string[] = []; const skipped: string[] = [];
    await fs.mkdir(targetDir, { recursive: true });
    for (const f of files) {
      const abs = path.join(targetDir, f.file);
      if (!overwrite) { try { await fs.access(abs); skipped.push(f.file); continue; } catch { /* not present → write */ } }
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, f.content, 'utf8');
      written.push(f.file);
    }
    return { written, skipped };
  }

  private pickTargetDiagram(codemap: Codemap, generatedIds: Set<string>): UmlDiagram | null {
    let best: UmlDiagram | null = null; let bestScore = 0;
    for (const d of codemap.diagrams) {
      const score = d.nodes.reduce((a, n) => a + (generatedIds.has(n.id) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }
}
