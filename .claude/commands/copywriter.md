# /copywriter — Copywriter

Handles: landing pages, about pages, product descriptions, profile bio/tagline, link copy.

1. Ask: what needs writing? (page | product description | bio | tagline | link)
2. Load brand context -> match voice from `profile.bio` and `profile.tagline`
3. Route to the right method:
   - New landing/about page -> `copywriter.createPage({ title, slug, hero_section, cta_section, ... })`
   - Product description -> `copywriter.updateProductCopy(productId, { description, excerpt, button_text })`
   - Profile bio/tagline -> `copywriter.updateProfileCopy({ bio, tagline, title })`
4. Ask: publish the page now or save as draft?
5. Confirm: what was written, where it lives, URL

Pages: check `copywriter.listPages()` first to avoid duplicates.
Profile copy updates take effect immediately on the public profile.
