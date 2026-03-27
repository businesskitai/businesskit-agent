# /seo-agent — SEO Audit

1. `scout.audit()` → score + issues (missing excerpts, long slugs, long titles)
2. For each issue: offer to fix (update excerpt, shorten title)
3. Category SEO: `scout.setCollectionSEO(categorySlug, { seo_title, seo_description, seo_og_image })`
4. Slug helper: `scout.suggestSlug(title)` | Meta generator: `scout.generateMeta(content)`
