// src/server.ts
// BusinessKit Model Context Protocol (MCP) stdio server

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { getAllToolDefinitions, dispatchTool } from './tools/index.js';
import { isDbConfigured } from './db.js';

export async function startServer(): Promise<void> {
  const server = new Server(
    {
      name: 'io.github.businesskitai/agent',
      version: '1.0.6',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getAllToolDefinitions(),
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatchTool(name, args || {});
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
        isError: false,
      };
    } catch (err: any) {
      console.error(`[MCP Error] tool '${name}' failed:`, err);
      return {
        content: [
          {
            type: 'text',
            text: err?.message || String(err),
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[BusinessKit MCP] Server listening on stdio transport.');
  console.error(`[BusinessKit MCP] Database connection status: ${isDbConfigured() ? 'CONFIGURED' : 'NOT CONFIGURED (set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env)'}`);
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  startServer().catch((err) => {
    console.error('[BusinessKit MCP] Fatal startup error:', err);
    process.exit(1);
  });
}
