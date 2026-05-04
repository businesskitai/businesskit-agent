# Store — Digital Commerce

All products live in the `products` table. `type` determines the product.

## Product Types

### `download` — Digital Files
Required: `title`, `price_cents`, `file_url`
Optional: `thumbnail_url`, `excerpt`, `description`
Use: PDF guides, video files, templates, software, ZIP bundles

### `course` — Online Courses (use SAGE agent)
Required: `title`, `price_cents`
Optional: `lessons` (JSON array), `thumbnail_url`, `duration_minutes`
Lesson shape: `{ id, title, content?, video_url?, duration_minutes?, position, free_preview? }`
Use SAGE for lesson management. LEO stores the product row.

### `meeting` — 1:1 Calls
Required: `title`, `price_cents`, `calendar_link`
Optional: `scheduling_provider` ('cal.com'|'calendly'|'tidycal'), `meeting_settings` (JSON)
Use: coaching sessions, consulting hours, office hours

### `webinar` — Webinars
Required: `title`, `price_cents`, `webinar_link`, `webinar_platform`
Optional: `webinar_schedule` (JSON: date, timezone, duration), `webinar_settings` (JSON)
Use: live workshops, recorded sessions with access control

### `event` — Events
Required: `title`, `price_cents`
Optional: `event_settings` (JSON: date, venue, capacity, ticket_types)
Use: conferences, workshops, meetups, virtual events

### `listing` — Platform Listings
Required: `title`, `price_cents`, `platform_name`
Optional: `platform_url`, `post_frequency` (e.g. '2x per week')
Use: newsletter sponsorships, podcast ads, community access

### `sponsorship` — Recurring Sponsorships
Required: `title`, `price_cents`, `billing_interval`
`billing_interval`: `'month'` | `'year'` | `'once'`
Optional: `features` (JSON array of what's included)
Use: recurring sponsor slots, brand partnerships

### `service` — Custom Services
Required: `title`, `price_cents`
Optional: `description`, `features`, `button_text`, `cta_button`
Use: design work, writing, strategy, development, audits

## Key Rules

- `price_cents`: always in smallest currency unit. $29 = `2900`, $9.99 = `999`
- `currency`: lowercase ISO code. Default `'usd'`
- `slug`: globally unique across all products (not just per-profile)
- `published=0`: draft. `published=1`: live. `hidden=1`: archived.
- `is_active=1`: always set on create. Set `0` only to temp disable without archiving.
- Seed `product_analytics` row on every create (INSERT OR IGNORE)

## Pricing Patterns

Free product: `price_cents=0`
Pay-what-you-want: set `price_cents` to minimum, note in description
Sale: set both `price_cents` (original) and `sale_price_cents` (discounted)
