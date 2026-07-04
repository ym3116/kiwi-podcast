import { Injectable } from '@nestjs/common';

interface JsonRpcResponse {
  result?: unknown;
  error?: {
    message?: string;
    code?: number;
  };
}

@Injectable()
export class KiwiMcpClient {
  private readonly kiwiApiBase = (process.env.KIWI_API_BASE ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );

  async readResource(accessToken: string, uri: string): Promise<unknown> {
    let rpcId = 1;
    let sessionId: string | null = null;

    const post = async (payload: Record<string, unknown>): Promise<JsonRpcResponse | null> => {
      const response = await fetch(`${this.kiwiApiBase}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2024-11-05',
          Authorization: `Bearer ${accessToken}`,
          ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
        },
        body: JSON.stringify(payload),
      });

      sessionId = response.headers.get('mcp-session-id') || sessionId;
      const body = await this.parseResponse(response);

      if (!response.ok) {
        throw new Error(this.errorMessage(body) || `Kiwi MCP returned ${response.status}`);
      }

      return body as JsonRpcResponse | null;
    };

    const init = await post({
      jsonrpc: '2.0',
      id: rpcId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'kiwi-podcast-api', version: '0.1.0' },
      },
    });

    if (init?.error) {
      throw new Error(init.error.message || 'Kiwi MCP initialize failed');
    }

    await post({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });

    const resource = await post({
      jsonrpc: '2.0',
      id: rpcId,
      method: 'resources/read',
      params: { uri },
    });

    if (resource?.error) {
      throw new Error(resource.error.message || `Kiwi MCP resource read failed for ${uri}`);
    }

    return this.extractResourceJson(resource?.result);
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text.trim()) return null;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream') || text.trim().startsWith('event:')) {
      const messages: unknown[] = [];
      for (const block of text.split(/\n\n+/)) {
        const data = block
          .split(/\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (!data || data === '[DONE]') continue;
        messages.push(JSON.parse(data));
      }
      return messages.at(-1) ?? null;
    }

    return JSON.parse(text);
  }

  private extractResourceJson(result: unknown): unknown {
    const contents = (result as { contents?: Array<{ text?: string }> } | undefined)?.contents;
    const text = contents?.[0]?.text;
    if (!text) return result;
    return JSON.parse(text);
  }

  private errorMessage(body: unknown): string | null {
    const error = (body as JsonRpcResponse | null)?.error;
    return error?.message ?? null;
  }
}
