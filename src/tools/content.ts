// src/tools/content.ts
// Content / CMS MCP Tools: Blog Posts, Docs, Newsletters, Guides, and Knowledge Hub

import { execute, generateId, query } from '../db.js';
import type { ToolDefinition, ToolContext } from './types.js';

export const contentTools: ToolDefinition[] = [
  {
    name: 'blog_post_create',
    domain: 'content',
    description:
      'Create or publish a rich HTML blog post, newsletter, docs article, guide, or custom CMS entry. Clean semantic HTML body in body_html.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the blog post, newsletter, doc, or guide' },
        body_html: {
          type: 'string',
          description:
            'Clean semantic HTML body supporting all blocks (<h2>, <h3>, <p>, lists, taskList, tables, pre data-filename, info-card, steps, accordion-group, kbd, images, video embeds). NEVER Markdown or <h1>.',
        },
        content_type: {
          type: 'string',
          description: "Target hub slug: 'blog' (default), 'n' (newsletter), 'docs', 'guides', or custom CMS slug.",
        },
        cms_id: { type: 'string', description: 'Optional target CMS UUID.' },
        collection: { type: 'string', description: 'Collection name, slug, or ID for Docs/Guides.' },
        slug: { type: 'string', description: 'Optional custom URL slug.' },
        excerpt: { type: 'string', description: '1-2 sentence teaser summary.' },
        ai_summary: { type: 'string', description: 'Concise TL;DR summary.' },
        hero_image_url: { type: 'string', description: 'Optional cover/hero image URL.' },
        media_id: { type: 'string', description: 'Optional Media Library item ID.' },
        cta_button_text: { type: 'string', description: 'Optional CTA button label.' },
        cta_button_url: { type: 'string', description: 'Optional CTA button URL.' },
        additional_details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        seo_title: { type: 'string', description: 'Optional SEO meta title.' },
        seo_description: { type: 'string', description: 'Optional SEO meta description.' },
        seo_keywords: { type: 'string', description: 'Optional SEO keywords.' },
        status: { type: 'string', enum: ['draft', 'publish', 'published'], default: 'draft' },
        published: { type: 'boolean', description: 'Publish immediately (true) or draft (false).' },
        hidden: { type: 'boolean', default: false },
        hide_author: { type: 'boolean', default: false },
      },
      required: ['title', 'body_html'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const title = String(args.title || '').trim();
      const bodyHtml = String(args.body_html || '');
      const contentType = args.content_type || 'blog';

      const postId = generateId('post');
      const rawSlug =
        args.slug ||
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      const slug = rawSlug || `post-${Date.now()}`;

      const isPublished = args.published === true || args.status === 'publish' || args.status === 'published' ? 1 : 0;
      const isHidden = args.hidden ? 1 : 0;
      const isHideAuthor = args.hide_author ? 1 : 0;

      const plainText = bodyHtml.replace(/<[^>]+>/g, ' ');
      const words = plainText.trim().split(/\s+/).filter(Boolean);
      const wordCount = words.length;
      const readingTime = Math.max(1, Math.ceil(wordCount / 200));

      await execute(
        `INSERT INTO content
         (id, profile_id, category_id, collection_id, cms_id, slug, title, body_html, excerpt, ai_summary, hero_image_url, media_id, cta_button_text, cta_button_url, additional_details, seo_title, seo_description, seo_keywords, published, hidden, hide_author, word_count, reading_time_mins, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`,
        [
          postId,
          profileId,
          contentType,
          args.collection || null,
          args.cms_id || null,
          slug,
          title,
          bodyHtml,
          args.excerpt || null,
          args.ai_summary || null,
          args.hero_image_url || null,
          args.media_id || null,
          args.cta_button_text || null,
          args.cta_button_url || null,
          args.additional_details ? JSON.stringify(args.additional_details) : '[]',
          args.seo_title || title,
          args.seo_description || args.excerpt || null,
          args.seo_keywords || null,
          isPublished,
          isHidden,
          isHideAuthor,
          wordCount,
          readingTime,
        ]
      );

      return {
        id: postId,
        title,
        slug,
        content_type: contentType,
        published: isPublished === 1,
        word_count: wordCount,
        reading_time_mins: readingTime,
        status: isPublished === 1 ? 'published' : 'draft',
      };
    },
  },
  {
    name: 'content_list',
    domain: 'content',
    description: 'List existing blog posts, newsletters, docs, guides, and custom hub entries for the active profile.',
    inputSchema: {
      type: 'object',
      properties: {
        content_type: { type: 'string', description: "Optional hub slug filter (e.g. 'blog', 'n', 'docs', 'guides')." },
        cms_id: { type: 'string', description: 'Optional target CMS UUID filter.' },
        published_only: { type: 'boolean', description: 'If true, return only published entries.', default: false },
        limit: { type: 'integer', description: 'Maximum rows to return (default 30, max 100).' },
      },
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const limit = Math.min(Number(args.limit || 30), 100);

      let sql = 'SELECT id, title, slug, excerpt, category_id, published, word_count, created_at FROM content WHERE profile_id = ?';
      const params: any[] = [profileId];

      if (args.content_type) {
        sql += ' AND category_id = ?';
        params.push(args.content_type);
      }
      if (args.cms_id) {
        sql += ' AND cms_id = ?';
        params.push(args.cms_id);
      }
      if (args.published_only) {
        sql += ' AND published = 1';
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const rows = await query(sql, params);
      return {
        total: rows.length,
        items: rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          excerpt: r.excerpt,
          content_type: r.category_id,
          published: Boolean(r.published),
          word_count: r.word_count,
          created_at: r.created_at,
        })),
      };
    },
  },
  {
    name: 'content_get',
    domain: 'content',
    description:
      'Fetch full HTML content and metadata for an existing blog post, newsletter, doc, guide, or custom hub entry by ID or slug.',
    inputSchema: {
      type: 'object',
      properties: {
        content_id_or_slug: { type: 'string', description: "Content ID (e.g. 'post_...') or URL slug." },
        content_type: { type: 'string', description: 'Optional hub slug filter.' },
        cms_id: { type: 'string', description: 'Optional target CMS UUID filter.' },
      },
      required: ['content_id_or_slug'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.content_id_or_slug).trim();

      const rows = await query(
        'SELECT * FROM content WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1',
        [profileId, ref, ref]
      );

      if (rows.length === 0) {
        throw new Error(`Content not found with identifier: ${ref}`);
      }

      const row = rows[0];
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        body_html: row.body_html,
        excerpt: row.excerpt,
        ai_summary: row.ai_summary,
        hero_image_url: row.hero_image_url,
        content_type: row.category_id,
        published: Boolean(row.published),
        word_count: row.word_count,
        reading_time_mins: row.reading_time_mins,
        seo_title: row.seo_title,
        seo_description: row.seo_description,
      };
    },
  },
  {
    name: 'content_update',
    domain: 'content',
    description:
      'Update an existing blog post, newsletter, doc, guide, or custom hub entry (HTML body, title, slug, collection, publish status, CTA, SEO).',
    inputSchema: {
      type: 'object',
      properties: {
        content_id_or_slug: { type: 'string', description: 'Target content ID or URL slug.' },
        title: { type: 'string' },
        slug: { type: 'string' },
        body_html: { type: 'string' },
        collection: { type: 'string' },
        excerpt: { type: 'string' },
        ai_summary: { type: 'string' },
        hero_image_url: { type: 'string' },
        cta_button_text: { type: 'string' },
        cta_button_url: { type: 'string' },
        seo_title: { type: 'string' },
        seo_description: { type: 'string' },
        seo_keywords: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'publish', 'published'] },
        published: { type: 'boolean' },
        hidden: { type: 'boolean' },
        hide_author: { type: 'boolean' },
      },
      required: ['content_id_or_slug'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.content_id_or_slug).trim();

      const rows = await query<{ id: string }>('SELECT id FROM content WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1', [
        profileId,
        ref,
        ref,
      ]);

      if (rows.length === 0) {
        throw new Error(`Content not found with identifier: ${ref}`);
      }

      const id = rows[0].id;
      const updates: string[] = [];
      const params: any[] = [];

      const stringFields = [
        'title',
        'slug',
        'body_html',
        'collection',
        'excerpt',
        'ai_summary',
        'hero_image_url',
        'cta_button_text',
        'cta_button_url',
        'seo_title',
        'seo_description',
        'seo_keywords',
      ];

      for (const field of stringFields) {
        if (args[field] !== undefined) {
          const col = field === 'collection' ? 'collection_id' : field;
          updates.push(`${col} = ?`);
          params.push(args[field]);
        }
      }

      if (args.published !== undefined) {
        updates.push('published = ?');
        params.push(args.published ? 1 : 0);
      } else if (args.status !== undefined) {
        updates.push('published = ?');
        params.push(args.status === 'publish' || args.status === 'published' ? 1 : 0);
      }

      if (args.hidden !== undefined) {
        updates.push('hidden = ?');
        params.push(args.hidden ? 1 : 0);
      }
      if (args.hide_author !== undefined) {
        updates.push('hide_author = ?');
        params.push(args.hide_author ? 1 : 0);
      }

      if (args.body_html) {
        const words = args.body_html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean);
        updates.push('word_count = ?', 'reading_time_mins = ?');
        params.push(words.length, Math.max(1, Math.ceil(words.length / 200)));
      }

      if (updates.length === 0) {
        return { id, status: 'no_changes' };
      }

      updates.push("updated_at = strftime('%s','now')");
      params.push(id, profileId);

      await execute(`UPDATE content SET ${updates.join(', ')} WHERE id = ? AND profile_id = ?`, params);

      return {
        id,
        status: 'updated',
        updated_fields: Object.keys(args).filter((k) => k !== 'content_id_or_slug'),
      };
    },
  },
];
