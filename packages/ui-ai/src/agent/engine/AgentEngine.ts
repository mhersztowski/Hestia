/**
 * Agent engine — agentic tool-calling loop over VFS.
 */

import type { FileSystemProvider } from '@hestia/core';
import type {
  AiProvider,
  AiProviderConfig,
  AiChatMessage,
  AiContentBlock,
  AgentMessage,
  ChatAttachment,
} from '../types';
import { buildVfsToolDefinitions } from '../tools/vfsTools';
import { executeVfsTool } from '../tools/toolExecutor';
import { buildWebToolDefinitions, executeWebTool } from '../tools/webTools';

export interface AgentEngineCallbacks {
  onMessage: (message: AgentMessage) => void;
  onProcessingChange: (processing: boolean) => void;
  /** Called after the agent writes/deletes/renames files in the VFS. */
  onFileWritten?: (paths: string[]) => void;
}

export class AgentEngine {
  private history: AgentMessage[] = [];
  private nextId = 1;
  private allAffectedFiles = new Set<string>();

  private aiProvider: AiProvider;
  private config: AiProviderConfig;
  private maxIterations: number;
  private temperature: number;
  private maxTokens: number;

  private claudeMdContent = '';
  private claudeMdLoaded = false;
  private abortController: AbortController | null = null;
  private skills = new Map<string, string>(); // name → content
  private webFetchUrl: string | null = null;
  private authToken: string | null = null;
  private injectedClaudeMd = '';

  constructor(
    private provider: FileSystemProvider,
    private callbacks: AgentEngineCallbacks,
    aiProvider: AiProvider,
    config: AiProviderConfig,
    maxIterations = 15,
    temperature = 0.2,
    // Large enough for write_file tool calls that embed whole files in `content`;
    // 4096 truncated the tool_use JSON mid-content → "missing content" retries.
    maxTokens = 16384,
    webFetchUrl?: string,
    authToken?: string,
    injectedClaudeMd?: string
  ) {
    this.aiProvider = aiProvider;
    this.config = config;
    this.maxIterations = maxIterations;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.webFetchUrl = webFetchUrl ?? null;
    this.authToken = authToken ?? null;
    this.injectedClaudeMd = injectedClaudeMd ?? '';
  }

  updateConfig(
    aiProvider: AiProvider,
    config: AiProviderConfig,
    maxIterations?: number,
    temperature?: number,
    maxTokens?: number,
    webFetchUrl?: string,
    authToken?: string,
    injectedClaudeMd?: string
  ): void {
    this.aiProvider = aiProvider;
    this.config = config;
    if (maxIterations !== undefined) this.maxIterations = maxIterations;
    if (temperature !== undefined) this.temperature = temperature;
    if (maxTokens !== undefined) this.maxTokens = maxTokens;
    if (webFetchUrl !== undefined) this.webFetchUrl = webFetchUrl;
    if (authToken !== undefined) this.authToken = authToken;
    if (injectedClaudeMd !== undefined) this.injectedClaudeMd = injectedClaudeMd;
  }

  /** Scans VFS root dirs for CLAUDE.md + skills (skills-lock.json + .claude/commands/). */
  private async loadClaudeMd(): Promise<void> {
    this.claudeMdLoaded = true;
    const sections: string[] = [];
    this.skills.clear();

    let dirs: string[] = ['/'];
    try {
      const rootEntries = await this.provider.readDirectory('/');
      dirs = ['/', ...rootEntries.filter((e) => e.type === 2).map((e) => `/${e.name}`)];
      console.log('[AgentEngine] VFS root dirs:', dirs);
    } catch (e) {
      console.warn('[AgentEngine] readDirectory("/") failed:', e);
    }

    for (const dir of dirs) {
      const base = dir === '/' ? '' : dir;

      // CLAUDE.md
      try {
        const text = new TextDecoder().decode(await this.provider.readFile(`${base}/CLAUDE.md`));
        sections.push(`### ${base}/CLAUDE.md\n${text.trim()}`);
      } catch {
        /* not found */
      }

      // Local skills: .claude/commands/*.md
      try {
        const cmdEntries = await this.provider.readDirectory(`${base}/.claude/commands`);
        for (const entry of cmdEntries) {
          if (!entry.name.endsWith('.md')) continue;
          const skillName = entry.name.replace(/\.md$/, '');
          try {
            const content = new TextDecoder().decode(
              await this.provider.readFile(`${base}/.claude/commands/${entry.name}`)
            );
            this.skills.set(skillName, content);
          } catch {
            /* skip */
          }
        }
      } catch {
        /* no commands dir */
      }

      // skills-lock.json — fetch from GitHub
      try {
        const lockText = new TextDecoder().decode(
          await this.provider.readFile(`${base}/skills-lock.json`)
        );
        console.log(`[AgentEngine] Found skills-lock.json at ${base}/skills-lock.json`);
        const lock = JSON.parse(lockText) as {
          version: number;
          skills: Record<string, { source: string; sourceType: string }>;
        };
        for (const [skillName, def] of Object.entries(lock.skills ?? {})) {
          if (def.sourceType !== 'github') continue;
          const [owner, repo] = def.source.split('/');
          if (!owner || !repo) continue;
          // Try multiple paths and branches
          const urls = [
            `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillName}/SKILL.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/master/skills/${skillName}/SKILL.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillName}.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillName}.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/master/${skillName}.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/master/skills/${skillName}.md`,
          ];
          let loaded = false;
          // First try known URL patterns
          for (const url of urls) {
            try {
              const res = await fetch(url);
              if (res.ok) {
                this.skills.set(skillName, await res.text());
                console.log(`[AgentEngine] Skill ${skillName} loaded from ${url}`);
                loaded = true;
                break;
              }
            } catch {
              /* try next */
            }
          }
          // Fallback: use GitHub Trees API to find the .md file anywhere in the repo
          if (!loaded) {
            try {
              for (const branch of ['main', 'master']) {
                const treeRes = await fetch(
                  `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
                );
                if (!treeRes.ok) continue;
                const tree = (await treeRes.json()) as {
                  tree: Array<{ path: string; type: string }>;
                };
                const match = tree.tree.find(
                  (f) =>
                    f.type === 'blob' &&
                    (f.path === `skills/${skillName}/SKILL.md` ||
                      f.path === `${skillName}.md` ||
                      f.path.endsWith(`/${skillName}/SKILL.md`) ||
                      f.path.endsWith(`/${skillName}.md`))
                );
                if (match) {
                  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${match.path}`;
                  const rawRes = await fetch(rawUrl);
                  if (rawRes.ok) {
                    this.skills.set(skillName, await rawRes.text());
                    console.log(
                      `[AgentEngine] Skill ${skillName} loaded via tree API from ${rawUrl}`
                    );
                    loaded = true;
                    break;
                  }
                }
              }
            } catch (e) {
              console.warn(`[AgentEngine] Tree API fallback failed:`, e);
            }
          }
          if (!loaded) console.warn(`[AgentEngine] Could not load skill: ${skillName}`);
        }
      } catch {
        /* no skills-lock.json */
      }
    }

    this.claudeMdContent = sections.join('\n\n');
  }

  getSkills(): Map<string, string> {
    return this.skills;
  }

  abort(): void {
    this.abortController?.abort();
  }

  async initialize(): Promise<void> {
    if (!this.claudeMdLoaded) await this.loadClaudeMd();
  }

  async refreshSkills(): Promise<void> {
    this.claudeMdLoaded = false;
    this.claudeMdContent = '';
    this.skills.clear();
    await this.loadClaudeMd();
  }

  async process(userMessage: string, attachments?: ChatAttachment[]): Promise<void> {
    if (!this.claudeMdLoaded) await this.loadClaudeMd();
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    this.callbacks.onProcessingChange(true);
    try {
      const userMsg = this.createMessage('user', userMessage);
      if (attachments?.length) userMsg.attachments = attachments;
      this.history.push(userMsg);
      this.callbacks.onMessage(userMsg);

      const tools = [
        ...buildVfsToolDefinitions(this.provider),
        ...(this.webFetchUrl ? buildWebToolDefinitions() : []),
      ];
      const systemPrompt = this.buildSystemPrompt();

      let iteration = 0;
      while (iteration < this.maxIterations) {
        if (signal.aborted) break;
        iteration++;
        const messages = this.buildAiMessages(systemPrompt);

        const response = await this.aiProvider.chat(
          {
            messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
            temperature: this.temperature,
            maxTokens: this.maxTokens,
            signal,
          },
          this.config
        );

        if (response.toolCalls?.length) {
          // Assistant wants to use tools
          const assistantMsg = this.createMessage('assistant', response.content || '');
          assistantMsg.toolCalls = response.toolCalls;
          this.history.push(assistantMsg);
          this.callbacks.onMessage(assistantMsg);

          const WRITE_TOOLS = new Set([
            'vfs_write_file',
            'vfs_delete',
            'vfs_rename',
            'vfs_copy',
            'vfs_mkdir',
          ]);
          // Every tool call of this turn runs AT ONCE. Each VFS operation is its
          // own HTTP round trip, and awaiting them one by one made file access
          // "terribly slow" over many files — N times the latency. The paths are
          // independent, so running them together is safe. The results are put
          // back in their ORIGINAL order: Anthropic wants a tool_result for
          // every id, in the order it asked.
          const execResults = await Promise.all(
            response.toolCalls.map(async (toolCall) => {
              if (signal.aborted)
                return {
                  result: JSON.stringify({ error: 'aborted' }),
                  affectedFiles: [] as string[],
                };
              try {
                if (toolCall.function.name === 'web_fetch' && this.webFetchUrl) {
                  const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
                  const result = await executeWebTool(
                    toolCall.function.name,
                    args,
                    this.webFetchUrl,
                    this.authToken ?? undefined
                  );
                  return { result, affectedFiles: [] as string[] };
                }
                return await executeVfsTool(toolCall, this.provider);
              } catch (err) {
                return {
                  result: JSON.stringify({
                    error: err instanceof Error ? err.message : String(err),
                  }),
                  affectedFiles: [] as string[],
                };
              }
            })
          );

          for (let i = 0; i < response.toolCalls.length; i++) {
            const toolCall = response.toolCalls[i];
            const { result, affectedFiles } = execResults[i];
            for (const f of affectedFiles) this.allAffectedFiles.add(f);
            if (affectedFiles.length > 0 && WRITE_TOOLS.has(toolCall.function.name)) {
              this.callbacks.onFileWritten?.(affectedFiles);
            }

            const toolMsg = this.createMessage('tool', result);
            toolMsg.toolCallId = toolCall.id;
            toolMsg.toolName = toolCall.function.name;
            toolMsg.affectedFiles = affectedFiles;
            this.history.push(toolMsg);
            this.callbacks.onMessage(toolMsg);
          }
        } else {
          // Final text response
          const assistantMsg = this.createMessage('assistant', response.content);
          assistantMsg.affectedFiles = [...this.allAffectedFiles];
          this.history.push(assistantMsg);
          this.callbacks.onMessage(assistantMsg);
          break;
        }
      }
    } finally {
      this.callbacks.onProcessingChange(false);
    }
  }

  getHistory(): AgentMessage[] {
    return [...this.history];
  }

  getAffectedFiles(): string[] {
    return [...this.allAffectedFiles];
  }

  clearHistory(): void {
    this.history = [];
    this.allAffectedFiles.clear();
    this.nextId = 1;
    this.claudeMdLoaded = false;
    this.claudeMdContent = '';
  }

  loadHistory(messages: AgentMessage[]): void {
    this.history = [...messages];
    this.nextId = messages.length + 1;
    this.allAffectedFiles.clear();
    for (const m of messages) {
      for (const f of m.affectedFiles ?? []) this.allAffectedFiles.add(f);
    }
  }

  private buildSystemPrompt(): string {
    const readOnly = this.provider.capabilities.readonly;
    const lines = [
      'You are an AI coding assistant embedded in a code editor with access to a virtual file system (VFS).',
      'You can read, search, and browse files using the provided VFS tools.',
      // Reads batched into ONE turn run together (the engine fires them through
      // Promise.all) — far quicker than a file per turn.
      'PERFORMANCE — When you need several files, request ALL of them in the SAME turn (multiple tool calls at once). They run in parallel; reading them one-per-turn is much slower.',
      readOnly
        ? 'The file system is READ-ONLY. You cannot create, edit, or delete files.'
        : [
            'You can also create, edit, and delete files using the VFS tools.',
            'IMPORTANT — Writing files: When creating or modifying files, you MUST call vfs_write_file for EVERY file.',
            'Never just describe file contents in text without calling the tool.',
            'If you plan to create 5 files, make 5 separate vfs_write_file calls — one per file.',
            'Each vfs_write_file MUST contain the COMPLETE final content of that file. NEVER write an empty or partial file intending to fill it in on a later call — an empty write erases existing content and is rejected by the tool.',
            'Always use absolute paths starting with / for all VFS operations.',
            'After writing a batch of files, list the directory to confirm all files were created.',
          ].join(' '),
      'When asked about code, use the VFS tools to explore and understand the codebase before answering.',
      'When making changes, explain what you are doing and why.',
      'Always respond in the same language the user uses.',
      'Be concise and precise.',
    ];
    if (this.injectedClaudeMd) {
      lines.push('\n## Workspace context\n');
      lines.push(this.injectedClaudeMd);
    }
    if (this.claudeMdContent) {
      lines.push('\n## Project instructions (from CLAUDE.md files)\n');
      lines.push(this.claudeMdContent);
    }
    if (this.skills.size > 0) {
      lines.push('\n## Installed skills (slash commands loaded from skills-lock.json)\n');
      lines.push(
        'The following skills are installed and their full prompt content is available when invoked:'
      );
      lines.push([...this.skills.keys()].map((k) => `- /${k}`).join('\n'));
      lines.push("\nWhen the user types /skill-name, respond using that skill's instructions.");
    }
    return lines.join('\n');
  }

  private buildAiMessages(systemPrompt: string): AiChatMessage[] {
    const messages: AiChatMessage[] = [{ role: 'system', content: systemPrompt }];

    const slice = this.history.slice(-50);
    for (const msg of slice) {
      const aiMsg: AiChatMessage = { role: msg.role, content: msg.content };
      if (msg.toolCalls) aiMsg.tool_calls = msg.toolCalls;
      if (msg.toolCallId) aiMsg.tool_call_id = msg.toolCallId;
      // Rebuild multimodal content for user messages with attachments
      if (msg.role === 'user' && msg.attachments?.length) {
        const blocks: AiContentBlock[] = [];
        if (msg.content) blocks.push({ type: 'text', text: msg.content });
        for (const att of msg.attachments) {
          if (att.mimeType.startsWith('image/')) {
            blocks.push({ type: 'image_url', image_url: { url: att.dataUrl } });
          } else {
            // Non-image: inject as text block with filename header
            const base64 = att.dataUrl.split(',')[1] ?? '';
            try {
              const text = atob(base64);
              blocks.push({ type: 'text', text: `\n[File: ${att.name}]\n${text}` });
            } catch {
              /* skip undecodable */
            }
          }
        }
        aiMsg.content = blocks;
      }
      messages.push(aiMsg);
    }
    return messages;
  }

  private createMessage(role: 'user' | 'assistant' | 'tool', content: string): AgentMessage {
    return {
      id: `agent-${this.nextId++}`,
      role,
      content,
      timestamp: Date.now(),
    };
  }
}
