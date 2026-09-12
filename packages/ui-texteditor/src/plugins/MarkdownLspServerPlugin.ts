/**
 * Markdown LSP server plugin — bridges Monaco to marksman via WebSocket proxy.
 *
 * Provides: go-to-definition (F12), find-all-references, rename-symbol (F2)
 * for Markdown wiki-links and headings.
 *
 * Requires MARKSMAN_BIN on the backend and a valid authToken.
 */

import * as monaco from 'monaco-editor';
import { defineEditorPlugin } from '../monaco';
import type { IPluginAPI } from '../monaco';

/* ── LSP types (minimal subset) ─────────────────────────────────────────── */

interface LspPosition { line: number; character: number; }
interface LspRange { start: LspPosition; end: LspPosition; }
interface LspLocation { uri: string; range: LspRange; }
interface LspTextEdit { range: LspRange; newText: string; }

/* ── LSP ↔ Monaco conversion ─────────────────────────────────────────────── */

function monacoToLspPos(p: monaco.Position): LspPosition {
  return { line: p.lineNumber - 1, character: p.column - 1 };
}

function lspRangeToMonaco(r: LspRange): monaco.IRange {
  return {
    startLineNumber: r.start.line + 1,
    startColumn: r.start.character + 1,
    endLineNumber: r.end.line + 1,
    endColumn: r.end.character + 1,
  };
}

function modelToLspUri(model: monaco.editor.ITextModel): string {
  const u = model.uri;
  return u.scheme === 'file' ? `file://${u.path}` : u.toString();
}

/* ── Lightweight LSP client ──────────────────────────────────────────────── */

type PendingReq = { resolve: (v: unknown) => void; reject: (e: Error) => void };

class LspClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, PendingReq>();
  private initialized = false;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(ws: WebSocket, workspaceUri: string) {
    this.readyPromise = new Promise<void>(r => { this.resolveReady = r; });
    this.ws = ws;

    ws.onopen = () => {
      this.request('initialize', {
        processId: null,
        rootUri: workspaceUri,
        workspaceFolders: [{ uri: workspaceUri, name: 'home' }],
        capabilities: {
          textDocument: {
            definition: { linkSupport: false },
            references: {},
            rename: { prepareSupport: false },
            synchronization: { didSave: false, willSave: false, willSaveWaitUntil: false },
          },
          workspace: { workspaceFolders: true },
        },
        initializationOptions: {},
      }).then(() => {
        this.sendRaw({ jsonrpc: '2.0', method: 'initialized', params: {} });
        this.initialized = true;
        this.resolveReady();
      }).catch(console.error);
    };

    ws.onmessage = (e: MessageEvent<string>) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error((msg.error as { message: string }).message));
        else resolve(msg.result);
      }
    };

    ws.onerror = (err) => {
      console.error('[MarkdownLspServerPlugin] WebSocket error', err);
    };
  }

  get isReady(): boolean { return this.initialized; }

  waitForReady(): Promise<void> { return this.readyPromise; }

  request(method: string, params: unknown): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.sendRaw({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.sendRaw({ jsonrpc: '2.0', method, params });
  }

  private sendRaw(msg: unknown): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  dispose(): void {
    for (const { reject } of this.pending.values()) reject(new Error('LSP disposed'));
    this.pending.clear();
    if (this.ws.readyState !== WebSocket.CLOSED) this.ws.close();
  }
}

/* ── Plugin factory ──────────────────────────────────────────────────────── */

export function createMarkdownLspServerPlugin(authToken: string) {
  // Closure state — shared between activate and deactivate
  let client: LspClient | null = null;
  let monacoDisposables: monaco.IDisposable[] = [];
  let eventUnsubs: Array<(() => void) | { dispose(): void } | undefined> = [];
  const openUris = new Set<string>();
  let docVersion = 0;

  // Per-model content-change subscription (Monaco native)
  const modelContentSubs = new Map<string, monaco.IDisposable>();

  function activate(api: IPluginAPI): void {
    if (!authToken) {
      api.logger.warn('No authToken — Markdown LSP server plugin disabled');
      return;
    }

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${location.host}/ws/lsp/markdown?token=${encodeURIComponent(authToken)}`;
    const ws = new WebSocket(wsUrl);
    client = new LspClient(ws, 'file:///home');

    function isMarkdown(model: monaco.editor.ITextModel): boolean {
      return model.getLanguageId() === 'markdown';
    }

    async function openDoc(model: monaco.editor.ITextModel): Promise<void> {
      if (!isMarkdown(model)) return;
      const uri = modelToLspUri(model);
      if (openUris.has(uri)) return;
      openUris.add(uri);
      // Subscribe to content changes for this model
      if (!modelContentSubs.has(uri)) {
        modelContentSubs.set(uri, model.onDidChangeContent(() => {
          if (!client?.isReady || !openUris.has(uri)) return;
          client.notify('textDocument/didChange', {
            textDocument: { uri, version: ++docVersion },
            contentChanges: [{ text: model.getValue() }],
          });
        }));
      }
      await client!.waitForReady();
      client!.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: 'markdown', version: ++docVersion, text: model.getValue() },
      });
    }

    // Open all currently loaded markdown models once initialized
    void client.waitForReady().then(() => {
      for (const model of monaco.editor.getModels()) void openDoc(model);
    });

    // Track future model opens
    eventUnsubs.push(
      api.editor.onDidOpenDocument((rawUri) => {
        const model = monaco.editor.getModels().find(
          m => modelToLspUri(m) === rawUri || m.uri.toString() === rawUri,
        );
        if (model) void openDoc(model);
      }),
    );

    /* ── Monaco providers ───────────────────────────────────────────────── */

    const defProvider = monaco.languages.registerDefinitionProvider('markdown', {
      async provideDefinition(model, position) {
        if (!client?.isReady) return null;
        const uri = modelToLspUri(model);
        if (!openUris.has(uri)) await openDoc(model);
        let result: unknown;
        try {
          result = await client!.request('textDocument/definition', {
            textDocument: { uri },
            position: monacoToLspPos(position),
          });
        } catch { return null; }
        if (!result) return null;
        const locs: LspLocation[] = Array.isArray(result) ? result : [result as LspLocation];
        return locs.map(loc => ({ uri: monaco.Uri.parse(loc.uri), range: lspRangeToMonaco(loc.range) }));
      },
    });

    const refProvider = monaco.languages.registerReferenceProvider('markdown', {
      async provideReferences(model, position) {
        if (!client?.isReady) return null;
        const uri = modelToLspUri(model);
        if (!openUris.has(uri)) await openDoc(model);
        let result: unknown;
        try {
          result = await client!.request('textDocument/references', {
            textDocument: { uri },
            position: monacoToLspPos(position),
            context: { includeDeclaration: true },
          });
        } catch { return null; }
        if (!result) return null;
        const locs: LspLocation[] = Array.isArray(result) ? result : [result as LspLocation];
        return locs.map(loc => ({ uri: monaco.Uri.parse(loc.uri), range: lspRangeToMonaco(loc.range) }));
      },
    });

    const renameProvider = monaco.languages.registerRenameProvider('markdown', {
      async provideRenameEdits(model, position, newName) {
        if (!client?.isReady) return null;
        const uri = modelToLspUri(model);
        if (!openUris.has(uri)) await openDoc(model);
        let result: unknown;
        try {
          result = await client!.request('textDocument/rename', {
            textDocument: { uri },
            position: monacoToLspPos(position),
            newName,
          });
        } catch { return null; }
        if (!result) return null;

        type WsEdit = {
          changes?: Record<string, LspTextEdit[]>;
          documentChanges?: Array<{ textDocument: { uri: string }; edits: LspTextEdit[] }>;
        };
        const wsEdit = result as WsEdit;
        const edits: monaco.languages.IWorkspaceTextEdit[] = [];
        const push = (fUri: string, fEdits: LspTextEdit[]) => {
          const mUri = monaco.Uri.parse(fUri);
          for (const e of fEdits) {
            edits.push({ resource: mUri, versionId: undefined, textEdit: { range: lspRangeToMonaco(e.range), text: e.newText } });
          }
        };
        if (wsEdit.changes) {
          for (const [fUri, fEdits] of Object.entries(wsEdit.changes)) push(fUri, fEdits);
        } else if (wsEdit.documentChanges) {
          for (const dc of wsEdit.documentChanges) push(dc.textDocument.uri, dc.edits);
        }
        return { edits };
      },
    });

    monacoDisposables = [defProvider, refProvider, renameProvider];
    api.logger.info('Markdown LSP server (marksman) activated');
  }

  function deactivate(): void {
    for (const d of monacoDisposables) d.dispose();
    monacoDisposables = [];
    for (const s of eventUnsubs) {
      if (!s) continue;
      if (typeof s === 'function') s();
      else s.dispose();
    }
    eventUnsubs = [];
    for (const d of modelContentSubs.values()) d.dispose();
    modelContentSubs.clear();
    openUris.clear();
    client?.dispose();
    client = null;
  }

  return defineEditorPlugin(
    {
      id: 'builtin.markdown-lsp-server',
      name: 'Markdown LSP (marksman)',
      version: '1.0.0',
      description: 'Go-to-definition, find-references and rename via marksman LSP server',
      contributes: [],
    },
    activate,
    deactivate,
  );
}
