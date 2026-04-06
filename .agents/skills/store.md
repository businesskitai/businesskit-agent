# Store Skill — Products and Commerce

## Product types and required fields

| type | Required | Optional |
|---|---|---|
| `download` | title, price_cents, file_url | thumbnail_url, excerpt |
| `course` | title, price_cents, lessons JSON, total_lessons | duration_minutes, calendar_link |
| `meeting` | title, price_cents, calendar_link, scheduling_provider | duration_minutes, meeting_settings |
| `webinar` | title, price_cents, webinar_link, webinar_platform, webinar_schedule | webinar_settings |
| `event` | title, price_cents, event_settings JSON | location, date |
| `listing` | title, price_cents | description, tags |
| `sponsorship` | title, price_cents, billing_interval | features JSON |
| `service` | title, price_cents | description, button_text |

## Lessons JSON structure (courses)
```json
[
  { "id": "l1", "title": "Introduction", "duration_mins": 15, "video_url": "...", "order": 1 },
  { "id": "l2", "title": "Module 1", "duration_mins": 30, "video_url": "...", "order": 2 }
]
```

## Pricing rules
- price_cents: always in cents (USD default). $49 → 4900
- sale_price_cents: must be less than price_cents
- billing_interval: 'month' | 'year' | 'once' (default: 'once')
- currency: 'usd' default

## Product lifecycle
- Create: published=0, hidden=0 (draft)
- Launch: published=1, hidden=0
- Archive: hidden=1 (never DELETE)
- slug must be UNIQUE — check before insert

## product_analytics seed
When creating a new product, seed its analytics row:
```ts
await db.execute({
  sql: `INSERT OR IGNORE INTO product_analytics (id, product_id, profile_id) VALUES (?,?,?)`,
  args: [productId, productId, profileId]
})
```

## Approval flow for store items with meetings/slots
purchases.approval_status: 'pending' → agent reviews → 'approved' (sends calendar link)