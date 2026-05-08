// agents/_base.ts
// BaseAgent — every agent extends this.
// Wires: profile isolation, idempotency, transactions, audit, memory cap.
//
// P0-1: generateIdempotencyKey() on every insert/update/archive
// P0-2: txn() for multi-statement flows (Turso atomic batch)
// P0-3: SQLITE_BUSY retry — via lib/db.ts (db.execute/write/txn all retry)
// P0-6: audit rows bundled in the same txn as every mutation helper
// P0-7: APPEND_ONLY guard — throws before hitting DB trigger
// P1-2: logMemory() trims to last 20 rows per agent
// P1-7: create() factory validates single-profile before construction
//
// Back-compat surface (every agent file uses these — keep stable):
//   this.ctx / this.profileId / this.userId
//   this.init() / this.archive() / this.publish() / this.count()
//   re-exports: db, ulid, iso, now

import { db, type Stmt } from '../lib/db.ts'
import { getBrandContext, type BrandContext } from '../lib/profile.ts'
import {
  ulid, iso, now,
  generateIdempotencyKey,
} from '../lib/id.ts'

export { db, ulid, iso, now }

export abstract class BaseAgent {
  protected ctx!: BrandContext
  protected readonly agentType: string

  // Back-compat constructor — agents still do `new CEO()` as module singletons.
  // Profile is loaded lazily via init() on first method call.
  // Phase 2 will swap to BaseAgent.create() + sharedMap-injected client.
  constructor(agentType?: string) {
    this.agentType = agentType ?? this.constructor.name.toLowerCase()
  }

  // P1-1: schema-version cache — populated once per process on first init()
  private static _migrations: Set<string> | null = null

  /** Call at the start of any method that reads ctx / profileId / userId. */
  protected async init(): Promise<void> {
    if (!this.ctx) this.ctx = await getBrandContext()
    if (BaseAgent._migrations === null) {
      BaseAgent._migrations = new Set<string>()
      try {
        const { rows } = await db.execute(`SELECT id FROM _schema_migrations`)
        for (const r of rows) BaseAgent._migrations.add(String(r.id))
      } catch { /* pre-migration UserDB — empty set is fine */ }
    }
  }

  /** P1-1: gate features on app-side migrations being applied. */
  protected hasMigration(id: string): boolean {
    return BaseAgent._migrations?.has(id) ?? false
  }

  protected get profileId(): string { return this.ctx.profile.id }
  protected get userId(): string    { return this.ctx.profile.user_id }

  // P1-7: factory — validates exactly 1 profile exists before constructing.
  // Prefer this over `new Cls()` when you need a hard guarantee.
  static async create<T extends BaseAgent>(
    Cls: new (agentType?: string) => T,
    agentType?: string,
  ): Promise<T> {
    const { rows } = await db.execute(`SELECT COUNT(*) as n FROM profiles`)
    const n = Number(rows[0]?.n ?? 0)
    if (n === 0) throw new Error('No profile in this UserDB — complete BusinessKit onboarding first')
    if (n > 1)  throw new Error(`Found ${n} profiles — agents are single-profile only`)
    const instance = new Cls(agentType)
    await (instance as any).init()
    return instance
  }

  // ── P0-2: atomic multi-statement batch ─────────────────────────────────────
  protected async txn(stmts: Stmt[]): Promise<void> {
    await db.txn(stmts)
  }

  // ── P0-6: audit helper — always bundle inside txn with the mutation ────────
  // Private: subclasses shouldn't call this directly, and renaming keeps
  // agent-level `audit()` methods (e.g. SEOAgent.audit) free.
  private auditStmt(opts: {
    action: 'insert' | 'update' | 'archive'
    table: string
    rowId: string
    diff: Record<string, unknown>
    ikey: string
  }): Stmt {
    const raw = JSON.stringify(opts.diff)
    const payload = raw.length > 4096
      ? JSON.stringify({ _truncated: true, original_size_bytes: raw.length })
      : raw
    return {
      sql: `INSERT OR IGNORE INTO agent_audit
             (id, ts, agent_type, table_name, row_id, action, diff, idempotency_key)
             VALUES (?,?,?,?,?,?,?,?)`,
      args: [ulid(), now(), this.agentType, opts.table, opts.rowId, opts.action, payload, opts.ikey],
    }
  }

  // ── P0-1 + P0-2 + P0-6: insert with idempotency + audit in one txn ─────────
  // Silently falls back to plain INSERT if agent_audit doesn't exist yet
  // (pre-migration UserDB). Never blocks agent progress on audit.
  protected async insert(opts: {
    table: string
    id?: string
    cols: Record<string, unknown>
  }): Promise<{ inserted: boolean; id: string }> {
    await this.init()
    const id = opts.id ?? ulid()
    const ikey = generateIdempotencyKey()
    const row = { id, profile_id: this.profileId, ...opts.cols }
    const keys = Object.keys(row)
    const sql = `INSERT OR IGNORE INTO ${opts.table}
                 (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
    const args = Object.values(row)

    try {
      await this.txn([
        { sql, args },
        this.auditStmt({ action: 'insert', table: opts.table, rowId: id, diff: row, ikey }),
      ])
    } catch (e: any) {
      if (/agent_audit/i.test(e?.message ?? '')) await db.write({ sql, args })
      else throw e
    }

    const { rows } = await db.execute({ sql: `SELECT id FROM ${opts.table} WHERE id=?`, args: [id] })
    return { inserted: rows.length > 0, id }
  }

  // ── P0-7: append-only guard — throws before the DB trigger does ────────────
  private static APPEND_ONLY = new Set([
    'crm_activities', 'agent_reports',
    'email_events', 'clicks_analytics',
  ])

  // ── P0-2 + P0-6: UPDATE with audit in one txn ──────────────────────────────
  protected async update(opts: {
    table: string
    id: string
    cols: Record<string, unknown>
  }): Promise<void> {
    if (BaseAgent.APPEND_ONLY.has(opts.table))
      throw new Error(`${opts.table} is append-only — insert a correcting row instead`)

    await this.init()
    const ikey = generateIdempotencyKey()
    const sets = Object.keys(opts.cols).map(k => `${k}=?`).join(', ')
    const sql = `UPDATE ${opts.table} SET ${sets}, updated_at=?
                 WHERE id=? AND profile_id=?`
    const args = [...Object.values(opts.cols), iso(), opts.id, this.profileId]

    try {
      await this.txn([
        { sql, args },
        this.auditStmt({ action: 'update', table: opts.table, rowId: opts.id, diff: opts.cols, ikey }),
      ])
    } catch (e: any) {
      if (/agent_audit/i.test(e?.message ?? '')) await db.write({ sql, args })
      else throw e
    }
  }

  // ── Soft-delete — never hard delete ───────────────────────────────────────
  // Back-compat signature: (table, id) where id can be string or number.
  protected async archive(table: string, id: string | number): Promise<void> {
    if (BaseAgent.APPEND_ONLY.has(table))
      throw new Error(`${table} is append-only — archive not allowed`)

    await this.init()
    const ikey = generateIdempotencyKey()
    const tsCol = typeof id === 'number' ? now() : iso()
    const sql = `UPDATE ${table} SET hidden=1, updated_at=? WHERE id=? AND profile_id=?`
    const args = [tsCol, id, this.profileId]

    try {
      await this.txn([
        { sql, args },
        this.auditStmt({ action: 'archive', table, rowId: String(id), diff: { hidden: 1 }, ikey }),
      ])
    } catch (e: any) {
      if (/agent_audit/i.test(e?.message ?? '')) await db.write({ sql, args })
      else throw e
    }
  }

  /** Publish any content row (flip published=1). Returns unknown so subclasses
   *  can override and return their fetched row. */
  protected async publish(table: string, id: string | number): Promise<unknown> {
    await this.init()
    const tsCol = typeof id === 'number' ? now() : iso()
    await db.write({
      sql: `UPDATE ${table} SET published=1, updated_at=? WHERE id=? AND profile_id=?`,
      args: [tsCol, id, this.profileId],
    })
    return undefined
  }

  /** Quick inventory: { total, live, drafts }. */
  protected async count(table: string): Promise<{ total: number; live: number; drafts: number }> {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT COUNT(*) total,
                   SUM(CASE WHEN published=1 AND hidden=0 THEN 1 ELSE 0 END) live,
                   SUM(CASE WHEN published=0 AND hidden=0 THEN 1 ELSE 0 END) drafts
            FROM ${table} WHERE profile_id=?`,
      args: [this.profileId],
    })
    return {
      total:  Number(r?.total  ?? 0),
      live:   Number(r?.live   ?? 0),
      drafts: Number(r?.drafts ?? 0),
    }
  }

  // ── P1-2: logMemory — write then trim to last 20 rows per agent ────────────
  protected async logMemory(action: string, meta: Record<string, unknown> = {}): Promise<void> {
    await this.init()
    try {
      await db.write({
        sql: `INSERT INTO agent_memory
               (id, profile_id, session_date, agent, action, metadata, created_at)
               VALUES (?,?,?,?,?,?,?)`,
        args: [
          ulid(), this.profileId, iso().slice(0, 10),
          this.agentType, action, JSON.stringify(meta), iso(),
        ],
      })
      await db.write({
        sql: `DELETE FROM agent_memory
               WHERE agent=? AND profile_id=?
                 AND id NOT IN (
                   SELECT id FROM agent_memory
                   WHERE agent=? AND profile_id=?
                   ORDER BY id DESC LIMIT 20
                 )`,
        args: [this.agentType, this.profileId, this.agentType, this.profileId],
      })
    } catch { /* memory is best-effort — never block the agent */ }
  }

  // ── Agent reports — append-only, routed through insert() ──────────────────
  protected async pushReport(opts: {
    title: string
    type: string
    content: string
    summary?: string
    html?: string
    meta?: Record<string, unknown>
  }): Promise<string> {
    const { id } = await this.insert({
      table: 'agent_reports',
      cols: {
        agent:      this.agentType,
        title:      opts.title,
        type:       opts.type,
        content:    opts.content,
        summary:    opts.summary ?? null,
        html:       opts.html ?? null,
        metadata:   JSON.stringify(opts.meta ?? {}),
        hidden:     0,
        created_at: iso(),
      },
    })
    return id
  }
}
