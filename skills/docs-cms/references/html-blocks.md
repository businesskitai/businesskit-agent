# Universal TipTap HTML Blocks Reference (All CMS Hubs)

This reference defines all supported HTML elements, data-type widgets, inline styling, and hub-specific blueprints recognized by the native BusinessKit CMS engine (`src-tauri/src/commands/agents/prompts/content.rs`).

---

## 1. Universal HTML Block Contract

When passing `body_html` to `blog_post_create` or `content_update`:
- **NEVER** use Markdown syntax (`##`, `*`, ` ``` `, `- `, `|col|`).
- **NEVER** emit `<h1>` tags (`title` automatically renders as `<h1>`). Body headings start with `<h2>`.
- **NEVER** use raw `<details>` or inline `<svg>` in callouts (use the native `data-type` widgets below).
- **HTML-Escape** special characters `&`, `<`, `>` inside `<code>` blocks (`&amp;`, `&lt;`, `&gt;`).

---

## 2. Supported HTML Elements & Snippets

### A. Headings & Prose
```html
<h2>Section Heading</h2>
<h3>Sub-Section Heading</h3>
<p>Clean conversational or technical paragraph.</p>
<hr />
<blockquote><p>Editorial insight or notable pull-quote.</p></blockquote>
<ul>
  <li>First bullet point</li>
  <li>Second bullet point</li>
</ul>
<ol>
  <li>First ordered item</li>
  <li>Second ordered item</li>
</ol>
```

### B. Inline Styling
- Strong: `<strong>Bold text</strong>`
- Emphasis: `<em>Italicized text</em>`
- Underline: `<u>Underlined text</u>`
- Strikethrough: `<s>Strikethrough text</s>`
- Link: `<a href="https://businesskit.ai">Visit website</a>`
- Inline Code: `<code>inline_variable</code>`
- Keyboard Shortcut: `<kbd class="tech-kbd">⌘K</kbd>` or `<kbd class="tech-kbd">Ctrl+S</kbd>`

### C. Checklist / Task Lists
```html
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false">
    <label><input type="checkbox" /></label>
    <div><p>Uncompleted task item</p></div>
  </li>
  <li data-type="taskItem" data-checked="true">
    <label><input type="checkbox" checked="checked" /></label>
    <div><p>Completed task item</p></div>
  </li>
</ul>
```

### D. Code Blocks & Named Config Files
Named file:
```html
<pre data-filename="businesskit.json"><code class="language-json">{
  "profile": "default"
}</code></pre>
```
Standard terminal snippet:
```html
<pre><code class="language-bash">businesskit --mcp
npm run build</code></pre>
```

### E. Tables & Comparison Matrices
```html
<table>
  <thead>
    <tr>
      <th>Feature</th>
      <th>Starter</th>
      <th>Pro</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>POS Receipts</td>
      <td>Unlimited</td>
      <td>Unlimited</td>
    </tr>
    <tr>
      <td>Multi-Branch Stock</td>
      <td>1 Location</td>
      <td>Unlimited</td>
    </tr>
  </tbody>
</table>
```

### F. Info Callout Cards
```html
<div data-type="info-card" class="tech-callout tech-callout--info" role="note">
  <div class="tech-callout__content">
    <p><strong>Note:</strong> All ledger entries balance automatically with double-entry accounting.</p>
  </div>
</div>
```

### G. Sequential Steps Widget
```html
<div data-type="steps" class="tech-steps">
  <div data-type="step-item" class="tech-step">
    <div data-type="step-title" class="tech-step__title">1. Connect BusinessKit</div>
    <div data-type="step-content" class="tech-step__content">
      <p>Launch the desktop app or run <code>businesskit --mcp</code>.</p>
    </div>
  </div>
  <div data-type="step-item" class="tech-step">
    <div data-type="step-title" class="tech-step__title">2. Run Setup</div>
    <div data-type="step-content" class="tech-step__content">
      <p>Run <code>npm run setup</code> to link your AI agent.</p>
    </div>
  </div>
</div>
```

### H. Accordion FAQs
```html
<div data-type="accordion-group" class="tech-accordion">
  <div data-type="accordion-item" class="tech-accordion__item" data-open="true">
    <div data-type="accordion-title" class="tech-accordion__summary">How do stock ledgers update?</div>
    <div data-type="accordion-content" class="tech-accordion__content">
      <p>Every purchase invoice appends a verified stock batch with moving average cost calculation.</p>
    </div>
  </div>
  <div data-type="accordion-item" class="tech-accordion__item" data-open="false">
    <div data-type="accordion-title" class="tech-accordion__summary">Can I export invoices to PDF?</div>
    <div data-type="accordion-content" class="tech-accordion__content">
      <p>Yes, all POS receipts and formal customer invoices generate print-ready PDFs.</p>
    </div>
  </div>
</div>
```

### I. Media & Video Embeds
Responsive Image:
```html
<img src="https://example.com/screenshot.png" alt="Dashboard Screenshot" />
```
HTML5 Video:
```html
<video src="https://example.com/demo.mp4" controls="" playsinline="" preload="metadata" style="width: 100%; height: auto;"></video>
```
YouTube Embed:
```html
<div data-youtube-video="">
  <iframe src="https://www.youtube.com/embed/VIDEO_ID" allowfullscreen="true"></iframe>
</div>
```
Generic Video Wrapper:
```html
<div class="video-wrapper" data-video-embed="true">
  <iframe src="https://player.vimeo.com/video/12345" frameborder="0" allowfullscreen="true" allow="autoplay; fullscreen; picture-in-picture"></iframe>
</div>
```

---

## 3. Hub-Specific Blueprints

| Hub / `content_type` | Structure & Content Blueprint |
| :--- | :--- |
| **Blog** (`content_type: "blog"`) | Editorial story, insight, or announcement. Opening hook `<p>`, clear `<h2>`/`<h3>` sections, optional `<blockquote>` pull-quote, scannable `<ul data-type="taskList">`, info cards `<div data-type="info-card">`, comparison `<table>`, and `<pre>` code. |
| **Newsletter** (`content_type: "n"`) | Conversational reader letter. Warm 1–2 paragraph opener `<p>`, 2–4 scannable `<h2>` sections (Main Story, Quick Reads `<ul>`, Spotlight), info card tip `<div data-type="info-card">`, action checklist `<ul data-type="taskList">`, and clear CTA button. |
| **Docs** (`content_type: "docs"`) | Structured technical reference / help article. Structure with `<h2>`/`<h3>`, prerequisites in `<div data-type="info-card">`, multi-step setup in `<div data-type="steps">`, config files in `<pre data-filename="...">`, keyboard shortcuts in `<kbd class="tech-kbd">`, matrices in `<table>`, and troubleshooting in `<div data-type="accordion-group">`. |
| **Guides** (`content_type: "guides"`) | Actionable how-to walkthrough. Outcome opener `<p>`, prerequisites in `<div data-type="info-card">` or `<ul data-type="taskList">`, sequential steps in `<div data-type="steps">`, and closing FAQ in `<div data-type="accordion-group">`. |
| **Notes / Changelog** (`content_type: "notes"`) | Compact changelog, memo, or TIL (150–400 words): crisp lead `<p>`, bullet list or `<ul data-type="taskList">`, optional `<pre>` or `<div data-type="info-card">`. |
| **Comparison** (`content_type: "compare"`) | TL;DR verdict in `<div data-type="info-card">`, side-by-side comparison `<table>`, pros/cons `<ul>`, buyer FAQ `<div data-type="accordion-group">`, and CTA. |
| **Prompts / Tools** (`content_type: "prompt"`, `"tools"`) | Copyable template inside `<pre data-filename="prompt.txt">`, parameters `<table>`, usage `<div data-type="steps">`, and tips `<div data-type="info-card">`. |
| **Videos / Media** (`content_type: "videos"`, `"podcast"`) | Embedded video upfront (`<video ...>` or `<div data-youtube-video="">`), overview `<p>`, chapters `<table>` or `<div data-type="steps">`, show notes FAQ `<div data-type="accordion-group">`, and CTA. |
