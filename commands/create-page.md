---
id: "cmd_create_page"
name: "Create Website Page"
slash: "/create-page"
description: "Draft a new landing page or website page with title and slug"
domain_tags: ["pages"]
required_tools: ["page_create", "page_get_section_schema"]
---

# Create Website Page (`/create-page`)

Autonomously compose and create a high-converting, responsive website or landing page using native visual sections or custom blocks.

## Available Tools
- `page_create(title: string, slug: string, excerpt?: string, sections?: array, published?: boolean)`: Creates a new page.
- `page_get_section_schema(category?: string, section_types?: array)`: Inspects native section schemas and theme design tokens.

## Accepted Arguments
The user may provide:
- A page topic or title: `/create-page About Us` or `/create-page Black Friday Sale`
- A slug: `/create-page pricing`
- Full requirements including sections, style preferences, or target audience.

## Section Assembly Rules
Assemble the page using native modular section types that fit the page purpose:
- **Header**: `sc_navbar` — Sticky responsive navigation with brand logo and CTA button.
- **Hero**: `sc_hero` or `hero_section` — High-impact hero banner with headline, subtitle, and primary/secondary action buttons.
- **Features / Benefits**: `sc_use_cases` or `sc_features` — Grid or card layout highlighting capabilities.
- **Showcase / Proof**: `sc_workspace` or `sc_under_the_hood` — Interactive demo preview or split screenshot.
- **Pricing / Conversion**: `pricing` or `cta_section` — Tiered price cards with feature checks and conversion buttons.
- **Content / FAQ**: `faq` or `text` — Accordion FAQ block for objection handling.
- **Footer**: `sc_footer` — Multi-column site footer with navigation links and copyright.

## Design System & Theme Alignment
All native sections automatically adopt the business design tokens:
- Background: `var(--surface-1)` (#09090b) and `var(--surface-2)` (#18181b)
- Accent: `var(--accent)` (#38bdf8)
- Text: `var(--text-primary)` (#ffffff) and `var(--text-secondary)` (#a1a1aa)

## Execution Protocol

### Step 1: Analyze Page Goals & Business Context
1. Extract title and derive a clean URL-friendly slug (e.g. `About Us` $\rightarrow$ `about`).
2. Identify the target audience and business offering.
3. Tailor realistic, engaging copy for each section (avoid generic lorem ipsum).

### Step 2: Assemble Sections JSON
Construct a structured array of sections:
```json
[
  {
    "type": "sc_navbar",
    "data": { "brandName": "My Store", "ctaText": "Get Started", "ctaLink": "/signup" }
  },
  {
    "type": "sc_hero",
    "data": {
      "headline": "Empower Your Business Workflow",
      "subheadline": "All-in-one platform for sales, billing, and content management.",
      "primaryBtnText": "Start Free Trial",
      "primaryBtnUrl": "/pricing"
    }
  },
  {
    "type": "sc_use_cases",
    "data": { "title": "Why Choose Us", "items": [...] }
  },
  {
    "type": "faq",
    "data": { "items": [{ "question": "How does it work?", "answer": "..." }] }
  },
  {
    "type": "sc_footer",
    "data": { "copyright": "© 2026 My Business. All rights reserved." }
  }
]
```

### Step 3: Create the Page
Call `page_create` with:
```json
{
  "title": "<Page Title>",
  "slug": "<slug>",
  "excerpt": "<Short meta description>",
  "sections": [...],
  "published": false
}
```

### Step 4: Report Results
1. Output page summary: Title, slug, total sections configured.
2. Provide preview link: `/pages/<slug>`
3. Explain next actions:
   - Preview or test live: `/publish-page <slug>`
   - Customize specific sections: `/update-page <slug>`
