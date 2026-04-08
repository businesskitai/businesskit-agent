/**
 * setup.ts — verify everything works after cloning.
 * Usage: npm run setup
 */

import { existsSync } from 'fs'
import { readFileSync } from 'fs'
import { createClient } from '@libsql/client/web'

const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

const ok = (msg: string) => console.log(`${GREEN}✓${RESET} ${msg}`)
const err = (msg: string) => console.error(`${RED}✗${RESET} ${msg}`)
const dim = (msg: string) => console.log(`${DIM}  ${msg}${RESET}`)

console.log(`\n${BOLD}BusinessKit Agent — Setup Check${RESET}\n`)

// ── Step 1: .env exists ───────────────────────────────────────────────────────
console.log('1. Checking .env file...')
if (!existsSync('.env')) {
  err('.env not found')
  dim('Run: cp .env.example .env')
  dim('Then paste TURSO_URL and TURSO_TOKEN from BusinessKit → Settings → Credentials')
  process.exit(1)
}

// Parse .env manually (no dotenv dependency needed for setup)
const env: Record<string, string> = {}
readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
})

const TURSO_URL = env.TURSO_URL || process.env.TURSO_URL || ''
const TURSO_TOKEN = env.TURSO_TOKEN || process.env.TURSO_TOKEN || ''

if (!TURSO_URL) {
  err('TURSO_URL is missing from .env')
  dim('Find it at: BusinessKit → Settings → Credentials')
  process.exit(1)
}
if (!TURSO_TOKEN) {
  err('TURSO_TOKEN is missing from .env')
  dim('Find it at: BusinessKit → Settings → Credentials')
  process.exit(1)
}
if (!TURSO_URL.startsWith('libsql://')) {
  err(`TURSO_URL looks wrong: "${TURSO_URL}"`)
  dim('It should start with libsql://')
  process.exit(1)
}
ok('.env found with TURSO_URL and TURSO_TOKEN')

// ── Step 2: Turso connection ──────────────────────────────────────────────────
console.log('\n2. Testing Turso connection...')
let db: ReturnType<typeof createClient>
try {
  db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })
  await db.execute('SELECT 1')
  ok('Turso connected')
} catch (e: any) {
  err(`Turso connection failed: ${e.message}`)
  dim('Check TURSO_URL and TURSO_TOKEN — make sure they match exactly')
  dim('Token must not have extra spaces or quotes')
  process.exit(1)
}

// ── Step 3: Profile exists ────────────────────────────────────────────────────
console.log('\n3. Loading your profile...')
try {
  const { rows } = await db.execute('SELECT id, slug, title FROM profiles LIMIT 1')
  if (!rows.length) {
    err('No profile found in your database')
    dim('Complete BusinessKit onboarding at businesskit.io first')
    dim('Then come back and run: npm run setup')
    process.exit(1)
  }
  const p = rows[0]
  ok(`Profile: ${p.title} (@${p.slug})`)
  dim(`Profile ID: ${p.id}`)
} catch (e: any) {
  err(`Could not read profiles table: ${e.message}`)
  dim('Your database may not be provisioned yet')
  dim('Complete BusinessKit onboarding first')
  process.exit(1)
}

// ── Step 4: Key agent tables exist ───────────────────────────────────────────
console.log('\n4. Checking database tables...')
const requiredTables = ['profiles', 'posts', 'products', 'subscribers', 'crm_contacts', 'social_posts']
const missing: string[] = []

for (const table of requiredTables) {
  try {
    await db.execute(`SELECT 1 FROM ${table} LIMIT 0`)
  } catch {
    missing.push(table)
  }
}

if (missing.length) {
  err(`Missing tables: ${missing.join(', ')}`)
  dim('Your DB may not be fully provisioned')
  dim('Go to BusinessKit → Dashboard → Status and click "Provision"')
  process.exit(1)
}
ok(`All required tables found`)

// ── Step 5: Node version ──────────────────────────────────────────────────────
console.log('\n5. Checking Node.js version...')
const [major] = process.versions.node.split('.').map(Number)
if (major < 18) {
  err(`Node.js ${process.versions.node} is too old (need 18+)`)
  dim('Install Node.js 18+ from nodejs.org')
  process.exit(1)
}
ok(`Node.js ${process.versions.node}`)

// ── Done ──────────────────────────────────────────────────────────────────────
console.log(`\n${GREEN}${BOLD}✅ All checks passed.${RESET}\n`)
console.log(`Open this folder in Claude Code and type ${BOLD}/ceo${RESET} to start.\n`)
console.log(`Or run from terminal:`)
console.log(`  ${DIM}npx tsx cli.ts ceo${RESET}\n`)