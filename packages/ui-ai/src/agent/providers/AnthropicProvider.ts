/**
 * Anthropic provider (Claude API)
 * Requires anthropic-dangerous-direct-browser-access header for direct browser calls.
 */

import type { AiChatMessage, AiChatResponse, AiChatRequest, AiProviderConfig, AiToolCall, AiProvider } from '../types';
import { getTextContent } from '../types';

/**
 * Some Claude models deprecated `temperature` and reject it with HTTP 400
 * ("temperature is deprecated for this model"). Omit it only for those — other
 * models (incl. opus-4-6, sonnet) still accept it. Extend this list as needed.
 */
const TEMPERATURE_UNSUPPORTED = [/opus-4-8/, /sonnet-5/, /opus-5/, /haiku-5/, /fable-5/];

function modelAcceptsTemperature(model: string): boolean {
  return !TEMPERATURE_UNSUPPORTED.some(re => re.test(model));
}

export class AnthropicProvider implements AiProvider {
  async chat(request: AiChatRequest, config: AiProviderConfig): Promise<AiChatResponse> {
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    const model = request.model || config.defaultModel;
    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens || 4096,
      messages: this.mapMessages(nonSystemMessages),
    };

    if (request.temperature !== undefined && modelAcceptsTemperature(model)) {
      body.temperature = request.temperature;
    }

    if (systemMessages.length > 0) {
      body.system = systemMessages.map(m => getTextContent(m.content)).join('\n\n');
    }

    if (request.tools?.length) {
      body.tools = request.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const response = await fetch(`${config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolUseBlocks = data.content?.filter((b: any) => b.type === 'tool_use') || [];
    const toolCalls: AiToolCall[] | undefined = toolUseBlocks.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? toolUseBlocks.map((b: any) => ({
          id: b.id,
          type: 'function' as const,
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input),
          },
        }))
      : undefined;

    return {
      content: textBlock?.text || '',
      model: data.model || request.model || config.defaultModel,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      } : undefined,
      finishReason: data.stop_reason,
      toolCalls,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapMessages(messages: AiChatMessage[]): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = [];

    for (const m of messages) {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content: any[] = [];
        const textContent = getTextContent(m.content);
        if (textContent) {
          content.push({ type: 'text', text: textContent });
        }
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
        result.push({ role: 'assistant', content });
      } else if (m.role === 'tool') {
        result.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.tool_call_id,
            content: getTextContent(m.content),
          }],
        });
      } else if (typeof m.content === 'string') {
        result.push({ role: m.role, content: m.content });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anthropicContent: any[] = m.content.map(block => {
          if (block.type === 'text') {
            return { type: 'text', text: block.text };
          }
          if (block.type === 'image_url') {
            const dataUrlMatch = block.image_url.url.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
            if (dataUrlMatch) {
              return {
                type: 'image',
                source: { type: 'base64', media_type: dataUrlMatch[1], data: dataUrlMatch[2] },
              };
            }
            return {
              type: 'image',
              source: { type: 'url', url: block.image_url.url },
            };
          }
          return block;
        });
        result.push({ role: m.role, content: anthropicContent });
      }
    }

    return result;
  }
}
