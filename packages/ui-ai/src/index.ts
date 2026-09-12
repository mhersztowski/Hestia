/**
 * `@hestia/ui-ai` — the AI assistant, moved over from MyCastle's
 * `packages/ui-texteditor/src/monaco/agent`.
 *
 * The engine, the model providers (Anthropic and anything OpenAI-compatible),
 * the file and web tools, and the chat panel. A package of its own because an
 * assistant is a thing a page may or may not want, and the ones that do not
 * should carry no part of it — see `driveAssistant` for how it reaches a drive
 * without the drive knowing what a model provider is.
 *
 * Its file tools work on a `FileSystemProvider` from `@hestia/core`, which is
 * the same VFS abstraction MyCastle used, so the agent kept working unchanged.
 */

export { AgentEngine } from './agent/engine/AgentEngine';
export { AgentPanel } from './agent/ui/AgentPanel';
export type { AgentPanelHandle } from './agent/ui/AgentPanel';
export { ChatSessionViewer } from './agent/ui/ChatSessionViewer';
export { AnthropicProvider } from './agent/providers/AnthropicProvider';
export { OpenAiCompatibleProvider } from './agent/providers/OpenAiCompatibleProvider';
export { buildVfsToolDefinitions } from './agent/tools/vfsTools';
export { DEFAULT_AGENT_CONFIG } from './agent/types';
export type {
    AiProvider, AiProviderConfig, AiProviderType, AiChatRequest, AiChatResponse, AiChatMessage,
    AiToolDefinition, AiToolCall, AgentConfig, AgentMessage, ChatAttachment, ChatSession,
} from './agent/types';

export { driveAssistant } from './driveAssistant';
export type { DriveAssistantOptions } from './driveAssistant';
