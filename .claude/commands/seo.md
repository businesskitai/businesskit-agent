# /seo — SEO Agent + LLM Visibility

Audits content in Turso DB and tracks LLM visibility.
For technical SEO (crawlability, Core Web Vitals, schema markup) → use claude-seo.md alongside this agent.

## Session start
```
seoAgent.audit()        // find SEO issues across posts, compare, alternative, guides
seoAgent.contentGaps()  // missing formats, thin posts, no compare/alternative pages
seoAgent.checkLLMSTxt() // confirm llms.txt is live (app generates it, agent checks it)
```

## Fix content issues
```
"Fix all missing excerpts"
→ for each issue: seoAgent.fixPost(id, { excerpt })

"Fix titles that are too long"
→ seoAgent.fixPost(id, { seo_title: shortenedTitle })

"Set SEO for the blog collection"
→ seoAgent.setCollectionSEO('blog', { seo_title, seo_description })

"Suggest a slug"
→ seoAgent.suggestSlug(title, primaryKeyword)
```

## LLM Visibility (Arvow pattern)
Track whether ChatGPT, Claude, Gemini, Perplexity cite your brand.
```
"Check my LLM visibility"
→ seoAgent.checkLLMVisibility()
→ seoAgent.llmVisibilityAdvice(visibility)

"Update scores after checking manually"
→ seoAgent.updateLLMVisibility({ chatgpt: 3, claude: 1, perplexity: 2 })
```

Strategy to improve LLM citations:
- Write ultimate guides (3000+ words) — LLMs prefer comprehensive sources
- Add cited statistics with source URLs in posts.sources JSON
- FAQ-format articles rank high for LLM citations
- compare + alternative pages get cited heavily
- Your app generates llms.txt — keep it current with latest products/posts

## Content gaps
```
"What am I missing?"
→ seoAgent.contentGaps()
// Returns: missing content types, thin posts, missing compare/alternative tables
```

## Technical SEO (server-side — not agent's job)
These are handled by the live app or via claude-seo.md:
- robots.txt ← app serves it
- llms.txt ← app generates it (agent just checks it's live)
- sitemap.xml ← app generates it
- Core Web Vitals, schema markup, crawlability → install claude-seo.md for this:
  git clone https://github.com/AgriciDaniel/claude-seo.git && bash claude-seo/install.sh
  then: /seo audit https://yourslug.businesskit.io