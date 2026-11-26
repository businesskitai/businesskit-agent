// src/tools/index.ts
// Aggregated BusinessKit MCP Tool Registry

import { shopTools } from './shop.js';
import { crmTools } from './crm.js';
import { contentTools } from './content.js';
import { pagesTools } from './pages.js';
import { domainTools } from './domains.js';
import { inboxTools } from './inbox.js';
import { systemTools } from './system.js';
import { getActiveProfileId, isDbConfigured } from '../db.js';
import type { ToolDefinition, ToolContext } from './types.js';

export * from './types.js';

export const allTools: ToolDefinition[] = [
  ...shopTools,
  ...crmTools,
  ...contentTools,
  ...pagesTools,
  ...domainTools,
  ...inboxTools,
  ...systemTools,
];

const toolMap = new Map<string, ToolDefinition>();
for (const tool of allTools) {
  toolMap.set(tool.name, tool);
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

export function getAllToolDefinitions() {
  return allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export async function dispatchTool(name: string, args: Record<string, any>): Promise<any> {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Tools that don't need database connection
  const offlineTools = ['system_get_capabilities', 'page_get_section_schema'];
  if (offlineTools.includes(name)) {
    return await tool.handler(args, { profileId: 'system' });
  }

  if (!isDbConfigured()) {
    throw new Error(
      `Database connection not configured. To execute '${name}', please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your .env file or environment variables.`
    );
  }

  const profileId = await getActiveProfileId();
  const ctx: ToolContext = {
    profileId,
  };

  return await tool.handler(args, ctx);
}
