// src/tools/system.ts
// Platform Introspection & Profile Management MCP Tools

import { getActiveProfileId, setActiveProfileId, query, isDbConfigured } from '../db.js';
import type { ToolDefinition, ToolContext } from './types.js';

export const systemTools: ToolDefinition[] = [
  {
    name: 'system_get_capabilities',
    domain: 'system',
    description:
      'Discover all available BusinessKit platform capabilities, domains, tool counts, and features. Call when the user asks what abilities, tools, or domains exist.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: "Optional domain filter (e.g. 'shop', 'crm', 'content', 'pages', 'domains')" },
      },
    },
    handler: async (args: Record<string, any>, _ctx: ToolContext) => {
      const filter = args.domain?.toLowerCase()?.trim();
      const domains = [
        { name: 'shop', description: 'Shop, inventory restock, purchase invoices, billing, and stock ledger' },
        { name: 'crm', description: 'Customer relationship management, leads, contacts, and outreach' },
        {
          name: 'content',
          description: 'Multi-hub CMS content publishing (blog, docs, guides, notes, newsletter) with rich HTML',
        },
        { name: 'pages', description: 'Website pages, landing pages, site content, and publishing' },
        { name: 'domains', description: 'Domain portfolio management, RDAP status, expiry tracking, and renewal reminders' },
        { name: 'inbox', description: 'Unified inbox — thread triage, labelling, reply drafting, scheduling, and archiving' },
        { name: 'system', description: 'Platform introspection, profile switching, and agent system utilities' },
      ];

      const matchingDomains = filter && filter !== 'all' ? domains.filter((d) => d.name === filter) : domains;

      return {
        platform: 'BusinessKit',
        architecture: 'Model Context Protocol (MCP) stdio JSON-RPC server',
        active_domains: matchingDomains,
        database_connected: isDbConfigured(),
        total_tools: 36,
      };
    },
  },
  {
    name: 'profile_list',
    domain: 'system',
    description: 'List all business/organization profiles available in the active database and check which one is active.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async (_args: Record<string, any>, ctx: ToolContext) => {
      let profiles: any[] = [];
      if (isDbConfigured()) {
        try {
          profiles = await query<{ id: string; title?: string; slug?: string }>('SELECT id, title, slug FROM profiles LIMIT 50');
        } catch (err) {
          console.error('[Profile] Profiles query error:', err);
        }
      }

      return {
        active_profile: ctx.profileId,
        available_profiles: profiles.length > 0 ? profiles : [{ id: ctx.profileId, title: 'Default Business' }],
        total: profiles.length > 0 ? profiles.length : 1,
      };
    },
  },
  {
    name: 'profile_switch',
    domain: 'system',
    description: 'Switch the active business/organization profile for this MCP session.',
    inputSchema: {
      type: 'object',
      properties: {
        profile_id: { type: 'string', description: 'The profile ID to switch to' },
      },
      required: ['profile_id'],
    },
    handler: async (args: Record<string, any>, _ctx: ToolContext) => {
      const newProfileId = String(args.profile_id).trim();
      if (!newProfileId) {
        throw new Error('profile_id is required');
      }
      setActiveProfileId(newProfileId);
      return {
        success: true,
        active_profile: newProfileId,
        status: 'switched',
      };
    },
  },
];
