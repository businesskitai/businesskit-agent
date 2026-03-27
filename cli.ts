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

const AGENTS: Record<string, string> = {
  'ceo': 'csuite/ceo',
  'cmo': 'csuite/cmo',
  'coo': 'csuite/coo',
  'cbo': 'csuite/cbo',
  'blog-writer': 'creators/blog-writer',
  'newsletter-writer': 'creators/newsletter-writer',
  'copywriter': 'creators/copywriter',
  'course-creator': 'creators/course-creator',
  'store-manager': 'creators/store-manager',
  'jobs-manager': 'creators/jobs-manager',
  'forms-builder': 'creators/forms-builder',
  'docs-writer': 'creators/docs-writer',
  'analytics-agent': 'growth/analytics-agent',
  'seo-agent': 'growth/seo-agent',
  'social-agent': 'growth/social-agent',
  'scheduler': 'growth/scheduler',
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
    'ceo': 'weeklyBriefing',
    'cmo': 'contentCalendar',
    'coo': 'draftPipeline',
    'cbo': 'revenueReport',
    'analytics-agent': 'snapshot',
    'seo-agent': 'audit',
    'scheduler': 'daily',
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
