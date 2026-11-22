---
name: brand
version: 2.0.0
description: Load business brand identity, voice guidelines, tone compass, and store context via BusinessKit tools.
---

# Brand Context & Voice

Use this skill before drafting marketing copy, documentation, landing pages, or emails to ensure consistent tone and voice.

## 1. Load Brand Context via Tools

Inspect active business context using the native `system_get_capabilities` tool:

```json
call_tool("system_get_capabilities", {})
```

### Brand Parameters Returned

| Field | Purpose |
|---|---|
| `business_name` / `site_title` | Canonical business name — use in headlines, titles, subject lines, and CTAs |
| `industry` | Target market context (e.g. Retail, SaaS, Healthcare, Manufacturing) |
| `currency` | Currency symbol & formatting for pricing ($ vs. ₹ vs. €) |
| `location` / `country` | Localized terminology, regional spelling, and tax jurisdiction |

---

## 2. Voice & Tone Rules

1. **Brand Compass**: Match the business industry and site description:
   - For technical developer tools: Direct, precise, minimal fluff, active voice.
   - For retail & consumer storefronts: Warm, inviting, clear value propositions, benefit-driven.
   - For enterprise B2B: Authoritative, results-focused, data-backed.
2. **Tone Consistency**:
   - Check the last 3 published posts via `content_list` to calibrate reading level:
     ```json
     call_tool("content_list", { "published_only": true })
     ```
3. **Core Copywriting Rules**:
   - Always include a clear Call to Action (CTA).
   - Write separate `excerpt` and `seo_description` optimized for social previews and search snippets.
   - Keep SEO titles under 60 characters and prefix with the brand name.
