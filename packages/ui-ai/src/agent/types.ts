/**
 * AI Agent types — standalone copies of AiModels types from mycastle-web.
 * Identical shape so existing providers are compatible, but no cross-package dependency.
 */

export type AiProviderType = 'openai' | 'anthropic' | 'ollama' | 'custom';

export interface AiProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

export interface AiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AiTextContentBlock {
  type: 'text';
  text: string;
}

export interface AiImageContentBlock {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type AiContentBlock = AiTextContentBlock | AiImageContentBlock;
export type AiMessageContent = string | AiContentBlock[];

export function getTextContent(content: AiMessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is AiTextContentBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: AiMessageContent;
  tool_calls?: AiToolCall[];
  tool_call_id?: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: AiToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required';
  signal?: AbortSignal;
}

export interface AiChatResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  toolCalls?: AiToolCall[];
}

export interface AiProvider {
  chat(request: AiChatRequest, config: AiProviderConfig): Promise<AiChatResponse>;
}

/* ── Agent-specific types ── */

export interface AgentConfig {
  providerType: AiProviderType;
  providers: Record<AiProviderType, AiProviderConfig>;
  maxIterations: number;
  temperature: number;
  maxTokens: number;
}

export interface ChatAttachment {
  name: string;
  dataUrl: string; // base64 data URL
  mimeType: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: AiToolCall[];
  toolCallId?: string;
  toolName?: string;
  affectedFiles?: string[];
  attachments?: ChatAttachment[];
}

export interface ChatSession {
  type: 'chat_session';
  savedAt: number;
  messages: AgentMessage[];
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  providerType: 'anthropic',
  providers: {
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
    },
    anthropic: {
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      defaultModel: 'claude-sonnet-4-20250514',
    },
    ollama: {
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3',
    },
    custom: {
      apiKey: '',
      baseUrl: '',
      defaultModel: '',
    },
  },
  maxIterations: 15,
  temperature: 0.2,
  maxTokens: 16384,
};
