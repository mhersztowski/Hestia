/**
 * OpenAI-compatible provider (OpenAI, Ollama, Azure, LiteLLM, vLLM, custom endpoints)
 */

import type { AiChatRequest, AiChatResponse, AiProviderConfig, AiProvider } from '../types';

export class OpenAiCompatibleProvider implements AiProvider {
  async chat(request: AiChatRequest, config: AiProviderConfig): Promise<AiChatResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      model: request.model || config.defaultModel,
      messages: request.messages.map(m => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg: Record<string, any> = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    };

    if (request.tools?.length) {
      body.tools = request.tools;
      if (request.tool_choice) body.tool_choice = request.tool_choice;
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      model: data.model || request.model || config.defaultModel,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      } : undefined,
      finishReason: choice?.finish_reason,
      toolCalls: choice?.message?.tool_calls || undefined,
    };
  }
}
