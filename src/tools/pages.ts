// src/tools/pages.ts
// Website Pages & Custom Section Components MCP Tools

import { execute, generateId, query } from '../db.js';
import type { ToolDefinition, ToolContext } from './types.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
let sectionsCatalogCache: any = null;

function getSectionsCatalog(): any {
  if (sectionsCatalogCache) return sectionsCatalogCache;
  try {
    const p = join(__dirname, '..', 'data', 'sections-catalog.json');
    sectionsCatalogCache = JSON.parse(readFileSync(p, 'utf-8'));
    return sectionsCatalogCache;
  } catch (err) {
    console.error('[Pages] Could not load sections-catalog.json:', err);
    return { sections: [], themes: [] };
  }
}

export const pagesTools: ToolDefinition[] = [
  {
    name: 'page_create',
    domain: 'pages',
    description:
      'Create a complete website page or landing page with title, slug, and visual sections. Use native sections (sc_navbar, sc_hero, sc_use_cases, sc_workspace, sc_under_the_hood, sc_footer, hero_section, pricing, faq, text). For custom HTML/CSS blocks, use component_create first and pass { "type": "custom", "component_id": id }.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Website page title (e.g. Home, About Us, Pricing)' },
        slug: { type: 'string', description: 'URL slug for the page (e.g. home, about, pricing)' },
        excerpt: { type: 'string', description: 'Short summary or meta excerpt' },
        sections: {
          type: 'array',
          description: 'List of visual section blocks.',
          items: { type: 'object' },
        },
        content: { type: 'string', description: 'Fallback text or markdown' },
        faq: {
          type: 'array',
          description: "Optional FAQ list [{ 'question': '...', 'answer': '...' }]",
          items: { type: 'object' },
        },
        seo_title: { type: 'string', description: 'SEO page title' },
        seo_description: { type: 'string', description: 'SEO meta description' },
        seo_og_image: { type: 'string', description: 'OpenGraph image URL' },
        published: { type: 'boolean', description: 'Whether to publish immediately', default: false },
      },
      required: ['title'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const title = String(args.title).trim();
      const pageId = generateId('page');
      const rawSlug =
        args.slug ||
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      const slug = rawSlug || `page-${Date.now()}`;

      const sections = JSON.stringify(args.sections || []);
      const faq = JSON.stringify(args.faq || []);
      const isPublished = args.published ? 1 : 0;

      await execute(
        `INSERT INTO pages
         (id, profile_id, slug, title, excerpt, sections, faq, published, seo_title, seo_description, seo_og_image, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`,
        [
          pageId,
          profileId,
          slug,
          title,
          args.excerpt || null,
          sections,
          faq,
          isPublished,
          args.seo_title || title,
          args.seo_description || args.excerpt || null,
          args.seo_og_image || null,
        ]
      );

      return {
        id: pageId,
        title,
        slug,
        published: isPublished === 1,
        sections_count: (args.sections || []).length,
        status: 'created',
      };
    },
  },
  {
    name: 'page_get',
    domain: 'pages',
    description: 'Fetch a website page and all its visual sections, faq, and metadata by page ID or slug.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id_or_slug: { type: 'string', description: 'Page ID or slug (e.g. about, pricing, page_xyz)' },
      },
      required: ['page_id_or_slug'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.page_id_or_slug).trim();

      const rows = await query(
        'SELECT * FROM pages WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1',
        [profileId, ref, ref]
      );

      if (rows.length === 0) {
        throw new Error(`Page not found with identifier: ${ref}`);
      }

      const p = rows[0];
      let parsedSections = [];
      let parsedFaq = [];
      try {
        parsedSections = JSON.parse(p.sections || '[]');
      } catch {}
      try {
        parsedFaq = JSON.parse(p.faq || '[]');
      } catch {}

      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        sections: parsedSections,
        faq: parsedFaq,
        published: Boolean(p.published),
        seo_title: p.seo_title,
        seo_description: p.seo_description,
        seo_og_image: p.seo_og_image,
        updated_at: p.updated_at,
      };
    },
  },
  {
    name: 'page_update',
    domain: 'pages',
    description:
      "Update an existing website page's visual sections, title, slug, excerpt, FAQ, SEO metadata, or published status.",
    inputSchema: {
      type: 'object',
      properties: {
        page_id_or_slug: { type: 'string', description: 'Page ID or slug' },
        title: { type: 'string' },
        slug: { type: 'string' },
        excerpt: { type: 'string' },
        sections: { type: 'array', items: { type: 'object' } },
        faq: { type: 'array', items: { type: 'object' } },
        published: { type: 'boolean' },
        seo_title: { type: 'string' },
        seo_description: { type: 'string' },
        seo_og_image: { type: 'string' },
      },
      required: ['page_id_or_slug'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.page_id_or_slug).trim();

      const pages = await query<{ id: string }>('SELECT id FROM pages WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1', [
        profileId,
        ref,
        ref,
      ]);

      if (pages.length === 0) {
        throw new Error(`Page not found with identifier: ${ref}`);
      }

      const id = pages[0].id;
      const updates: string[] = [];
      const params: any[] = [];

      if (args.title !== undefined) {
        updates.push('title = ?');
        params.push(args.title);
      }
      if (args.slug !== undefined) {
        updates.push('slug = ?');
        params.push(args.slug);
      }
      if (args.excerpt !== undefined) {
        updates.push('excerpt = ?');
        params.push(args.excerpt);
      }
      if (args.sections !== undefined) {
        updates.push('sections = ?');
        params.push(JSON.stringify(args.sections));
      }
      if (args.faq !== undefined) {
        updates.push('faq = ?');
        params.push(JSON.stringify(args.faq));
      }
      if (args.published !== undefined) {
        updates.push('published = ?');
        params.push(args.published ? 1 : 0);
      }
      if (args.seo_title !== undefined) {
        updates.push('seo_title = ?');
        params.push(args.seo_title);
      }
      if (args.seo_description !== undefined) {
        updates.push('seo_description = ?');
        params.push(args.seo_description);
      }
      if (args.seo_og_image !== undefined) {
        updates.push('seo_og_image = ?');
        params.push(args.seo_og_image);
      }

      if (updates.length === 0) {
        return { id, status: 'no_changes' };
      }

      updates.push("updated_at = strftime('%s','now')");
      params.push(id, profileId);

      await execute(`UPDATE pages SET ${updates.join(', ')} WHERE id = ? AND profile_id = ?`, params);

      return {
        id,
        status: 'updated',
        updated_fields: Object.keys(args).filter((k) => k !== 'page_id_or_slug'),
      };
    },
  },
  {
    name: 'page_publish',
    domain: 'pages',
    description: 'Toggle published or draft status for a website page by ID or slug.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id_or_slug: { type: 'string', description: 'Page ID or slug' },
        published: { type: 'boolean', default: true },
      },
      required: ['page_id_or_slug'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.page_id_or_slug).trim();
      const isPub = args.published !== false ? 1 : 0;

      const pages = await query<{ id: string }>('SELECT id FROM pages WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1', [
        profileId,
        ref,
        ref,
      ]);

      if (pages.length === 0) {
        throw new Error(`Page not found with identifier: ${ref}`);
      }

      const id = pages[0].id;
      await execute("UPDATE pages SET published = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?", [
        isPub,
        id,
        profileId,
      ]);

      return {
        id,
        published: isPub === 1,
        status: isPub === 1 ? 'published' : 'draft',
      };
    },
  },
  {
    name: 'page_list',
    domain: 'pages',
    description: 'List all website pages, URLs, slugs, and publication statuses for the profile.',
    inputSchema: {
      type: 'object',
      properties: {
        published_only: { type: 'boolean', description: 'Filter to only show published pages' },
      },
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      let sql = 'SELECT id, title, slug, excerpt, published, updated_at FROM pages WHERE profile_id = ?';
      const params: any[] = [profileId];

      if (args.published_only) {
        sql += ' AND published = 1';
      }
      sql += ' ORDER BY updated_at DESC LIMIT 50';

      const rows = await query(sql, params);
      return {
        total: rows.length,
        pages: rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          excerpt: r.excerpt,
          published: Boolean(r.published),
          updated_at: r.updated_at,
        })),
      };
    },
  },
  {
    name: 'component_create',
    domain: 'pages',
    description:
      'Create a bespoke custom HTML/CSS/JS section component saved in user_components. Include schema with field types for editing in Section Editor.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name' },
        html: { type: 'string', description: 'Complete HTML markup' },
        css: { type: 'string', description: 'Scoped CSS styles, optional' },
        js: { type: 'string', description: 'Client-side JS interaction logic, optional' },
        ts: { type: 'string', description: 'TS/TSX component source, optional' },
        schema: { type: 'array', description: 'Form fields for Section Editor', items: { type: 'object' } },
        collection: { type: 'string', description: 'Category name (default: Custom)', default: 'Custom' },
      },
      required: ['name', 'html'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const compId = generateId('comp');
      const name = String(args.name).trim();
      const collection = args.collection || 'Custom';

      await execute(
        `INSERT INTO user_components
         (id, profile_id, name, html, css, js, schema, collection, type, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'custom', 'agent', strftime('%s','now'), strftime('%s','now'))`,
        [
          compId,
          profileId,
          name,
          args.html,
          args.css || null,
          args.js || null,
          args.schema ? JSON.stringify(args.schema) : '[]',
          collection,
        ]
      );

      return {
        id: compId,
        name,
        collection,
        status: 'created',
      };
    },
  },
  {
    name: 'component_list',
    domain: 'pages',
    description: 'List all custom components stored in user_components for the profile.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', description: 'Optional collection filter' },
      },
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      let sql = 'SELECT id, name, collection, type, source, created_at FROM user_components WHERE profile_id = ?';
      const params: any[] = [profileId];

      if (args.collection) {
        sql += ' AND collection = ?';
        params.push(args.collection);
      }
      sql += ' ORDER BY created_at DESC LIMIT 50';

      const rows = await query(sql, params);
      return {
        total: rows.length,
        components: rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          collection: r.collection,
          type: r.type,
          created_at: r.created_at,
        })),
      };
    },
  },
  {
    name: 'component_get',
    domain: 'pages',
    description: 'Fetch a custom component by its ID with full HTML, CSS, and JS source.',
    inputSchema: {
      type: 'object',
      properties: {
        component_id: { type: 'string', description: 'Component ID (e.g. comp_xyz)' },
      },
      required: ['component_id'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.component_id).trim();

      const rows = await query(
        'SELECT * FROM user_components WHERE profile_id = ? AND id = ? LIMIT 1',
        [profileId, ref]
      );

      if (rows.length === 0) {
        throw new Error(`Component not found with ID: ${ref}`);
      }

      const c = rows[0];
      let parsedSchema = [];
      try {
        parsedSchema = JSON.parse(c.schema || '[]');
      } catch {}

      return {
        id: c.id,
        name: c.name,
        html: c.html,
        css: c.css,
        js: c.js,
        schema: parsedSchema,
        collection: c.collection,
      };
    },
  },
  {
    name: 'page_get_section_schema',
    domain: 'pages',
    description:
      'Inspect JSON schema, data fields, and reference HTML/CSS blueprints for native sections (Hero, Features, Conversion, Content, Social Proof, Showcase, Navigation, Footer). Also supports specific section_types or theme.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: "PRIMARY FILTER: Section category ('Hero', 'Features', 'Conversion', 'Content', 'Social Proof', 'Showcase', 'Navigation', 'Footer', or 'list')" },
        section_type: { type: 'string', description: 'Specific section type (e.g. sc_hero, pricing, faq)' },
        section_types: { type: 'array', items: { type: 'string' } },
        theme: { type: 'string', description: 'Theme name filter' },
        limit: { type: 'number', description: 'Max sections to return' },
      },
    },
    handler: async (args: Record<string, any>, _ctx: ToolContext) => {
      const catalog = getSectionsCatalog();
      const sections = catalog.sections || [];
      const categoryFilter = args.category?.trim().toLowerCase();
      const typeFilter = args.section_type?.trim().toLowerCase();
      const themeFilter = args.theme?.trim().toLowerCase();

      let filtered = sections;

      if (categoryFilter && categoryFilter !== 'list' && categoryFilter !== 'all') {
        filtered = filtered.filter((s: any) => s.category?.toLowerCase() === categoryFilter);
      }
      if (typeFilter) {
        filtered = filtered.filter((s: any) => s.type?.toLowerCase() === typeFilter || s.id?.toLowerCase() === typeFilter);
      }
      if (themeFilter && themeFilter !== 'list' && themeFilter !== 'all') {
        filtered = filtered.filter((s: any) => s.theme?.toLowerCase() === themeFilter);
      }

      if (args.limit) {
        filtered = filtered.slice(0, Number(args.limit));
      }

      return {
        total: filtered.length,
        categories: ['Hero', 'Navigation', 'Features', 'Showcase', 'Conversion', 'Content', 'Social Proof', 'Footer', 'Education'],
        sections: filtered,
      };
    },
  },
];
