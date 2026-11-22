---
name: pages
description: Assemble, update, and publish visual landing pages, storefront pages, native sections, and bespoke HTML/CSS components.
---

# Pages & Visual Builder Skill

Use this skill to design website pages, assemble modular sections, create bespoke custom components in `user_components`, and manage site publication.

---

## 1. Operating Rules & Design System

1. **Native Sections (Default)**: Assemble high-converting pages using battle-tested native section components.
2. **Design Tokens**: All pages and native sections adapt to the active profile theme:
   - Backgrounds: `var(--surface-1, #09090b)` and `var(--surface-2, #18181b)`
   - Accent / Brand: `var(--accent, #38bdf8)`
   - Text: `var(--text-primary, #ffffff)` and `var(--text-secondary, #a1a1aa)`
   - Borders: `var(--border, rgba(255, 255, 255, 0.12))`
3. **Category-Aligned Learning**:
   - When building custom components, **always inspect native blueprints in that exact category first** via `page_get_section_schema(category: "<Category>")` or by reading `references/sections-catalog.json`.
   - Never build a custom FAQ by copying Hero structure; never build Pricing without inspecting tier card structures.

---

## 2. Native Sections Catalog

The canonical blueprints and field schemas are located in:
📁 [`references/sections-catalog.json`](./references/sections-catalog.json)

| Category | Native Section Types | Description |
| :--- | :--- | :--- |
| **Navigation** | `sc_navbar` | Sticky responsive navigation bar with brand title, links, and CTA button. |
| **Hero** | `sc_hero`, `hero_section` | Primary landing banner with headline, subhead, primary/secondary action buttons, and badge. |
| **Features** | `sc_use_cases`, `sc_features` | Interactive feature tab cards or grid highlighting core capabilities. |
| **Showcase** | `sc_workspace`, `sc_under_the_hood` | Split product demo with terminal, preview code, or app screenshots. |
| **Conversion** | `pricing`, `cta_section` | Tiered pricing cards (monthly/yearly toggle), feature checklists, and purchase CTAs. |
| **Content** | `faq`, `about_section`, `text` | Accessible accordion FAQ block, company story, or rich prose. |
| **Social Proof** | `testimonials` | Customer quote cards with avatars, author roles, and star ratings. |
| **Footer** | `sc_footer` | Multi-column navigation footer with copyright and social links. |

---

## 3. Custom Component Architecture (`user_components`)

When native sections do not cover a specific bespoke layout (e.g. interactive ROI calculator, multi-column comparison matrix):

### Required Standards
1. **Category**: Assign to the matching builder category (`Hero`, `Features`, `Conversion`, `Showcase`, `Social Proof`, `Content`, `Navigation`, `Footer`).
2. **Editable Content**: Add `contenteditable="true"` and `data-field="<fieldName>"` to all customizable text:
   ```html
   <h2 contenteditable="true" data-field="title">Interactive ROI Calculator</h2>
   <p contenteditable="true" data-field="subtitle">Calculate your monthly savings...</p>
   ```
3. **Action Buttons**: Wrap clickable buttons with link metadata:
   ```html
   <a href="#" data-field="btnUrl" data-element-type="link">
     <button data-field="btnText" data-element-type="button">Calculate Now</button>
   </a>
   ```
4. **Scoped CSS**: Prefix all rules with a unique root class (e.g. `.comp-roi-custom`) and use design system CSS variables.
5. **Schema Array**: Provide field definitions for the Visual Builder inspector panel:
   ```json
   [
     { "name": "title", "label": "Headline", "type": "text" },
     { "name": "btnText", "label": "Button Label", "type": "text" },
     { "name": "btnUrl", "label": "Button Link", "type": "url" }
   ]
   ```

---

## 4. MCP Tool Workflows

### A. Inspect Blueprint Schemas
Query native schemas for a category directly from the MCP server:
```json
call_tool("page_get_section_schema", {
  "category": "Conversion"
})
```
*(Or read [`references/sections-catalog.json`](./references/sections-catalog.json) directly from this skill directory).*

---

### B. Create Custom Component
Store a reusable block in `user_components`:
```json
call_tool("component_create", {
  "name": "Developer ROI Calculator",
  "collection": "Conversion",
  "html": "<div class=\"comp-roi-custom\"><h2 contenteditable=\"true\" data-field=\"title\">Calculate Savings</h2></div>",
  "css": ".comp-roi-custom { padding: 80px 24px; background: var(--surface-1); color: var(--text-primary); }",
  "schema": [
    { "name": "title", "label": "Headline", "type": "text" }
  ]
})
```

---

### C. Assemble Complete Website Page
Compose native and custom sections in layout order:
```json
call_tool("page_create", {
  "title": "Developer Cloud Platform",
  "slug": "cloud",
  "excerpt": "Next-generation serverless platform for autonomous business agents.",
  "sections": [
    {
      "type": "sc_navbar",
      "data": { "brandName": "CloudKit", "ctaText": "Deploy Now", "ctaLink": "/signup" }
    },
    {
      "type": "sc_hero",
      "data": {
        "headline": "Deploy Serverless Apps in Seconds",
        "subheadline": "Zero config, global edge latency, automated database replication.",
        "primaryBtnText": "Get Started Free",
        "primaryBtnUrl": "/signup"
      }
    },
    {
      "type": "sc_use_cases",
      "data": { "title": "Platform Highlights", "items": [...] }
    },
    {
      "type": "custom",
      "component_id": "comp_roi_calculator_id"
    },
    {
      "type": "pricing",
      "data": { "title": "Transparent Plans", "tiers": [...] }
    },
    {
      "type": "faq",
      "data": { "items": [{ "question": "Can I self-host?", "answer": "Yes..." }] }
    },
    {
      "type": "sc_footer",
      "data": { "copyright": "© 2026 CloudKit. All rights reserved." }
    }
  ],
  "published": false
})
```

---

### D. Update Page Sections
Fetch existing structure first with `page_get`, modify sections, and save:
```json
call_tool("page_update", {
  "page_id_or_slug": "cloud",
  "sections": <updated_sections_array>
})
```

---

### E. Publish Page Live
Toggle page publication state:
```json
call_tool("page_publish", {
  "page_id_or_slug": "cloud",
  "published": true
})
```
Live URL is immediately available at `https://<domain>/cloud` (or `/pages/cloud`).
