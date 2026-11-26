// src/tools/inbox.ts
// Unified Inbox MCP Tools: Thread Triage, Labelling, Reply Drafting & Archiving

import { execute, generateId, query } from '../db.js';
import type { ToolDefinition, ToolContext } from './types.js';

export const inboxTools: ToolDefinition[] = [
  {
    name: 'inbox_tool_set_category',
    domain: 'inbox',
    description: "Classify an email thread into a named category bucket (e.g. 'billing', 'support', 'sales', 'spam').",
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string', description: 'Thread ID to classify (e.g. th_...)' },
        category: { type: 'string', description: "Category label to apply (e.g. 'billing', 'support', 'sales')" },
      },
      required: ['thread_id', 'category'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      const category = String(args.category).trim();

      await execute(
        "UPDATE inbox_threads SET category = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [category, threadId, profileId]
      );

      return { thread_id: threadId, category, status: 'updated' };
    },
  },
  {
    name: 'inbox_tool_set_state',
    domain: 'inbox',
    description: 'Transition an email thread state: open → snoozed, closed, or archived.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string', description: 'Thread ID (e.g. th_...)' },
        state: { type: 'string', enum: ['open', 'snoozed', 'closed', 'archived'], description: 'New thread state' },
      },
      required: ['thread_id', 'state'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      const state = String(args.state).trim();

      await execute(
        "UPDATE inbox_threads SET state = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [state, threadId, profileId]
      );

      return { thread_id: threadId, state, status: 'updated' };
    },
  },
  {
    name: 'inbox_tool_add_label',
    domain: 'inbox',
    description: "Append a label tag to a thread's label list.",
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string', description: 'Thread ID' },
        label: { type: 'string', description: "Label to add (e.g. 'vip', 'follow-up')" },
      },
      required: ['thread_id', 'label'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      const label = String(args.label).trim();

      const threads = await query<{ labels: string }>(
        'SELECT labels FROM inbox_threads WHERE id = ? AND profile_id = ? LIMIT 1',
        [threadId, profileId]
      );

      let labels: string[] = [];
      if (threads.length > 0 && threads[0].labels) {
        try {
          labels = JSON.parse(threads[0].labels);
        } catch {}
      }

      if (!labels.includes(label)) {
        labels.push(label);
      }

      await execute(
        "UPDATE inbox_threads SET labels = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [JSON.stringify(labels), threadId, profileId]
      );

      return { thread_id: threadId, labels, status: 'updated' };
    },
  },
  {
    name: 'inbox_tool_link_entity',
    domain: 'inbox',
    description: 'Link an email thread to a CRM entity such as a contact, deal, or order.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string', description: 'Thread ID' },
        entity_type: { type: 'string', description: "Entity type (e.g. 'contact', 'deal', 'order')" },
        entity_id: { type: 'string', description: 'Entity ID (e.g. ct_..., deal_...)' },
      },
      required: ['thread_id', 'entity_type', 'entity_id'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      const entityType = String(args.entity_type).trim();
      const entityId = String(args.entity_id).trim();

      await execute(
        "UPDATE inbox_threads SET entity_type = ?, entity_id = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [entityType, entityId, threadId, profileId]
      );

      return { thread_id: threadId, entity_type: entityType, entity_id: entityId, status: 'linked' };
    },
  },
  {
    name: 'inbox_tool_draft_reply',
    domain: 'inbox',
    description: 'Draft an outbound email reply stored with author=agent.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string', description: 'Thread ID to reply to' },
        mailbox_id: { type: 'string', description: 'Mailbox ID to send from' },
        body: { type: 'string', description: 'Email body text' },
        subject: { type: 'string', description: "Email subject line (default: 'Re:')" },
        to_addrs: { type: 'string', description: 'Comma-separated recipient addresses' },
      },
      required: ['thread_id', 'mailbox_id', 'body'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const msgId = generateId('msg');
      const threadId = String(args.thread_id).trim();
      const mailboxId = String(args.mailbox_id).trim();
      const body = String(args.body);
      const subject = String(args.subject || 'Re:');
      const toAddrs = String(args.to_addrs || '');

      await execute(
        `INSERT INTO inbox_messages
         (id, profile_id, thread_id, mailbox_id, direction, author, subject, body_html, to_addrs, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'outbound', 'agent', ?, ?, ?, 'draft', strftime('%s','now'), strftime('%s','now'))`,
        [msgId, profileId, threadId, mailboxId, subject, body, toAddrs]
      );

      return {
        message_id: msgId,
        thread_id: threadId,
        status: 'draft_created',
        author: 'agent',
      };
    },
  },
  {
    name: 'inbox_tool_schedule_send',
    domain: 'inbox',
    description: 'Schedule a draft message to be sent at a future Unix timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'Draft message ID' },
        send_after: { type: 'integer', description: 'Unix timestamp (seconds) when to send' },
      },
      required: ['message_id', 'send_after'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const msgId = String(args.message_id).trim();
      const sendAfter = Number(args.send_after);

      await execute(
        "UPDATE inbox_messages SET send_after = ?, state = 'scheduled', updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [sendAfter, msgId, profileId]
      );

      return { message_id: msgId, send_after: sendAfter, status: 'scheduled' };
    },
  },
  {
    name: 'inbox_tool_archive',
    domain: 'inbox',
    description: 'Archive an email thread — sets state=archived.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string', description: 'Thread ID to archive' },
      },
      required: ['thread_id'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();

      await execute(
        "UPDATE inbox_threads SET state = 'archived', updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [threadId, profileId]
      );

      return { thread_id: threadId, status: 'archived' };
    },
  },
  {
    name: 'inbox_tool_extract_verification_code',
    domain: 'inbox',
    description: 'Extract an OTP, PIN, or verification code from the latest inbound message in a thread.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string', description: 'Thread ID to scan for verification codes' },
      },
      required: ['thread_id'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();

      const msgs = await query<{ body_html: string }>(
        "SELECT body_html FROM inbox_messages WHERE thread_id = ? AND profile_id = ? AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1",
        [threadId, profileId]
      );

      if (msgs.length === 0) {
        return { thread_id: threadId, code: null, message: 'No inbound messages found in thread' };
      }

      const text = msgs[0].body_html || '';
      // Common OTP patterns (4-8 digits)
      const match = text.match(/\b(?:\d{4}|\d{6}|\d{8})\b/);

      return {
        thread_id: threadId,
        code: match ? match[0] : null,
      };
    },
  },
  {
    name: 'inbox_tool_save_attachments',
    domain: 'inbox',
    description: 'Flag all attachments on a message to be auto-filed into the media library.',
    inputSchema: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'Message ID whose attachments should be filed' },
      },
      required: ['message_id'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const messageId = String(args.message_id).trim();

      await execute(
        "UPDATE inbox_attachments SET storage = 'media' WHERE message_id = ? AND profile_id = ?",
        [messageId, profileId]
      );

      return { message_id: messageId, status: 'attachments_filed' };
    },
  },
];
