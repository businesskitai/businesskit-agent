/**
 * PEARL — Newsletter Writer
 * "I turn your audience into a community."
 * Reads: subscribers table
 * Sends: via SES or Resend (credentials table)
 * Posts: via n8n webhook for scheduling
 */

import { BaseAgent, db } from '../_base.ts'

export interface NewsletterInput {
  subject: string
  preview_text?: string
  body_html: string
  body_text?: string    // plain text fallback
  schedule_at?: string  // ISO — pass to n8n for scheduled send
}

export class NewsletterWriter extends BaseAgent {
  readonly name  = 'PEARL'
  readonly title = 'Newsletter Writer'

  async subscriberStats() {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT COUNT(*) total,
            COUNT(CASE WHEN signup_timestamp > strftime('%s','now','-30 days') THEN 1 END) last_30d,
            COUNT(CASE WHEN country IS NOT NULL THEN 1 END) with_location
            FROM subscribers WHERE profile_id=?`,
      args: [this.profileId],
    })
    return { total: Number(r?.total ?? 0), last30d: Number(r?.last_30d ?? 0) }
  }

  async listSubscribers(limit = 100) {
    await this.init()
    const { rows } = await db.execute({
      sql: 'SELECT email,name,country,signup_timestamp FROM subscribers WHERE profile_id=? ORDER BY signup_timestamp DESC LIMIT ?',
      args: [this.profileId, limit],
    })
    return rows
  }

  /**
   * Send newsletter via n8n webhook.
   * n8n handles actual delivery via SES / Resend / any ESP.
   * Payload includes all subscriber data for n8n to iterate.
   */
  async send(input: NewsletterInput) {
    await this.init()
    const { n8n_webhook_url } = this.ctx.credentials
    if (!n8n_webhook_url) return { ok: false, reason: 'No n8n webhook configured' }

    const stats = await this.subscriberStats()

    try {
      const res = await fetch(n8n_webhook_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event:         'newsletter_send',
          business:      this.ctx.profile.title,
          profile_id:    this.profileId,
          subject:       input.subject,
          preview_text:  input.preview_text ?? null,
          body_html:     input.body_html,
          body_text:     input.body_text ?? null,
          schedule_at:   input.schedule_at ?? null,
          subscriber_count: stats.total,
          timestamp:     new Date().toISOString(),
        }),
      })
      return { ok: res.ok, status: res.status, subscriber_count: stats.total }
    } catch (e) {
      return { ok: false, reason: String(e) }
    }
  }

  /** Top countries for newsletter targeting */
  async audienceBreakdown() {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT country, COUNT(*) n FROM subscribers WHERE profile_id=? AND country IS NOT NULL
            GROUP BY country ORDER BY n DESC LIMIT 10`,
      args: [this.profileId],
    })
    return rows
  }
}

export const newsletterWriter = new NewsletterWriter()
