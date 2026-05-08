#!/usr/bin/env node
/**
 * cli.ts — BusinessKit Agent CLI
 *
 * Usage: npx businesskit-agent <agent> [command] [...args]
 *
 * Examples:
 *   npx businesskit-agent ceo
 *   npx businesskit-agent blog-writer create "My Post Title"
 *   npx businesskit-agent scheduler hourly
 *   npx businesskit-agent analytics-agent snapshot
 */

import 'dotenv/config'

const [, , agentName, command, ...args] = process.argv

// Each agent lives at agents/<folder>/<folder>.ts.
// Aliases (e.g. "cmo" -> "marketing") preserve legacy CLI entry points.
const AGENTS: Record<string, string> = {
  ceo:          'ceo/ceo',
  marketing:    'marketing/marketing',
  cmo:          'marketing/marketing',
  operations:   'operations/operations',
  coo:          'operations/operations',
  business:     'business/business',
  cbo:          'business/business',
  sales:        'sales/sales',
  crm:          'sales/sales',
  'crm-agent':  'sales/sales',
  content:      'content/content',
  'blog-writer': 'content/content',
  newsletter:   'newsletter/newsletter',
  'newsletter-writer': 'newsletter/newsletter',
  copywriting:  'copywriting/copywriting',
  copywriter:   'copywriting/copywriting',
  courses:      'courses/courses',
  'course-creator': 'courses/courses',
  store:        'store/store',
  'store-manager': 'store/store',
  hiring:       'hiring/hiring',
  'jobs-manager': 'hiring/hiring',
  forms:        'forms/forms',
  'forms-builder': 'forms/forms',
  docs:         'docs/docs',
  'docs-writer': 'docs/docs',
  analytics:    'analytics/analytics',
  'analytics-agent': 'analytics/analytics',
  seo:          'seo/seo',
  'seo-agent':  'seo/seo',
  social:       'social/social',
  'social-agent': 'social/social',
  scheduler:    'scheduler/scheduler',
}

if (!agentName || agentName === 'help') {
  printHelp()
  process.exit(0)
}

const path = AGENTS[agentName.toLowerCase()]
if (!path) {
  console.error(`\nUnknown agent: "${agentName}"`)
  console.error('Run: npx businesskit-agent help\n')
  process.exit(1)
}

const mod = await import(`./agents/${path}.ts`)
const exportKey = Object.keys(mod).find(k => typeof mod[k] === 'object' && mod[k] !== null)
const agent = exportKey ? mod[exportKey] : null

if (!agent) {
  console.error(`Could not load agent: ${agentName}`)
  process.exit(1)
}

const cmd = command ?? defaultCommand(agentName)

if (typeof agent[cmd] !== 'function') {
  console.error(`\nAgent "${agentName}" has no command "${cmd}"`)
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(agent))
    .filter(m => m !== 'constructor' && !m.startsWith('_') && typeof agent[m] === 'function')
  console.error(`Available: ${methods.join(', ')}\n`)
  process.exit(1)
}

try {
  const result = await agent[cmd](...args)
  if (result !== undefined) console.log(JSON.stringify(result, null, 2))
} catch (e) {
  console.error('\nError:', e instanceof Error ? e.message : e)
  process.exit(1)
}

function defaultCommand(name: string): string {
  const defaults: Record<string, string> = {
    ceo: 'weeklyBriefing',
    marketing: 'contentCalendar',   cmo: 'contentCalendar',
    operations: 'draftPipeline',    coo: 'draftPipeline',
    business: 'revenueReport',      cbo: 'revenueReport',
    sales: 'pipelineSummary',       crm: 'pipelineSummary',
    'crm-agent': 'pipelineSummary',
    analytics: 'snapshot',          'analytics-agent': 'snapshot',
    seo: 'audit',                   'seo-agent': 'audit',
    scheduler: 'daily',
  }
  return defaults[name] ?? 'list'
}

function printHelp() {
  console.log(`
BusinessKit Agent CLI

Usage: npx businesskit-agent <agent> [command] [args]

C-Suite:
  ceo                Weekly briefing (revenue, traffic, priorities)
  cmo                Content calendar + growth strategy
  coo                Draft pipeline + publish queue
  cbo                Revenue report + pricing audit

Creators:
  blog-writer        List posts or create new (create "Title")
  newsletter-writer  Subscriber stats or send newsletter
  copywriter         List pages or create new
  course-creator     List courses
  store-manager      List products by type
  jobs-manager       List job listings
  forms-builder      List forms
  docs-writer        List articles
  crm                CRM contacts and pipeline

Growth:
  analytics-agent    Full analytics snapshot
  seo-agent          SEO audit across all content
  social-agent       Post content to social via n8n
  scheduler          Run publish queue (hourly|daily|weekly)

Setup:
  npx tsx setup.ts   Verify Turso connection

Requires TURSO_URL + TURSO_TOKEN in .env
`)
}
