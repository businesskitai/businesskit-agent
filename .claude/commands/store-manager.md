# /store-manager — Add Product to Store

Types: download | meeting | webinar | event | listing | sponsorship | service
(For courses, use `/course-creator`)

1. Ask: product type (show list)
2. Ask required fields per type (ref: .claude/skills/store.md)
3. Price in dollars → convert to cents ($29 → 2900)
4. `leo.create({ type, title, price_cents, ...type_fields })`

After: COPY for description copy | SCOUT for SEO meta
