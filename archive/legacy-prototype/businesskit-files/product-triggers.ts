// ─────────────────────────────────────────────────────────────────────────────
// product-triggers.ts — SQLite Triggers for Links & Products Analytics
//
// Why triggers over app-level aggregation:
//   - Zero CF Worker compute for high-frequency events (link clicks, purchases)
//   - Atomic — counters update in same transaction as the raw event row
//   - Agents / n8n / webhooks writing directly to DB stay in sync automatically
//   - At scale = massive Worker request savings (no aggregateLinkAnalytics() on
//     every page load required for the scalar totals)
//
// ── Triggers in this file ────────────────────────────────────────────────────
//
//   trg_link_click_insert   ← clicks_analytics INSERT
//                             → link_analytics  : total_clicks + 1  (UPSERT)
//                             → profile_analytics: total_clicks + 1 (UPSERT)
//
//   trg_purchase_insert     ← purchases INSERT  (payment_status = 'completed')
//                             → product_analytics: total_sales + 1
//                                                  total_revenue_cents += NEW.amount_cents
//                             → profile_analytics: total_sales + 1
//                                                  total_earnings += NEW.amount_cents
//
//   trg_purchase_refund     ← purchases UPDATE  (status → 'refunded')
//                             Exact reversal of trg_purchase_insert (MAX(0,…) guard)
//
// ── What these triggers do NOT handle ────────────────────────────────────────
//
//   Time-series JSON arrays (analytics_7d, analytics_30d, sales_30d, revenue_30d…)
//   are still computed by aggregateXxx() on page visits — SQLite cannot atomically
//   shift a JSON array. These triggers only own the scalar integer counters that
//   appear prominently in the UI ("Total Clicks", "Total Sales", "Total Earnings").
//
// ── Tables updated ────────────────────────────────────────────────────────────
//
//   link_analytics    — total_clicks               (per-link, already JOINed by UI)
//   profile_analytics — total_clicks               (profile-level sum)
//   product_analytics — total_sales, total_revenue_cents  (per-product)
//   profile_analytics — total_sales, total_earnings       (profile-level sum)
//
// ── Key design choices ────────────────────────────────────────────────────────
//
//   link_analytics uses UPSERT (INSERT … ON CONFLICT DO UPDATE) so the trigger
//   works even on the very first click before any app-side aggregation has run.
//
//   profile_analytics uses the same UPSERT pattern.
//
//   Revenue is NEW.amount_cents (real sale price), NOT a fixed +1.
//
//   No column added to links table — that table is already wide; total_clicks
//   lives in link_analytics where the UI already reads it via JOIN.
//
// ── How to apply ──────────────────────────────────────────────────────────────
//
//   provisionProductTriggers() is called from provisionUserDatabase() in
//   provision.ts after all SCHEMA_SQL tables are created.
//   All triggers use CREATE TRIGGER IF NOT EXISTS — safe to run repeatedly.
//   DROP TRIGGER IF EXISTS runs first so schema changes are always re-applied.
//
// ─────────────────────────────────────────────────────────────────────────────

export const PRODUCT_TRIGGERS_SQL: string[] = [

  // ── Drop all triggers first so schema changes are always re-applied ─────────
  `DROP TRIGGER IF EXISTS trg_link_click_insert`,
  `DROP TRIGGER IF EXISTS trg_purchase_insert`,
  `DROP TRIGGER IF EXISTS trg_purchase_refund`,
  `DROP TRIGGER IF EXISTS trg_product_insert`,
  `DROP TRIGGER IF EXISTS trg_product_delete`,
  `DROP TRIGGER IF EXISTS trg_product_update_published`,
  `DROP TRIGGER IF EXISTS trg_link_insert`,
  `DROP TRIGGER IF EXISTS trg_link_delete`,
  `DROP TRIGGER IF EXISTS trg_link_update_active`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 1 — Link click recorded
  // ─────────────────────────────────────────────────────────────────────────────
  // Fires on every INSERT into clicks_analytics (one row = one click).
  //
  // Tables updated:
  //   link_analytics   → total_clicks + 1  (UPSERT — row may not exist yet)
  //   profile_analytics → total_clicks + 1 (UPSERT — row may not exist yet)
  //
  // link_analytics uses link_id as UNIQUE — ON CONFLICT matches that constraint.
  // profile_analytics uses profile_id as UNIQUE.
  //
  // We do NOT touch the links table itself — total_clicks lives in link_analytics
  // and the UI already reads it there via a LEFT JOIN.
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_link_click_insert
   AFTER INSERT ON clicks_analytics
   BEGIN
     -- Per-link counter in link_analytics (UPSERT in case row doesn't exist yet)
     INSERT INTO link_analytics (id, link_id, profile_id, total_clicks, bot_clicks)
     VALUES (hex(randomblob(16)), NEW.link_id, NEW.profile_id, 1, COALESCE(NEW.is_bot, 0))
     ON CONFLICT(link_id) DO UPDATE SET
       total_clicks = total_clicks + 1,
       bot_clicks   = bot_clicks + COALESCE(NEW.is_bot, 0),
       updated_at   = strftime('%s','now');

     -- Profile-level total_clicks counter in profile_analytics
     INSERT INTO profile_analytics (id, profile_id, total_clicks, bot_clicks)
     VALUES (hex(randomblob(16)), NEW.profile_id, 1, COALESCE(NEW.is_bot, 0))
     ON CONFLICT(profile_id) DO UPDATE SET
       total_clicks = total_clicks + 1,
       bot_clicks   = bot_clicks + COALESCE(NEW.is_bot, 0),
       updated_at   = strftime('%s','now');

     -- Link Analytics By Category counter
     UPDATE link_analytics_by_category SET
       total_clicks = total_clicks + 1,
       bot_clicks   = bot_clicks + COALESCE(NEW.is_bot, 0),
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE profile_id = NEW.profile_id
       AND category_id = (SELECT category_id FROM links WHERE id = NEW.link_id);
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 2 — Purchase completed
  // ─────────────────────────────────────────────────────────────────────────────
  // Fires on every INSERT into purchases WHERE payment_status = 'completed'.
  // Free products (amount_cents = 0) still count as a sale (total_sales + 1)
  // but add 0 to revenue — correct behaviour.
  //
  // Revenue uses NEW.amount_cents (real amount paid), not a fixed +1.
  //
  // Tables updated:
  //   product_analytics → total_sales + 1
  //                        total_revenue_cents += NEW.amount_cents
  //   profile_analytics → total_sales + 1
  //                        total_earnings += NEW.amount_cents
  //
  // Both use UPSERT (INSERT … ON CONFLICT DO UPDATE) so the trigger works even
  // before the first app-side aggregation run.
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_purchase_insert
   AFTER INSERT ON purchases
   WHEN NEW.payment_status = 'completed'
   BEGIN
     -- Per-product totals in product_analytics
     INSERT INTO product_analytics (id, product_id, profile_id, total_sales, total_revenue_cents)
     VALUES (hex(randomblob(16)), NEW.product_id, NEW.profile_id, 1, NEW.amount_cents)
     ON CONFLICT(product_id) DO UPDATE SET
       total_sales         = total_sales + 1,
       total_revenue_cents = total_revenue_cents + NEW.amount_cents,
       updated_at          = strftime('%s','now');

     -- Profile-level totals in profile_analytics
     INSERT INTO profile_analytics (id, profile_id, total_sales, total_earnings)
     VALUES (hex(randomblob(16)), NEW.profile_id, 1, NEW.amount_cents)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_sales    = total_sales + 1,
       total_earnings = total_earnings + NEW.amount_cents,
       updated_at     = strftime('%s','now');
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 3 — Purchase refunded
  // ─────────────────────────────────────────────────────────────────────────────
  // Fires when purchases.status transitions TO 'refunded' FROM any other status.
  // Exact reversal of TRIGGER 2.
  //
  // MAX(0, …) guards prevent negative counters if data is inconsistent.
  //
  // Tables updated:
  //   product_analytics → total_sales - 1 (guarded)
  //                        total_revenue_cents -= amount_cents (guarded)
  //   profile_analytics → total_sales - 1 (guarded)
  //                        total_earnings -= amount_cents (guarded)
  //
  // We use OLD.amount_cents because the amount doesn't change on a refund update —
  // only the status column changes.
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_purchase_refund
   AFTER UPDATE OF status ON purchases
   WHEN NEW.status = 'refunded'
     AND OLD.status != 'refunded'
     AND OLD.payment_status = 'completed'
   BEGIN
     -- Reverse per-product totals
     UPDATE product_analytics SET
       total_sales         = MAX(0, total_sales - 1),
       total_revenue_cents = MAX(0, total_revenue_cents - OLD.amount_cents),
       updated_at          = strftime('%s','now')
     WHERE product_id = OLD.product_id;

     -- Reverse profile-level totals
     UPDATE profile_analytics SET
       total_sales    = MAX(0, total_sales - 1),
       total_earnings = MAX(0, total_earnings - OLD.amount_cents),
       updated_at     = strftime('%s','now')
     WHERE profile_id = OLD.profile_id;
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 4 — Product created
  // ─────────────────────────────────────────────────────────────────────────────
  // Fires on every INSERT into products.
  // Tables updated:
  //   profile_analytics → total_products + 1 (UPSERT)
  //   product_analytics → initialize row (total_sales = 0)
  //   cms_analytics     → total_posts + 1, total_published/draft
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_product_insert
   AFTER INSERT ON products
   BEGIN
     -- Profile level stats
     INSERT INTO profile_analytics (id, profile_id, total_products)
     VALUES (hex(randomblob(16)), NEW.profile_id, 1)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_products = total_products + 1,
       updated_at     = strftime('%s','now');

     -- Initialize product_analytics
     INSERT OR IGNORE INTO product_analytics (id, product_id, profile_id)
     VALUES (hex(randomblob(16)), NEW.id, NEW.profile_id);

     -- Update cms_analytics (find cms_id via category_id)
     UPDATE cms_analytics SET
       total_posts     = total_posts + 1,
       total_published = total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
       total_draft     = total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = NEW.category_id);
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 5 — Product deleted
  // ─────────────────────────────────────────────────────────────────────────────
  // Fires on every DELETE from products.
  // Tables updated:
  //   profile_analytics → total_products - 1 (guarded)
  //   cms_analytics     → total_posts - 1
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_product_delete
   AFTER DELETE ON products
   BEGIN
     -- Clean up product_analytics
     DELETE FROM product_analytics WHERE product_id = OLD.id;

     UPDATE profile_analytics SET
       total_products = MAX(0, total_products - 1),
       updated_at     = strftime('%s','now')
     WHERE profile_id = OLD.profile_id;

     UPDATE cms_analytics SET
       total_posts     = MAX(0, total_posts - 1),
       total_published = MAX(0, total_published - CASE WHEN OLD.published = 1 THEN 1 ELSE 0 END),
       total_draft     = MAX(0, total_draft - CASE WHEN OLD.published = 0 THEN 1 ELSE 0 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = OLD.profile_id AND category_id = OLD.category_id);
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 6 — Product published status changed
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_product_update_published
   AFTER UPDATE OF published ON products
   WHEN NEW.published != OLD.published
   BEGIN
     UPDATE cms_analytics SET
       total_published = MAX(0, total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE -1 END),
       total_draft     = MAX(0, total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE -1 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = NEW.category_id);
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 7 — Link created
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_link_insert
   AFTER INSERT ON links
   BEGIN
     INSERT INTO profile_analytics (id, profile_id, total_links, active_links)
     VALUES (hex(randomblob(16)), NEW.profile_id, 1, CASE WHEN NEW.is_active = 1 THEN 1 ELSE 0 END)
     ON CONFLICT(profile_id) DO UPDATE SET
       total_links  = total_links + 1,
       active_links = active_links + CASE WHEN NEW.is_active = 1 THEN 1 ELSE 0 END,
       updated_at   = strftime('%s','now');

     INSERT INTO link_analytics_by_category (id, profile_id, category_id, total_links, active_links)
     VALUES (hex(randomblob(16)), NEW.profile_id, NEW.category_id, 1, CASE WHEN NEW.is_active = 1 THEN 1 ELSE 0 END)
     ON CONFLICT(profile_id, category_id) DO UPDATE SET
       total_links  = total_links + 1,
       active_links = active_links + CASE WHEN NEW.is_active = 1 THEN 1 ELSE 0 END,
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 8 — Link deleted
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_link_delete
   AFTER DELETE ON links
   BEGIN
     -- Clean up link_analytics
     DELETE FROM link_analytics WHERE link_id = OLD.id;

     UPDATE profile_analytics SET
       total_links  = MAX(0, total_links - 1),
       active_links = MAX(0, active_links - CASE WHEN OLD.is_active = 1 THEN 1 ELSE 0 END),
       updated_at   = strftime('%s','now')
     WHERE profile_id = OLD.profile_id;

     UPDATE link_analytics_by_category SET
       total_links  = MAX(0, total_links - 1),
       active_links = MAX(0, active_links - CASE WHEN OLD.is_active = 1 THEN 1 ELSE 0 END),
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE profile_id = OLD.profile_id AND category_id = OLD.category_id;
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 9 — Link active status changed
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_link_update_active
   AFTER UPDATE OF is_active ON links
   WHEN NEW.is_active != OLD.is_active
   BEGIN
     UPDATE profile_analytics SET
       active_links = MAX(0, active_links + CASE WHEN NEW.is_active = 1 THEN 1 ELSE -1 END),
       updated_at   = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;

     UPDATE link_analytics_by_category SET
       active_links = MAX(0, active_links + CASE WHEN NEW.is_active = 1 THEN 1 ELSE -1 END),
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE profile_id = NEW.profile_id AND category_id = NEW.category_id;
   END`,

];

// ─────────────────────────────────────────────────────────────────────────────
// Provision helper — called from provisionUserDatabase() in provision.ts
// after all SCHEMA_SQL tables are created.
// ─────────────────────────────────────────────────────────────────────────────
export async function provisionProductTriggers(url: string, authToken: string): Promise<void> {
  const { createClient } = await import('@libsql/client/web');
  const client = createClient({ url, authToken });
  for (const sql of PRODUCT_TRIGGERS_SQL) {
    try {
      await client.execute(sql);
    } catch (err) {
      // Log but don't throw — safe to retry on next provision call
      console.warn(`[product-triggers] Failed to apply: ${(err as Error).message}`);
    }
  }
}
