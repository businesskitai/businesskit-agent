/**
 * Sales (CRM) Agent — Agent-First CRM
 *
 * Reads crm_contacts.agent_context blob for per-contact memory.
 * Drives the full outreach pipeline: research → enrich → DM draft → send → follow-up.
 * Writes crm_activities as an append-only interaction log.
 * Updates crm_analytics via DB triggers (defined app-side in crm.ts).
 *
 * agent_status lifecycle:
 *   pending → researching → enriched → outreach_ready → closed
 *
 * approval_status on activities:
 *   pending_approval → agent drafts, waits for user
 *   approved         → user confirmed, agent sends
 *   auto_sent        → auto_approve=1 on contact, sent without waiting
 *   rejected         → user rejected the draft
 *
 * DB contract (must match app-side crm.ts):
 *   - Every mutation filters by profile_id (enforced here).
 *   - crm_activities is append-only — DELETE blocked by trigger; UPDATE allowed
 *     only on approval_status and read_at.
 *   - crm_analytics is trigger-managed; never written directly.
 *   - Groups: crm_contact_groups junction (via lib/groups.ts). Never LIKE '%grp_%'.
 *   - Idempotency: activities/tasks/notes/proposals/invoices have unique
 *     idempotency_key indexes; we write INSERT OR IGNORE on retries.
 */

import { BaseAgent, db, ulid, iso, now } from '../_base.ts'
import { CRM_DEAL_STAGE, type CRMDealStage } from '../../lib/enums.ts'
import { leadScore as vLeadScore, probability as vProbability, cents as vCents } from '../../lib/validate.ts'
import { addContactToGroup, getContactsByGroup, getGroupsForContact, removeContactFromGroup, hasGroupsJunction } from '../../lib/groups.ts'
import { generateIdempotencyKey } from '../../lib/id.ts'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContactStatus = 'lead' | 'prospect' | 'customer' | 'churned' | 'archived'
export type ActivityType = 'dm' | 'email' | 'call' | 'meeting' | 'note' | 'task_done' | 'purchase' | 'form_submission' | 'agent_action'
export type ActivityDirection = 'inbound' | 'outbound'
export type ActivitySender = 'agent' | 'you' | 'contact'
export type ApprovalStatus = 'pending_approval' | 'approved' | 'rejected' | 'auto_sent'
export type OutreachStatus =
  | 'new' | 'dm_drafted' | 'dm_sent' | 'email_drafted' | 'email_sent'
  | 'replied' | 'call_booked' | 'demo_done' | 'converted' | 'not_interested'

export interface Contact {
  id: string
  profile_id: string
  first_name: string
  last_name: string | null
  email: string | null
  platform: string | null
  platform_username: string | null
  platform_url: string | null
  status: ContactStatus
  outreach_status: OutreachStatus
  lead_score: number
  icp_match: string
  agent_status: string
  agent_context: Record<string, unknown>
  auto_approve: number
  suggested_dm: string | null
  email_draft: string | null
  is_duplicate: number
  duplicate_of: string | null
  archived: number
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
  idempotency_key?: string
}

export class CRMAgent extends BaseAgent {
  readonly name  = 'Sales'
  readonly title = 'Sales (CRM) Agent'

  // ── Contacts ─────────────────────────────────────────────────────────────────

  async createContact(input: CreateContactInput): Promise<string> {
    await this.init()
    const id = ulid()
    const ts = now()

    await db.write({
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
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: 'SELECT * FROM crm_contacts WHERE id=? AND profile_id=? LIMIT 1',
      args: [id, this.profileId],
    })
    if (!r) throw new Error(`Contact not found: ${id}`)
    return this.parseContact(r)
  }

  async listContacts(opts: {
    status?: ContactStatus
    outreach_status?: OutreachStatus
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
      lead_score:        'lead_score DESC',
      created_at:        'created_at DESC',
      next_follow_up_at: 'next_follow_up_at ASC',
    }
    const order = orderMap[opts.order_by ?? 'created_at']

    const { rows } = await db.execute({
      sql: `SELECT id,first_name,last_name,email,platform,platform_username,
                   status,outreach_status,agent_status,lead_score,icp_match,
                   suggested_dm,next_follow_up_at,total_spent_cents,total_purchases,
                   is_duplicate,duplicate_of
            FROM crm_contacts ${where} ORDER BY ${order} LIMIT ?`,
      args: [...args, opts.limit ?? 50],
    })
    return rows
  }

  /** Soft-archive a contact (hidden from lists, never hard-deleted). */
  async archiveContact(id: string): Promise<void> {
    await this.init()
    await db.write({
      sql: `UPDATE crm_contacts SET archived=1,status='archived',updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [now(), id, this.profileId],
    })
    await this.logActivity(id, 'agent_action', 'outbound', 'agent', 'Contact archived')
  }

  async disqualifyContact(id: string, reason: string): Promise<void> {
    await this.init()
    await db.write({
      sql: `UPDATE crm_contacts SET disqualified=1,disqualified_reason=?,
            agent_status='closed',updated_at=? WHERE id=? AND profile_id=?`,
      args: [reason, now(), id, this.profileId],
    })
    await this.logActivity(id, 'agent_action', 'outbound', 'agent', `Disqualified: ${reason}`)
  }

  // ── Lead scoring + enrichment ─────────────────────────────────────────────

  async scoreContact(id: string, score: number, reason: string, icpMatch: 'strong' | 'moderate' | 'weak') {
    await this.init()
    const bounded = vLeadScore(score) // P0-8: catches out-of-range before DB trigger
    await db.write({
      sql: `UPDATE crm_contacts SET
            lead_score=?,lead_score_reason=?,icp_match=?,
            agent_status='enriched',updated_at=? WHERE id=? AND profile_id=?`,
      args: [bounded, reason, icpMatch, now(), id, this.profileId],
    })
    await this.logActivity(id, 'agent_action', 'outbound', 'agent',
      `Scored: ${bounded}/100 (${icpMatch} ICP) — ${reason}`)
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
    await this.init()
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
    args.push(id, this.profileId)

    await db.write({
      sql: `UPDATE crm_contacts SET ${sets.join(',')} WHERE id=? AND profile_id=?`,
      args,
    })
    return this.getContact(id)
  }

  // ── Outreach ──────────────────────────────────────────────────────────────

  /** Draft a DM. Stores in suggested_dm + creates a pending activity
   *  (or auto_sent if contact.auto_approve=1). */
  async draftDM(id: string, message: string): Promise<void> {
    await this.init()
    const contact = await this.getContact(id)

    await db.write({
      sql: `UPDATE crm_contacts SET
            suggested_dm=?,outreach_status='dm_drafted',
            agent_status='outreach_ready',updated_at=? WHERE id=? AND profile_id=?`,
      args: [message, now(), id, this.profileId],
    })

    const approval_status: ApprovalStatus = contact.auto_approve ? 'auto_sent' : 'pending_approval'
    await this.logActivity(id, 'dm', 'outbound', 'agent', message, {
      approval_status,
      channel: contact.platform ?? 'dm',
    })
  }

  /** Draft a cold email. */
  async draftEmail(id: string, subject: string, body: string): Promise<void> {
    await this.init()
    const contact = await this.getContact(id)

    await db.write({
      sql: `UPDATE crm_contacts SET
            email_subject=?,email_draft=?,outreach_status='email_drafted',
            agent_status='outreach_ready',updated_at=? WHERE id=? AND profile_id=?`,
      args: [subject, body, now(), id, this.profileId],
    })

    const approval_status: ApprovalStatus = contact.auto_approve ? 'auto_sent' : 'pending_approval'
    await this.logActivity(id, 'email', 'outbound', 'agent', body, {
      subject, approval_status,
    })
  }

  /** Approve a pending activity. Flips approval_status → approved. */
  async approveActivity(activityId: string): Promise<void> {
    await this.init()
    await db.write({
      sql: `UPDATE crm_activities SET approval_status='approved',approved_at=?
            WHERE id=? AND profile_id=? AND approval_status='pending_approval'`,
      args: [now(), activityId, this.profileId],
    })
  }

  /** Reject a pending activity. Flips approval_status → rejected. */
  async rejectActivity(activityId: string): Promise<void> {
    await this.init()
    await db.write({
      sql: `UPDATE crm_activities SET approval_status='rejected'
            WHERE id=? AND profile_id=? AND approval_status='pending_approval'`,
      args: [activityId, this.profileId],
    })
  }

  /** Mark DM as sent (after user approves + actually sends). */
  async markDMSent(id: string): Promise<void> {
    await this.init()
    const ts = now()
    await db.write({
      sql: `UPDATE crm_contacts SET
            dm_sent=1,dm_sent_at=?,outreach_status='dm_sent',
            outreach_attempts=outreach_attempts+1,last_contacted_at=?,updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [ts, ts, ts, id, this.profileId],
    })
  }

  /** Mark email as sent. */
  async markEmailSent(id: string): Promise<void> {
    await this.init()
    const ts = now()
    await db.write({
      sql: `UPDATE crm_contacts SET
            email_sent=1,email_sent_at=?,outreach_status='email_sent',
            outreach_attempts=outreach_attempts+1,last_contacted_at=?,updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [ts, ts, ts, id, this.profileId],
    })
  }

  /** Log an inbound reply. Triggers increment total_replies + reply_rate_pct. */
  async logReply(
    id: string,
    channel: 'dm' | 'email',
    content: string,
    sentiment: 'positive' | 'neutral' | 'negative',
  ) {
    await this.init()
    const ts = now()
    await db.write({
      sql: `UPDATE crm_contacts SET
            outreach_status='replied',last_reply_at=?,last_reply_channel=?,
            reply_sentiment=?,last_activity_at=?,updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [ts, channel, sentiment, ts, ts, id, this.profileId],
    })
    await this.logActivity(id, channel === 'dm' ? 'dm' : 'email', 'inbound', 'contact', content)
  }

  /** Mark outreach status transitions that schema supports but weren't wired. */
  async markCallBooked(id: string, note?: string): Promise<void> {
    await this.setOutreachStatus(id, 'call_booked')
    await this.logActivity(id, 'meeting', 'outbound', 'agent', note ?? 'Call booked')
  }

  async markConverted(id: string): Promise<void> {
    await this.init()
    const ts = now()
    await db.write({
      sql: `UPDATE crm_contacts SET
            outreach_status='converted',status='customer',
            agent_status='closed',updated_at=? WHERE id=? AND profile_id=?`,
      args: [ts, id, this.profileId],
    })
    await this.logActivity(id, 'agent_action', 'outbound', 'agent', 'Converted to customer')
  }

  async markNotInterested(id: string, reason?: string): Promise<void> {
    await this.setOutreachStatus(id, 'not_interested')
    await this.logActivity(id, 'agent_action', 'outbound', 'agent',
      reason ? `Not interested: ${reason}` : 'Not interested')
  }

  private async setOutreachStatus(id: string, status: OutreachStatus): Promise<void> {
    await this.init()
    await db.write({
      sql: `UPDATE crm_contacts SET outreach_status=?,updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [status, now(), id, this.profileId],
    })
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async createDeal(contactId: string, input: {
    title: string
    value_cents: number
    stage?: CRMDealStage
    probability?: number
    product_id?: string
    expected_close_at?: number
  }): Promise<string> {
    await this.init()
    // P0-5 + P0-8: validate enum + numeric bounds before DB trigger rejects
    const stage = input.stage ?? 'new'
    if (!CRM_DEAL_STAGE.includes(stage)) throw new Error(`Invalid deal stage: ${stage}`)
    const value = vCents(input.value_cents)
    const prob  = vProbability(input.probability ?? 10)

    const id = ulid()
    const ts = now()
    await db.write({
      sql: `INSERT INTO crm_deals
            (id,profile_id,contact_id,title,value_cents,stage,probability,product_id,
             expected_close_at,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, this.profileId, contactId,
        input.title, value, stage, prob,
        input.product_id ?? null, input.expected_close_at ?? null,
        ts, ts,
      ],
    })
    return id
  }

  async updateDealStage(dealId: string, stage: CRMDealStage, lostReason?: string) {
    await this.init()
    if (!CRM_DEAL_STAGE.includes(stage)) throw new Error(`Invalid deal stage: ${stage}`)
    const ts = now()
    const closedAt = stage === 'won' || stage === 'lost' ? ts : null
    await db.write({
      sql: `UPDATE crm_deals SET stage=?,lost_reason=?,closed_at=?,updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [stage, lostReason ?? null, closedAt, ts, dealId, this.profileId],
    })
  }

  async listDeals(opts: { stage?: CRMDealStage; contact_id?: string } = {}) {
    await this.init()
    let where = 'WHERE d.profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.stage)      { where += ' AND d.stage=?';      args.push(opts.stage) }
    if (opts.contact_id) { where += ' AND d.contact_id=?'; args.push(opts.contact_id) }

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
    idempotency_key?: string
  }): Promise<string> {
    await this.init()
    const id = ulid()
    const ts = now()
    const ikey = input.idempotency_key ?? generateIdempotencyKey()

    await db.write({
      sql: `INSERT OR IGNORE INTO crm_tasks
            (id,profile_id,contact_id,deal_id,title,description,due_at,priority,
             status,idempotency_key,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,'open',?,?,?)`,
      args: [
        id, this.profileId,
        input.contact_id ?? null, input.deal_id ?? null,
        input.title, input.description ?? null,
        input.due_at ?? null, input.priority ?? 'medium',
        ikey, ts, ts,
      ],
    })
    return id
  }

  async completeTask(id: string) {
    await this.init()
    const ts = now()
    await db.write({
      sql: `UPDATE crm_tasks SET status='done',completed_at=?,updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [ts, ts, id, this.profileId],
    })
  }

  async listTasks(opts: { status?: 'open' | 'done'; due_today?: boolean } = {}) {
    await this.init()
    let where = 'WHERE t.profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.status)    { where += ' AND t.status=?'; args.push(opts.status) }
    if (opts.due_today) {
      const endOfDay = Math.floor(new Date().setHours(23, 59, 59, 999) / 1000)
      where += " AND t.due_at<=? AND t.status='open'"
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

  // ── Notes ─────────────────────────────────────────────────────────────────

  async createNote(input: {
    contact_id: string
    body: string
    deal_id?: string
    pinned?: boolean
    idempotency_key?: string
  }): Promise<string> {
    await this.init()
    const id = ulid()
    const ts = now()
    const ikey = input.idempotency_key ?? generateIdempotencyKey()

    await db.write({
      sql: `INSERT OR IGNORE INTO crm_notes
            (id,profile_id,contact_id,deal_id,body,pinned,idempotency_key,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [id, this.profileId, input.contact_id, input.deal_id ?? null,
             input.body, input.pinned ? 1 : 0, ikey, ts, ts],
    })
    return id
  }

  async listNotes(contactId: string) {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT * FROM crm_notes
            WHERE contact_id=? AND profile_id=?
            ORDER BY pinned DESC, created_at DESC`,
      args: [contactId, this.profileId],
    })
    return rows
  }

  async pinNote(noteId: string, pinned = true) {
    await this.init()
    await db.write({
      sql: `UPDATE crm_notes SET pinned=?,updated_at=? WHERE id=? AND profile_id=?`,
      args: [pinned ? 1 : 0, now(), noteId, this.profileId],
    })
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async createTemplate(input: {
    name: string
    type: 'dm' | 'email' | 'follow_up' | 'proposal'
    body: string
    subject?: string
    platform?: string
    tags?: string[]
  }): Promise<string> {
    await this.init()
    const id = ulid()
    const ts = now()
    await db.write({
      sql: `INSERT INTO crm_templates
            (id,profile_id,name,type,subject,body,platform,tags,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, this.profileId, input.name, input.type,
        input.subject ?? null, input.body,
        input.platform ?? null,
        JSON.stringify(input.tags ?? []),
        ts, ts,
      ],
    })
    return id
  }

  async listTemplates(type?: 'dm' | 'email' | 'follow_up' | 'proposal') {
    await this.init()
    const where = type ? 'AND type=?' : ''
    const args: unknown[] = [this.profileId]
    if (type) args.push(type)
    const { rows } = await db.execute({
      sql: `SELECT * FROM crm_templates WHERE profile_id=? ${where}
            ORDER BY reply_rate_pct DESC, use_count DESC`,
      args,
    })
    return rows
  }

  // ── Proposals (create / list only — sending + e-sign is app-side) ─────────

  async createProposal(input: {
    title: string
    body: string
    contact_id?: string
    deal_id?: string
    excerpt?: string
    client_name?: string
    client_email?: string
    client_company?: string
    payment_amount_cents?: number
    payment_currency?: string
    expires_at?: number
    cta_label?: string
    cta_url?: string
    template_id?: string
    ai_generated?: boolean
    idempotency_key?: string
  }): Promise<{ id: string; public_slug: string }> {
    await this.init()
    const id = ulid()
    const public_slug = `${ulid().slice(0, 10)}-${Date.now().toString(36)}`
    const ts = now()
    const ikey = input.idempotency_key ?? generateIdempotencyKey()
    const payAmount = input.payment_amount_cents !== undefined ? vCents(input.payment_amount_cents) : null

    await db.write({
      sql: `INSERT OR IGNORE INTO crm_proposals
            (id,profile_id,contact_id,deal_id,title,body,excerpt,public_slug,
             status,client_name,client_email,client_company,
             payment_required,payment_amount_cents,payment_currency,
             expires_at,cta_label,cta_url,template_id,ai_generated,
             idempotency_key,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, this.profileId,
        input.contact_id ?? null, input.deal_id ?? null,
        input.title, input.body, input.excerpt ?? null, public_slug,
        input.client_name ?? null, input.client_email ?? null, input.client_company ?? null,
        payAmount !== null ? 1 : 0, payAmount, input.payment_currency ?? 'usd',
        input.expires_at ?? null, input.cta_label ?? null, input.cta_url ?? null,
        input.template_id ?? null, input.ai_generated ? 1 : 0,
        ikey, ts, ts,
      ],
    })
    return { id, public_slug }
  }

  async listProposals(opts: { status?: string; contact_id?: string } = {}) {
    await this.init()
    let where = 'WHERE profile_id=? AND hidden=0'
    const args: unknown[] = [this.profileId]
    if (opts.status)     { where += ' AND status=?';     args.push(opts.status) }
    if (opts.contact_id) { where += ' AND contact_id=?'; args.push(opts.contact_id) }
    const { rows } = await db.execute({
      sql: `SELECT id,title,public_slug,status,client_name,client_email,
                   payment_amount_cents,email_opened_at,email_clicked_at,
                   viewed_at,view_count,paid_at,expires_at,created_at
            FROM crm_proposals ${where} ORDER BY created_at DESC`,
      args,
    })
    return rows
  }

  // ── Invoices (create / list only — sending is app-side) ───────────────────

  async createInvoice(input: {
    invoice_number: string
    contact_id?: string
    deal_id?: string
    proposal_id?: string
    line_items: Array<{ description: string; quantity: number; unit_price_cents: number; total_cents: number }>
    client_name?: string
    client_email?: string
    client_company?: string
    currency?: string
    discount_cents?: number
    tax_cents?: number
    due_at?: number
    notes?: string
    idempotency_key?: string
  }): Promise<{ id: string; public_slug: string }> {
    await this.init()
    const id = ulid()
    const public_slug = `${ulid().slice(0, 10)}-${Date.now().toString(36)}`
    const ts = now()
    const ikey = input.idempotency_key ?? generateIdempotencyKey()

    const subtotal = input.line_items.reduce((a, li) => a + vCents(li.total_cents), 0)
    const discount = vCents(input.discount_cents ?? 0)
    const tax      = vCents(input.tax_cents ?? 0)
    const total    = Math.max(0, subtotal - discount + tax)

    await db.write({
      sql: `INSERT OR IGNORE INTO crm_invoices
            (id,profile_id,contact_id,deal_id,proposal_id,invoice_number,public_slug,
             status,client_name,client_email,client_company,line_items,
             subtotal_cents,discount_cents,tax_cents,total_cents,currency,
             issued_at,due_at,notes,idempotency_key,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, this.profileId,
        input.contact_id ?? null, input.deal_id ?? null, input.proposal_id ?? null,
        input.invoice_number, public_slug,
        input.client_name ?? null, input.client_email ?? null, input.client_company ?? null,
        JSON.stringify(input.line_items),
        subtotal, discount, tax, total, input.currency ?? 'usd',
        ts, input.due_at ?? null, input.notes ?? null,
        ikey, ts, ts,
      ],
    })
    return { id, public_slug }
  }

  async listInvoices(opts: { status?: string; contact_id?: string } = {}) {
    await this.init()
    let where = 'WHERE profile_id=? AND hidden=0'
    const args: unknown[] = [this.profileId]
    if (opts.status)     { where += ' AND status=?';     args.push(opts.status) }
    if (opts.contact_id) { where += ' AND contact_id=?'; args.push(opts.contact_id) }
    const { rows } = await db.execute({
      sql: `SELECT id,invoice_number,public_slug,status,client_name,
                   total_cents,currency,due_at,issued_at,paid_at,
                   email_opened_at,email_clicked_at,created_at
            FROM crm_invoices ${where} ORDER BY created_at DESC`,
      args,
    })
    return rows
  }

  // ── Pipeline overview ─────────────────────────────────────────────────────

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
            WHERE a.profile_id=? AND a.approval_status='pending_approval'
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

  // ── Groups (P0-4: junction table, never LIKE '%grp_x%') ───────────────────

  /** Contacts in a group — indexed, no substring collision. */
  async listContactsInGroup(groupId: string, limit = 50, offset = 0): Promise<unknown[]> {
    await this.init()
    if (!(await hasGroupsJunction())) {
      throw new Error('crm_contact_groups table not present — upgrade BusinessKit to enable groups')
    }
    return getContactsByGroup(this.profileId, groupId, limit, offset)
  }

  /** Add contact to group — idempotent. */
  async addToGroup(contactId: string, groupId: string): Promise<void> {
    await this.init()
    if (!(await hasGroupsJunction())) {
      throw new Error('crm_contact_groups table not present — upgrade BusinessKit to enable groups')
    }
    await addContactToGroup(this.profileId, contactId, groupId)
  }

  /** Remove contact from group. */
  async removeFromGroup(contactId: string, groupId: string): Promise<void> {
    await this.init()
    if (!(await hasGroupsJunction())) return
    await removeContactFromGroup(this.profileId, contactId, groupId)
  }

  /** All groups for a contact. */
  async groupsFor(contactId: string): Promise<unknown[]> {
    await this.init()
    if (!(await hasGroupsJunction())) return []
    return getGroupsForContact(this.profileId, contactId)
  }

  // ── Agent context (per-contact scratchpad) ────────────────────────────────

  async updateAgentContext(id: string, updates: Record<string, unknown>) {
    await this.init()
    const contact = await this.getContact(id)
    const merged  = { ...contact.agent_context, ...updates, updated_at: iso() }
    await db.write({
      sql: `UPDATE crm_contacts SET agent_context=?,updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [JSON.stringify(merged), now(), id, this.profileId],
    })
  }

  async setNextFollowUp(id: string, atUnix: number, note?: string) {
    await this.init()
    await db.write({
      sql: `UPDATE crm_contacts SET next_follow_up_at=?,
            follow_up_count=follow_up_count+1,updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [atUnix, now(), id, this.profileId],
    })
    if (note) await this.logActivity(id, 'note', 'outbound', 'agent', note)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Writes an activity row. Idempotency_key dedupes retries across network
   * flakes. Accepts optional subject + channel + dealId via `extra`.
   *
   * Safe to call multiple times with the same idempotency_key — the DB's
   * unique partial index silently ignores duplicates.
   */
  private async logActivity(
    contactId: string,
    type: ActivityType,
    direction: ActivityDirection,
    sender: ActivitySender,
    body: string,
    extra: {
      approval_status?: ApprovalStatus
      subject?: string
      channel?: string
      deal_id?: string
      metadata?: Record<string, unknown>
      idempotency_key?: string
    } = {},
  ): Promise<string> {
    await this.init()
    const id  = ulid()
    const ts  = now()
    const approval = extra.approval_status ?? 'auto_sent'
    const ikey = extra.idempotency_key ?? generateIdempotencyKey()
    const metadata = {
      ...(extra.subject ? { subject: extra.subject } : {}),
      ...(extra.channel ? { channel: extra.channel } : {}),
      ...(extra.metadata ?? {}),
    }

    await db.write({
      sql: `INSERT OR IGNORE INTO crm_activities
            (id,profile_id,contact_id,deal_id,type,direction,sender,subject,body,
             metadata,searchable_context,approval_status,
             approval_requested_at,idempotency_key,occurred_at,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, this.profileId, contactId, extra.deal_id ?? null,
        type, direction, sender, extra.subject ?? null, body,
        JSON.stringify(metadata),
        `${type} ${direction} ${body.slice(0, 200)}`,
        approval,
        approval === 'pending_approval' ? ts : null,
        ikey, ts, ts,
      ],
    })
    return id
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

export const crmAgent = new CRMAgent()
