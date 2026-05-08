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

  // P1-7: factory — asserts a profile will resolve before constructing.
  // Single-profile UserDBs (the normal case) auto-pick. Multi-profile DBs
  // must set PROFILE_ID in .env; that check lives in lib/profile.ts.
  static async create<T extends BaseAgent>(
    Cls: new (agentType?: string) => T,
    agentType?: string,
  ): Promise<T> {
    const { rows } = await db.execute(`SELECT COUNT(*) as n FROM profiles`)
    const n = Number(rows[0]?.n ?? 0)
    if (n === 0) throw new Error('No profile in this UserDB — complete BusinessKit onboarding first')
    const instance = new Cls(agentType)
    await (instance as any).init() // throws with guidance if PROFILE_ID needed
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
  // Matches the app-side schema: these tables block DELETE, not UPDATE.
  // crm_activities in particular legitimately UPDATEs approval_status
  // (pending_approval → approved|rejected|auto_sent) and read_at — the
  // schema comment (crm.ts) explicitly calls this out.
  // We only guard against UPDATEs on tables the app fully locks: agent_reports,
  // email_events, clicks_analytics. crm_activities is excluded.
  private static APPEND_ONLY = new Set([
    'agent_reports',
    'email_events',
    'clicks_analytics',
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
  // agent_memory.id is INTEGER AUTOINCREMENT — let SQLite assign it.
  // idempotency_key has a unique partial index; retries dedupe automatically.
  protected async logMemory(action: string, meta: Record<string, unknown> = {}): Promise<void> {
    await this.init()
    try {
      const ikey = generateIdempotencyKey()
      await db.write({
        sql: `INSERT OR IGNORE INTO agent_memory
               (profile_id, session_date, agent, action, metadata, idempotency_key)
               VALUES (?,?,?,?,?,?)`,
        args: [
          this.profileId, iso().slice(0, 10),
          this.agentType, action, JSON.stringify(meta), ikey,
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

  // ── Agent tasks (kanban board — app-side dashboard renders these) ──────────
  // Tables in `agent_tasks` (see businesskit-files/agent.ts). Each task has:
  //   status = 'pending' | 'active' | 'running' | 'done' | 'paused' | 'failed' | 'cancelled'
  //   source = 'user' | 'agent'
  //   schedule = optional cron string (NULL = on-demand)

  /** Create a kanban task for an agent. Shows up in /dashboard/agents/tasks. */
  protected async createAgentTask(opts: {
    agent?: string              // default: this agent
    title: string
    description?: string
    command: string             // e.g. 'weeklyBriefing', 'hotLeads', 'runPublishQueue'
    params?: Record<string, unknown>
    source?: 'user' | 'agent'
    schedule?: string           // cron; NULL = on-demand
    timezone?: string
    run_once?: boolean
    next_run_at?: number
    idempotency_key?: string
  }): Promise<string> {
    await this.init()
    const id = ulid()
    const ts = now()
    const ikey = opts.idempotency_key ?? generateIdempotencyKey()
    await db.write({
      sql: `INSERT OR IGNORE INTO agent_tasks
             (id, profile_id, agent, title, description, command, params, source,
              schedule, timezone, run_once, status, next_run_at, idempotency_key,
              created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?)`,
      args: [
        id, this.profileId, opts.agent ?? this.agentType,
        opts.title, opts.description ?? null, opts.command,
        JSON.stringify(opts.params ?? {}),
        opts.source ?? 'agent',
        opts.schedule ?? null, opts.timezone ?? 'UTC',
        opts.run_once ? 1 : 0,
        opts.next_run_at ?? null, ikey, ts, ts,
      ],
    })
    return id
  }

  /** Move a task across the kanban: pending → active → running → done. */
  protected async updateTaskStatus(
    taskId: string,
    status: 'pending' | 'active' | 'running' | 'done' | 'paused' | 'failed' | 'cancelled',
    lastRunStatus?: string,
  ): Promise<void> {
    await this.init()
    const ts = now()
    const isTerminal = status === 'done' || status === 'failed' || status === 'cancelled'
    await db.write({
      sql: `UPDATE agent_tasks
             SET status=?, last_run_status=?, last_run_at=?,
                 run_count=run_count+CASE WHEN ?=1 THEN 1 ELSE 0 END,
                 updated_at=?
             WHERE id=? AND profile_id=?`,
      args: [status, lastRunStatus ?? null, isTerminal ? ts : null,
             isTerminal ? 1 : 0, ts, taskId, this.profileId],
    })
  }

  /** List tasks for the kanban view. */
  protected async listAgentTasks(opts: {
    agent?: string
    status?: 'pending' | 'active' | 'running' | 'done' | 'paused' | 'failed' | 'cancelled'
    limit?: number
  } = {}): Promise<unknown[]> {
    await this.init()
    let where = 'WHERE profile_id=? AND hidden=0'
    const args: unknown[] = [this.profileId]
    if (opts.agent)  { where += ' AND agent=?';  args.push(opts.agent) }
    if (opts.status) { where += ' AND status=?'; args.push(opts.status) }
    const { rows } = await db.execute({
      sql: `SELECT id, agent, title, description, command, status,
                   schedule, next_run_at, last_run_at, last_run_status,
                   run_count, created_at
            FROM agent_tasks ${where}
            ORDER BY CASE status
              WHEN 'running' THEN 0 WHEN 'active' THEN 1 WHEN 'pending' THEN 2
              WHEN 'paused' THEN 3 WHEN 'done' THEN 4 ELSE 5 END,
            created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 100],
    })
    return rows
  }

  // ── Agent reports — append-only, idempotent, mid-session safe ─────────────
  // agent_reports has a unique partial index on idempotency_key — retries dedupe.
  protected async pushReport(opts: {
    title: string
    type: string
    content: string
    summary?: string
    html?: string
    meta?: Record<string, unknown>
    idempotency_key?: string
  }): Promise<string> {
    await this.init()
    const id = ulid()
    const ikey = opts.idempotency_key ?? generateIdempotencyKey()
    await db.write({
      sql: `INSERT OR IGNORE INTO agent_reports
             (id, profile_id, agent, title, type, content, summary, html,
              metadata, hidden, idempotency_key)
             VALUES (?,?,?,?,?,?,?,?,?,0,?)`,
      args: [
        id, this.profileId, this.agentType,
        opts.title, opts.type, opts.content,
        opts.summary ?? null, opts.html ?? null,
        JSON.stringify(opts.meta ?? {}), ikey,
      ],
    })
    return id
  }
}
