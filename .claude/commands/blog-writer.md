# /blog-writer — Write Blog Post

1. Load brand context. Check last 3 posts for tone.
2. Ask: title (required), key points or full content, publish now or draft?
3. Auto-generate 155-char excerpt for SEO.
4. `blake.create({ title, content, excerpt, publish })`
5. Confirm: title, slug, status.

After: `/seo-agent` to audit SEO | `/social-agent` to distribute if published.
