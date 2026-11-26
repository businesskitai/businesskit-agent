// src/tools/domains.ts
// Domain Management MCP Tools: Expiry Tracking & Domain Notes

import { execute, query } from '../db.js';
import type { ToolDefinition, ToolContext } from './types.js';

export const domainTools: ToolDefinition[] = [
  {
    name: 'domain_list_expiring',
    domain: 'domains',
    description:
      'List tracked domains from my_domains that are expired or expiring within N days (defaults to 30 days). Returns days left, registrar, auto-renew status, renewal price, and notes.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Lookahead horizon in days (e.g. 7, 30, 60). Defaults to 30.' },
      },
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const days = Number(args.days || 30);
      const horizonSecs = Math.floor(Date.now() / 1000) + days * 86400;

      const rows = await query(
        `SELECT id, domain_name, registrar, expiry_date, auto_renew, renewal_price, agent_notes, status
         FROM my_domains
         WHERE profile_id = ? AND (expiry_date <= ? OR status = 'expired')
         ORDER BY expiry_date ASC LIMIT 50`,
        [profileId, horizonSecs]
      );

      return {
        lookahead_days: days,
        total: rows.length,
        domains: rows.map((r: any) => ({
          id: r.id,
          domain: r.domain_name,
          registrar: r.registrar,
          expiry_date: r.expiry_date,
          auto_renew: Boolean(r.auto_renew),
          renewal_price: r.renewal_price,
          agent_notes: r.agent_notes,
          status: r.status,
        })),
      };
    },
  },
  {
    name: 'domain_set_agent_notes',
    domain: 'domains',
    description:
      'Record agent analysis, recommendation, or renewal reminders into agent_notes on a domain without overwriting user notes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: "Domain row ID or domain name (e.g. 'dom_xyz' or 'example.com')" },
        text: { type: 'string', description: 'Agent analysis or notes to save' },
      },
      required: ['id', 'text'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.id).trim();
      const text = String(args.text).trim();

      const domains = await query<{ id: string; domain_name: string }>(
        'SELECT id, domain_name FROM my_domains WHERE profile_id = ? AND (id = ? OR domain_name = ?) LIMIT 1',
        [profileId, ref, ref]
      );

      if (domains.length === 0) {
        throw new Error(`Domain not found with identifier: ${ref}`);
      }

      const domain = domains[0];
      await execute(
        "UPDATE my_domains SET agent_notes = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [text, domain.id, profileId]
      );

      return {
        id: domain.id,
        domain: domain.domain_name,
        agent_notes: text,
        status: 'updated',
      };
    },
  },
];
