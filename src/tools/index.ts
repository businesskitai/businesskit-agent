// src/tools/index.ts
// Aggregated BusinessKit MCP Tool Registry

import { shopTools } from './shop.js';
import { crmTools } from './crm.js';
import { contentTools } from './content.js';
import { pagesTools } from './pages.js';
import { domainTools } from './domains.js';
import { inboxTools } from './inbox.js';
import { systemTools } from './system.js';
import { getActiveProfileId, isDbConfigured, isDbReadOnly } from '../db.js';
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

const WRITE_TOOLS = new Set([
  'inventory_receive_purchase_invoice',
  'product_update_pricing',
  'inventory_add_stock',
  'invoice_create',
  'invoice_send',
  'shop_create_new_bill',
  'contact_create',
  'contact_update',
  'blog_post_create',
  'content_update',
  'page_create',
  'page_update',
  'page_publish',
  'component_create',
  'domain_set_agent_notes',
  'inbox_tool_set_category',
  'inbox_tool_set_state',
  'inbox_tool_add_label',
  'inbox_tool_link_entity',
  'inbox_tool_draft_reply',
  'inbox_tool_schedule_send',
  'inbox_tool_archive',
  'inbox_tool_save_attachments',
  'profile_switch',
]);

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

  // Enforce read-only token on write operations immediately
  if (WRITE_TOOLS.has(name) && isDbReadOnly()) {
    throw new Error(
      `Operation rejected: Database is connected in read-only mode (read-only token). Write tool '${name}' is disabled.`
    );
  }

  const profileId = await getActiveProfileId();
  const ctx: ToolContext = {
    profileId,
  };

  return await tool.handler(args, ctx);
}
