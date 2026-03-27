/**
 * CRON — Scheduler
 * "I wake up so you don't have to."
 *
 * Phase 1: run manually via `npx tsx agents/growth/cron.ts`
 * Phase 3: export as CF Durable Object, called by wrangler cron trigger
 *
 * Design: thin orchestrator — delegates to OTTO (publish queue),
 * ARIA (weekly briefing), NOVA (content calendar drafts), PEARL (newsletter).
 */

import { coo } from '../csuite/coo.ts'
import { ceo } from '../csuite/ceo.ts'

export class Scheduler {
  readonly name  = 'CRON'
  readonly title = 'Scheduler'

  /**
   * Hourly job — publish any content scheduled for now
   * CF Workflow cron: "0 * * * *"
   */
  async hourly() {
    const published = await coo.runPublishQueue()
    return { published_count: published.length, published }
  }

  /**
   * Daily job — lightweight ops check
   * CF Workflow cron: "0 9 * * *"
   */
  async daily() {
    const pipeline = await coo.draftPipeline()
    const totalDrafts = pipeline.reduce((a, p) => a + p.drafts.length, 0)
    return { draft_count: totalDrafts, pipeline_summary: pipeline.map(p => `${p.label}: ${p.drafts.length} drafts`) }
  }

  /**
   * Weekly job — full briefing sent to n8n
   * CF Workflow cron: "0 8 * * 1" (Monday 8am)
   */
  async weekly() {
    const result = await ceo.sendBriefing()
    return { briefing_sent: result.ok, ...result }
  }
}

export const scheduler = new Scheduler()

// ─── CF Durable Object export (Phase 3) ──────────────────────────────────────
// Uncomment when deploying as a Durable Object on Cloudflare Workers:
//
// import { DurableObject } from 'cloudflare:workers'
// export class CronAgent extends DurableObject {
//   async fetch(req: Request) {
//     const { pathname } = new URL(req.url)
//     if (pathname === '/hourly') return Response.json(await cron.hourly())
//     if (pathname === '/daily')  return Response.json(await cron.daily())
//     if (pathname === '/weekly') return Response.json(await cron.weekly())
//     return new Response('Not found', { status: 404 })
//   }
// }

// ─── CLI runner (Phase 1) ─────────────────────────────────────────────────────
if (process.argv[2]) {
  const job = process.argv[2] as 'hourly' | 'daily' | 'weekly'
  scheduler[job]?.().then(r => console.log(JSON.stringify(r, null, 2))).catch(console.error)
}
