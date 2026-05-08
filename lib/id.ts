// lib/id.ts — ID generation and idempotency helpers

/** UUID v4 for row IDs */
export function ulid(): string {
  return crypto.randomUUID()
}

/** ISO timestamp for TEXT columns */
export function iso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Unix epoch for INTEGER columns */
export function now(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * P0-1: Idempotency key — UUID v7 style, timestamp-prefixed.
 * One key per action per command invocation.
 * Reuse the SAME key on retry within the same invocation.
 *
 * Usage:
 *   const key = generateIdempotencyKey()
 *   await db.txn([
 *     { sql: 'INSERT OR IGNORE INTO crm_activities (..., idempotency_key) VALUES (..., ?)', args: [..., key] },
 *     { sql: 'INSERT INTO agent_audit (..., idempotency_key) VALUES (..., ?)',              args: [..., key] },
 *   ])
 *
 * Tables that gain idempotency_key column (coordinate with app team as columns land):
 *   crm_activities, crm_tasks, crm_notes, crm_proposals, crm_invoices
 *   social_posts, social_queue
 *   agent_notes, agent_reports, agent_tasks, agent_memory
 *
 * Until columns land: store key in metadata JSON blob where available.
 */
export function generateIdempotencyKey(): string {
  const ts = Date.now()
  const rand = crypto.getRandomValues(new Uint8Array(10))
  const tsHex = ts.toString(16).padStart(12, '0')
  const randHex = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-7${randHex.slice(0, 3)}-${randHex.slice(3, 7)}-${randHex.slice(7, 19)}`
}