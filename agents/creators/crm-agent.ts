/**
 * CRM Agent — Agent-First CRM
 *
 * Reads crm_contacts.agent_context blob for per-contact memory.
 * Drives the full outreach pipeline: research → enrich → DM draft → send → follow-up.
 * Writes crm_activities as append-only interaction log.
 * Updates crm_analytics via DB triggers (defined in crm.ts).
 *
 * agent_status lifecycle:
 *   pending → researching → enriched → outreach_ready → closed
 *
 * approval_status on activities:
 *   pending → agent drafts, waits for user
 *   approved → user confirmed, agent sends
 *   auto_sent → auto_approve=1 on contact, sent without waiting
 */

import { BaseAgent, db, ulid, now } from '../_base.ts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Contact {
  id: string
  profile_id: string
  first_name: string
  last_name: string | null
  email: string | null
  platform: string | null
  platform_username: string | null
  platform_url: string | null
  status: 'lead' | 'prospect' | 'customer' | 'churned' | 'archived'
  outreach_status: string
  lead_score: number
  icp_match: string
  agent_status: string
  agent_context: Record<string, unknown>
  auto_approve: number
  suggested_dm: string | null
  email_draft: string | null
}

export interface CreateContactInput {
  first_name: string
  last_name?: string
  email?: string
  phone?: string
  company?: string
  job_title?: string
  platform?: string
  platform_username?: string
  platform_url?: string
  bio?: string
  audience_size?: number
  source?: 'manual' | 'form' | 'import' | 'subscriber' | 'purchase' | 'agent_research' | 'n8n_webhook'
  source_id?: string
  tags?: string[]
  notes?: string
}

export class CRMAgent extends BaseAgent {
  readonly name  = 'CRM Agent'
  readonly title = 'CRM Agent'

  // ── Contacts ─────────────────────────────────────────────────────────────────

  async createContact(input: CreateContactInput): Promise<string> {
    await this.init()
    const id = ulid()
    const ts = now()

    await db.execute({
      sql: `INSERT INTO crm_contacts
            (id,profile_id,user_id,first_name,last_name,email,phone,company,
             job_title,platform,platform_username,platform_url,bio,audience_size,
             source,source_id,tags,notes,agent_status,agent_context,
             created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','{}',?,?)`,
      args: [
        id, this.profileId, this.userId,
        input.first_name, input.last_name ?? null,
        input.email ?? null, input.phone ?? null,
        input.company ?? null, input.job_title ?? null,
        input.platform ?? null, input.platform_username ?? null,
        input.platform_url ?? null, input.bio ?? null,
        input.audience_size ?? null,
        input.source ?? 'manual', input.source_id ?? null,
        input.tags ? JSON.stringify(input.tags) : '[]',
        input.notes ?? null, ts, ts,
      ],
    })
    return id
  }

  async getContact(id: string): Promise<Contact> {
    const { rows: [r] } = await db.execute({
      sql: 'SELECT * FROM crm_contacts WHERE id=? AND profile_id=? LIMIT 1',
      args: [id, this.profileId],
    })
    if (!r) throw new Error(`Contact not found: ${id}`)
    return this.parseContact(r)
  }

  async listContacts(opts: {
    status?: string
    outreach_status?: string
    agent_status?: string
    limit?: number
    order_by?: 'lead_score' | 'created_at' | 'next_follow_up_at'
  } = {}) {
    await this.init()
    const args: unknown[] = [this.profileId]
    let where = 'WHERE profile_id=? AND archived=0'

    if (opts.status)          { where += ' AND status=?';          args.push(opts.status) }
    if (opts.outreach_status) { where += ' AND outreach_status=?'; args.push(opts.outreach_status) }
    if (opts.agent_status)    { where += ' AND agent_status=?';    args.push(opts.agent_status) }

    const orderMap = {
      lead_score:       'lead_score DESC',
      created_at:       'created_at DESC',
      next_follow_up_at: 'next_follow_up_at ASC',
    }
    const order = orderMap[opts.order_by ?? 'created_at']

    const { rows } = await db.execute({
      sql: `SELECT id,first_name,last_name,email,platform,platform_username,
                   status,outreach_status,agent_status,lead_score,icp_match,
                   suggested_dm,next_follow_up_at,total_spent_cents,total_purchases
            FROM crm_contacts ${where} ORDER BY ${order} LIMIT ?`,
      args: [...args, opts.limit ?? 50],
    })
    return rows
  }

  // ── Lead scoring + enrichment ─────────────────────────────────────────────

  async scoreContact(id: string, score: number, reason: string, icpMatch: 'strong' | 'moderate' | 'weak') {
    const ts = now()
    await db.execute({
      sql: `UPDATE crm_contacts SET
            lead_score=?,lead_score_reason=?,icp_match=?,
            agent_status='enriched',updated_at=? WHERE id=?`,
      args: [score, reason, icpMatch, ts, id],
    })
    await this.logActivity(id, 'agent_action', 'outbound', 'agent',
      `Scored: ${score}/100 (${icpMatch} ICP) — ${reason}`)
    return this.getContact(id)
  }

  async enrichContact(id: string, enrichment: {
    pain_point?: string
    company_size?: string
    industry?: string
    business_model?: string
    estimated_revenue?: string
    recent_post?: string
    recent_post_url?: string
    enrichment_source?: string
  }) {
    const ts = now()
    const sets: string[] = ['enriched_at=?', 'updated_at=?', "agent_status='enriched'"]
    const args: unknown[] = [ts, ts]

    const fieldMap: Record<string, string> = {
      pain_point: 'pain_point', company_size: 'company_size',
      industry: 'industry', business_model: 'business_model',
      estimated_revenue: 'estimated_revenue',
      recent_post: 'recent_post', recent_post_url: 'recent_post_url',
      enrichment_source: 'enrichment_source',
    }
    for (const [k, col] of Object.entries(fieldMap)) {
      if ((enrichment as any)[k] !== undefined) {
        sets.push(`${col}=?`)
        args.push((enrichment as any)[k])
      }
    }
    args.push(id)

    await db.execute({ sql: `UPDATE crm_contacts SET ${sets.join(',')} WHERE id=?`, args })
    return this.getContact(id)
  }

  // ── Outreach ──────────────────────────────────────────────────────────────

  /** Draft a DM — stores in suggested_dm, creates pending activity */
  async draftDM(id: string, message: string): Promise<void> {
    const ts = now()
    const contact = await this.getContact(id)

    await db.execute({
      sql: `UPDATE crm_contacts SET
            suggested_dm=?,outreach_status='dm_drafted',
            agent_status='outreach_ready',updated_at=? WHERE id=?`,
      args: [message, ts, id],
    })

    const approvalStatus = contact.auto_approve ? 'auto_sent' : 'pending'
    await this.logActivity(id, 'dm', 'outbound', 'agent', message, {
      approval_status: approvalStatus,
      channel: contact.platform ?? 'dm',
    })
  }

  /** Draft a cold email */
  async draftEmail(id: string, subject: string, body: string): Promise<void> {
    const ts = now()
    const contact = await this.getContact(id)

    await db.execute({
      sql: `UPDATE crm_contacts SET
            email_subject=?,email_draft=?,outreach_status='email_drafted',
            agent_status='outreach_ready',updated_at=? WHERE id=?`,
      args: [subject, body, ts, id],
    })

    const approvalStatus = contact.auto_approve ? 'auto_sent' : 'pending'
    await this.logActivity(id, 'email', 'outbound', 'agent', body, {
      subject,
      approval_status: approvalStatus,
    })
  }

  /** Mark DM as sent (after user approves + actually sends) */
  async markDMSent(id: string): Promise<void> {
    const ts = now()
    await db.execute({
      sql: `UPDATE crm_contacts SET
            dm_sent=1,dm_sent_at=?,outreach_status='dm_sent',
            outreach_attempts=outreach_attempts+1,last_contacted_at=?,updated_at=? WHERE id=?`,
      args: [ts, ts, ts, id],
    })
  }

  /** Mark email as sent */
  async markEmailSent(id: string): Promise<void> {
    const ts = now()
    await db.execute({
      sql: `UPDATE crm_contacts SET
            email_sent=1,email_sent_at=?,outreach_status='email_sent',
            outreach_attempts=outreach_attempts+1,last_contacted_at=?,updated_at=? WHERE id=?`,
      args: [ts, ts, ts, id],
    })
  }

  /** Log an inbound reply */
  async logReply(id: string, channel: 'dm' | 'email', content: string, sentiment: 'positive' | 'neutral' | 'negative') {
    const ts = now()
    await db.execute({
      sql: `UPDATE crm_contacts SET
            outreach_status='replied',last_reply_at=?,last_reply_channel=?,
            reply_sentiment=?,last_activity_at=?,updated_at=? WHERE id=?`,
      args: [ts, channel, sentiment, ts, ts, id],
    })
    await this.logActivity(id, channel === 'dm' ? 'dm' : 'email', 'inbound', 'contact', content)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async createDeal(contactId: string, input: {
    title: string
    value_cents: number
    stage?: string
    probability?: number
    product_id?: string
    expected_close_at?: number
  }): Promise<string> {
    await this.init()
    const id = ulid()
    const ts = now()

    await db.execute({
      sql: `INSERT INTO crm_deals
            (id,profile_id,contact_id,title,value_cents,stage,probability,product_id,
             expected_close_at,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, this.profileId, contactId,
        input.title, input.value_cents,
        input.stage ?? 'new', input.probability ?? 10,
        input.product_id ?? null, input.expected_close_at ?? null,
        ts, ts,
      ],
    })
    return id
  }

  async updateDealStage(dealId: string, stage: string, lostReason?: string) {
    const ts = now()
    const closedAt = ['won', 'lost'].includes(stage) ? ts : null
    await db.execute({
      sql: `UPDATE crm_deals SET stage=?,lost_reason=?,closed_at=?,updated_at=? WHERE id=?`,
      args: [stage, lostReason ?? null, closedAt, ts, dealId],
    })
  }

  async listDeals(opts: { stage?: string; contact_id?: string } = {}) {
    await this.init()
    let where = 'WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.stage)      { where += ' AND stage=?';      args.push(opts.stage) }
    if (opts.contact_id) { where += ' AND contact_id=?'; args.push(opts.contact_id) }

    const { rows } = await db.execute({
      sql: `SELECT d.*,c.first_name,c.last_name,c.company
            FROM crm_deals d
            JOIN crm_contacts c ON c.id=d.contact_id
            ${where} ORDER BY d.created_at DESC`,
      args,
    })
    return rows
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async createTask(input: {
    title: string
    contact_id?: string
    deal_id?: string
    due_at?: number
    priority?: 'low' | 'medium' | 'high'
    description?: string
  }): Promise<string> {
    await this.init()
    const id = ulid()
    const ts = now()

    await db.execute({
      sql: `INSERT INTO crm_tasks
            (id,profile_id,contact_id,deal_id,title,description,due_at,priority,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,  'open',?,?)`,
      args: [
        id, this.profileId,
        input.contact_id ?? null, input.deal_id ?? null,
        input.title, input.description ?? null,
        input.due_at ?? null, input.priority ?? 'medium',
        ts, ts,
      ],
    })
    return id
  }

  async completeTask(id: string) {
    const ts = now()
    await db.execute({
      sql: `UPDATE crm_tasks SET status='done',completed_at=?,updated_at=? WHERE id=?`,
      args: [ts, ts, id],
    })
  }

  async listTasks(opts: { status?: string; due_today?: boolean } = {}) {
    await this.init()
    let where = 'WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.status)    { where += ' AND status=?'; args.push(opts.status) }
    if (opts.due_today) {
      const endOfDay = Math.floor(new Date().setHours(23, 59, 59, 999) / 1000)
      where += ' AND due_at<=? AND status=\'open\''
      args.push(endOfDay)
    }
    const { rows } = await db.execute({
      sql: `SELECT t.*,c.first_name,c.last_name FROM crm_tasks t
            LEFT JOIN crm_contacts c ON c.id=t.contact_id
            ${where} ORDER BY due_at ASC NULLS LAST`,
      args,
    })
    return rows
  }

  // ── Pipeline overview for CXO ─────────────────────────────────────────────

  async pipelineSummary() {
    await this.init()
    const { rows: [stats] } = await db.execute({
      sql: `SELECT * FROM crm_analytics WHERE profile_id=? LIMIT 1`,
      args: [this.profileId],
    })

    const { rows: pendingApprovals } = await db.execute({
      sql: `SELECT a.id,a.type,a.body,c.first_name,c.last_name,c.platform
            FROM crm_activities a
            JOIN crm_contacts c ON c.id=a.contact_id
            WHERE a.profile_id=? AND a.approval_status='pending'
            ORDER BY a.occurred_at ASC LIMIT 10`,
      args: [this.profileId],
    })

    const { rows: followUps } = await db.execute({
      sql: `SELECT id,first_name,last_name,platform_username,outreach_status,next_follow_up_at
            FROM crm_contacts
            WHERE profile_id=? AND next_follow_up_at<=? AND archived=0
            ORDER BY next_follow_up_at ASC LIMIT 10`,
      args: [this.profileId, now()],
    })

    return { stats, pendingApprovals, followUps }
  }

  /** Top leads by score, ready for outreach */
  async hotLeads(limit = 10) {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT id,first_name,last_name,platform,platform_username,
                   lead_score,icp_match,pain_point,audience_size,
                   outreach_status,agent_status
            FROM crm_contacts
            WHERE profile_id=? AND archived=0 AND agent_status IN ('enriched','outreach_ready')
            ORDER BY lead_score DESC LIMIT ?`,
      args: [this.profileId, limit],
    })
    return rows
  }

  // ── Agent context (scratchpad per contact) ───────────────────────────────

  async updateAgentContext(id: string, updates: Record<string, unknown>) {
    const contact = await this.getContact(id)
    const merged  = { ...contact.agent_context, ...updates, updated_at: iso() }
    const ts      = now()
    await db.execute({
      sql: `UPDATE crm_contacts SET agent_context=?,updated_at=? WHERE id=?`,
      args: [JSON.stringify(merged), ts, id],
    })
  }

  async setNextFollowUp(id: string, atUnix: number, note?: string) {
    const ts = now()
    await db.execute({
      sql: `UPDATE crm_contacts SET next_follow_up_at=?,follow_up_count=follow_up_count+1,updated_at=? WHERE id=?`,
      args: [atUnix, ts, id],
    })
    if (note) await this.logActivity(id, 'note', 'outbound', 'agent', note)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async logActivity(
    contactId: string,
    type: string,
    direction: 'inbound' | 'outbound',
    sender: 'agent' | 'you' | 'contact',
    body: string,
    extra: Record<string, unknown> = {}
  ) {
    await this.init()
    const id  = ulid()
    const ts  = now()
    const { approval_status = 'auto_sent', subject, channel } = extra

    await db.execute({
      sql: `INSERT INTO crm_activities
            (id,profile_id,contact_id,type,direction,sender,body,
             approval_status,searchable_context,occurred_at,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, this.profileId, contactId, type, direction, sender, body,
        approval_status,
        `${type} ${direction} ${body.slice(0, 200)}`,
        ts, ts,
      ],
    })
  }

  private parseContact(r: Record<string, unknown>): Contact {
    return {
      ...r,
      agent_context: safeJSON(r.agent_context, {}),
    } as unknown as Contact
  }
}

const safeJSON = (v: unknown, fb: unknown) => {
  try { return JSON.parse(v as string) } catch { return fb }
}

function iso() {
  return new Date().toISOString().slice(0, 19) + 'Z'
}

export const crmAgent = new CRMAgent()