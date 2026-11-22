---
id: "cmd_create_component"
name: "Create Custom Component"
slash: "/create-component"
description: "Generate a custom HTML/CSS/JS component saved in user_components"
domain_tags: ["pages"]
required_tools: ["component_create", "page_get_section_schema"]
---

# Create Custom Component (`/create-component`)

Create a bespoke custom HTML/CSS component block saved in `user_components` for the Visual Page Builder.

## Available Tools
- `page_get_section_schema(category?: string)`: Inspects native section blueprints in a specific category.
- `component_create(name: string, collection: string, html: string, css: string, schema?: array)`: Stores a new custom component in `user_components`.

## Accepted Arguments
- `/create-component <name>` e.g. `/create-component Dark Pricing Table`
- With category hint: `/create-component category:Conversion name:Annual Billing Toggle`
- With full design brief: `/create-component ROI Calculator with slider and monthly savings`

## Mandatory Workflow

### Step 1: Identify Functional Category
Every component MUST belong to one of the Visual Page Builder modal categories:
- `Hero` — Intro banners, headlines, top CTA
- `Features` — Feature lists, benefit grids, tabbed cards
- `Conversion` — Pricing tables, purchase cards, email capture, CTA banners
- `Showcase` — Product demos, split terminal views, screenshot galleries
- `Social Proof` — Customer testimonials, logo bars, reviews, rating badges
- `Content` — Accordion FAQs, text blocks, team bios
- `Navigation` — Header bars, floating menus
- `Footer` — Site footers, legal disclaimer blocks

### Step 2: Mandatory Blueprint Inspection
Before writing bespoke code, you **MUST inspect the matching category blueprints**:
```json
{
  "category": "<matching_category>"
}
```
Examine how native components structure their responsive layout, CSS variables, and interactive elements.

### Step 3: Write Production-Grade HTML
- **Editable Fields**: Add `contenteditable="true"` and `data-field="<fieldName>"` to all customizable text:
  ```html
  <h2 contenteditable="true" data-field="headline">Custom Section Headline</h2>
  <p contenteditable="true" data-field="description">Detailed description text...</p>
  ```
- **Action Buttons & Links**:
  ```html
  <a href="#" data-field="primaryBtnUrl" data-element-type="link">
    <button data-field="primaryBtnText" data-element-type="button">Get Started</button>
  </a>
  ```

### Step 4: Write Scoped CSS
- Prefix ALL selectors with a unique root class (e.g. `.comp-roi-custom`):
  ```css
  .comp-roi-custom {
    padding: 80px 24px;
    background: var(--surface-1, #09090b);
    color: var(--text-primary, #ffffff);
  }
  .comp-roi-custom .comp-title {
    font-size: 2rem;
    font-weight: 700;
  }
  ```
- Use design system CSS tokens:
  - Backgrounds: `var(--surface-1)`, `var(--surface-2)`
  - Brand Accent: `var(--accent)`
  - Text Colors: `var(--text-primary)`, `var(--text-secondary)`
  - Borders: `var(--border-subtle)`

### Step 5: Define Component Schema
Provide field metadata so users can edit values in the Visual Builder inspector:
```json
[
  { "name": "headline", "label": "Main Headline", "type": "text" },
  { "name": "description", "label": "Body Description", "type": "textarea" },
  { "name": "primaryBtnText", "label": "Button Label", "type": "text" },
  { "name": "primaryBtnUrl", "label": "Button Link", "type": "url" },
  { "name": "accentColor", "label": "Accent Color", "type": "color" }
]
```

### Step 6: Execute Creation
Call `component_create` with:
```json
{
  "name": "<Descriptive Name>",
  "collection": "<Category>",
  "html": "<semantic_html>",
  "css": "<scoped_css>",
  "schema": [...]
}
```

### Step 7: Output Component Snippet
1. Report the created component ID and name.
2. Provide the JSON snippet for inserting this component into a page:
   ```json
   {
     "type": "custom",
     "component_id": "<returned_component_id>"
   }
   ```
