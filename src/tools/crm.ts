// src/tools/crm.ts
// CRM MCP Tools: Contact & Lead Management

import { execute, generateId, query } from '../db.js';
import type { ToolDefinition, ToolContext } from './types.js';

export const crmTools: ToolDefinition[] = [
  {
    name: 'contact_create',
    domain: 'crm',
    description: 'Create a new contact or lead in the CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the contact' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const name = String(args.name || '').trim();
      const email = String(args.email || '').trim();
      const phone = String(args.phone || '').trim();
      const tags = JSON.stringify(args.tags || []);

      const parts = name.split(/\s+/);
      const firstName = parts[0] || name;
      const lastName = parts.slice(1).join(' ');

      const contactId = generateId('ct');

      await execute(
        `INSERT INTO crm_contacts
         (id, profile_id, first_name, last_name, email, phone, tags, status, outreach_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'lead', 'not_contacted', strftime('%s','now'), strftime('%s','now'))`,
        [contactId, profileId, firstName, lastName, email, phone, tags]
      );

      return {
        contact_id: contactId,
        name,
        email,
        phone,
        status: 'created',
      };
    },
  },
  {
    name: 'contact_update',
    domain: 'crm',
    description: 'Update fields on an existing CRM contact.',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'Contact ID or email address' },
        fields: {
          type: 'object',
          description: 'Partial fields to update, e.g. { "email": "...", "phone": "...", "company": "..." }',
        },
      },
      required: ['contact_id', 'fields'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.contact_id).trim();
      const fields = args.fields || {};

      const contacts = await query<{ id: string }>(
        'SELECT id FROM crm_contacts WHERE profile_id = ? AND (id = ? OR email = ?) LIMIT 1',
        [profileId, ref, ref]
      );

      if (contacts.length === 0) {
        throw new Error(`Contact not found with identifier: ${ref}`);
      }

      const contactId = contacts[0].id;
      const allowedCols = [
        'first_name',
        'last_name',
        'email',
        'phone',
        'company',
        'job_title',
        'website',
        'bio',
        'status',
        'outreach_status',
        'notes',
        'tags',
      ];

      const updates: string[] = [];
      const params: any[] = [];

      for (const [k, v] of Object.entries(fields)) {
        if (allowedCols.includes(k)) {
          updates.push(`${k} = ?`);
          params.push(typeof v === 'object' ? JSON.stringify(v) : v);
        }
      }

      if (updates.length === 0) {
        return { contact_id: contactId, status: 'no_changes' };
      }

      updates.push("updated_at = strftime('%s','now')");
      params.push(contactId, profileId);

      await execute(`UPDATE crm_contacts SET ${updates.join(', ')} WHERE id = ? AND profile_id = ?`, params);

      return {
        contact_id: contactId,
        status: 'updated',
        updated_fields: Object.keys(fields),
      };
    },
  },
];
