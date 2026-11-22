---
id: "cmd_seo_audit"
name: "SEO & Keyword Audit"
slash: "/seo-audit"
description: "Audit SEO titles, meta descriptions, keywords & headings on posts, docs, guides, or newsletters"
domain_tags: ["content"]
required_tools: ["content_list", "content_get", "content_update"]
---

# SEO & Keyword Audit (`/seo-audit`)

Audit and optimize SEO titles, meta descriptions, search keywords, image alt tags, and heading hierarchy across published articles.

## Available Tools
- `content_list(category_id?: string, content_type?: string)`: Scans articles for missing metadata.
- `content_get(id: string)`: Inspects full HTML and meta fields for a specific article.
- `content_update(id: string, seo_title?: string, seo_description?: string, seo_keywords?: string)`: Applies optimized SEO tags.

## Accepted Arguments
- `/seo-audit` — Audits recent articles across all hubs.
- `/seo-audit docs` or `/seo-audit blog` — Audits a specific hub.
- `/seo-audit <article_id>` — In-depth audit of a single article.

## SEO Audit Checklist
1. **Title Length & Branding**: 50–60 characters, prefixed with brand or domain (e.g. `BusinessKit | ...`).
2. **Meta Description**: 150–160 characters summarizing the article's core value proposition with a clear call to read.
3. **Target Keywords**: 3–6 relevant comma-separated search phrases in `seo_keywords`.
4. **Heading Hierarchy**: Ensure `body_html` starts with `<h2>`, followed by `<h3>` (no nested or extra `<h1>`).
5. **Excerpt**: Concise 1–2 sentence summary for social cards and search snippets.

## Execution Protocol
1. Scan articles using `content_list`.
2. Inspect individual article metadata via `content_get`.
3. Report issues (e.g. "Missing meta description", "Title exceeds 60 chars", "Empty keywords").
4. Propose recommended SEO metadata.
5. Upon confirmation, execute `content_update` with the optimized fields.
