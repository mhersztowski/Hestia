/**
 * AI tool definitions for web browsing (proxied through the backend).
 */

import type { AiToolDefinition } from '../types';

export function buildWebToolDefinitions(): AiToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'web_fetch',
        description:
          'Fetch a web page or URL and return its text content. Useful for reading documentation, tutorials, or any public web page. HTML is stripped to plain text.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The full URL to fetch (must start with http:// or https://)',
            },
          },
          required: ['url'],
        },
      },
    },
  ];
}

export async function executeWebTool(
  toolName: string,
  args: Record<string, unknown>,
  webFetchUrl: string,
  authToken?: string,
): Promise<string> {
  if (toolName !== 'web_fetch') {
    return JSON.stringify({ error: `Unknown web tool: ${toolName}` });
  }

  const url = args.url as string;
  if (!url) return JSON.stringify({ error: 'url is required' });

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(webFetchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) return JSON.stringify({ error: data.error ?? `HTTP ${res.status}` });
    // Surface non-2xx status codes from the proxied target as errors so the AI knows to adjust
    if (typeof data.statusCode === 'number' && data.statusCode >= 400) {
      return JSON.stringify({ error: `Target URL returned HTTP ${data.statusCode}`, ...data });
    }
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}
