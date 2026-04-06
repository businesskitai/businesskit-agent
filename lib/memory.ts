/**
 * memory.ts — Dual-write agent memory
 *
 * Writes to BOTH:
 *   1. agent_memory table in Turso  — synced, loss-proof, queryable, Phase 2 ready
 *   2. memory.md local file         — works offline, instant read, Claude Code reads it
 *
 * If Turso write fails → local still written (never lose an action)
 * If local write fails → Turso still written (CF Workers has no fs, that's fine)
 *
 * memory.md structure:
 *   ## Preferences    ← user says "always/never do X" → agent adds here
 *   ## Recent Actions ← last 20 actions, newest first (agent appends)
 *
 * agent_memory table: rolling 20 rows per profile, auto-trimmed
 * agent_skills table: live skill instructions, editable from dashboard
 */

import { db }         from './db.ts'
import { getProfile }  from './profile.ts'

const MAX_MEMORY_ROWS  = 20
const MEMORY_FILE      = './memory.md'
const MEMORY_SEPARATOR = '\n## Recent Actions\n'

// ─────────────────────────────────────────────────────────────────────────────
// Agent Memory (dual-write: Turso + local file)
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id:           number
  profile_id:   string
  session_date: string   // 'YYYY-MM-DD'
  agent:        string   // 'ceo' | 'blog-writer' | 'crm' | 'social' etc
  action:       string   // short summary of what happened
  metadata:     Record<string, unknown>
  created_at:   string
}

/**
 * Log an agent action.
 * Writes to Turso agent_memory table AND appends to memory.md.
 * Either can fail independently without losing the write to the other.
 */
export async function logMemory(
  agent:    string,
  action:   string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const ts    = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const line  = `- [${ts}] [${agent}] ${action}`

  // Write to Turso (primary — synced, loss-proof)
  try {
    const profile = await getProfile()
    await db.execute({
      sql:  `INSERT INTO agent_memory (profile_id, session_date, agent, action, metadata)
             VALUES (?,?,?,?,?)`,
      args: [profile.id, today, agent, action, JSON.stringify(metadata)],
    })
    // Trim to MAX_MEMORY_ROWS
    await db.execute({
      sql:  `DELETE FROM agent_memory WHERE profile_id=? AND id NOT IN (
               SELECT id FROM agent_memory WHERE profile_id=?
               ORDER BY id DESC LIMIT ?
             )`,
      args: [profile.id, profile.id, MAX_MEMORY_ROWS],
    })
  } catch {
    // Turso unavailable — local write below still saves the action
  }

  // Write to memory.md (local — offline-safe, Claude Code reads automatically)
  try {
    const { appendFileSync, readFileSync, writeFileSync, existsSync } = await import('fs')

    if (!existsSync(MEMORY_FILE)) {
      writeFileSync(MEMORY_FILE, `# Agent Memory\n\n## Preferences\n<!-- Agent adds user preferences here -->\n${MEMORY_SEPARATOR}`, 'utf8')
    }

    const content = readFileSync(MEMORY_FILE, 'utf8')
    const sepIdx  = content.indexOf(MEMORY_SEPARATOR)

    if (sepIdx === -1) {
      // Separator missing — just append
      appendFileSync(MEMORY_FILE, `\n${line}\n`, 'utf8')
    } else {
      // Insert new line right after separator header
      const before = content.slice(0, sepIdx + MEMORY_SEPARATOR.length)
      const after  = content.slice(sepIdx + MEMORY_SEPARATOR.length)
      // Keep only last MAX_MEMORY_ROWS lines in the actions section
      const existing = after.split('\n').filter(l => l.startsWith('- ['))
      const trimmed  = [line, ...existing].slice(0, MAX_MEMORY_ROWS).join('\n')
      writeFileSync(MEMORY_FILE, `${before}${trimmed}\n`, 'utf8')
    }
  } catch {
    // No fs (CF Workers Phase 2) — Turso write above is sufficient
  }
}

/**
 * Read memory from Turso (primary).
 * Falls back to parsing memory.md if Turso is unreachable.
 */
export async function readMemory(): Promise<MemoryEntry[]> {
  // Try Turso first
  try {
    const profile = await getProfile()
    const { rows } = await db.execute({
      sql:  `SELECT * FROM agent_memory WHERE profile_id=? ORDER BY id DESC LIMIT ?`,
      args: [profile.id, MAX_MEMORY_ROWS],
    })
    if (rows.length) {
      return rows.map(r => ({
        ...r,
        metadata: safeJSON(r.metadata, {}),
      })) as unknown as MemoryEntry[]
    }
  } catch { /* fall through to local */ }

  // Fallback: parse memory.md
  try {
    const { readFileSync, existsSync } = await import('fs')
    if (!existsSync(MEMORY_FILE)) return []
    const content = readFileSync(MEMORY_FILE, 'utf8')
    const sepIdx  = content.indexOf(MEMORY_SEPARATOR)
    if (sepIdx === -1) return []
    const lines = content
      .slice(sepIdx + MEMORY_SEPARATOR.length)
      .split('\n')
      .filter(l => l.startsWith('- ['))
    return lines.map((l, i) => ({
      id:           i,
      profile_id:   '',
      session_date: l.match(/\[(\d{4}-\d{2}-\d{2})/)?.[1] ?? '',
      agent:        l.match(/\]\s*\[([^\]]+)\]/)?.[1] ?? '',
      action:       l.replace(/^- \[.*?\]\s*\[.*?\]\s*/, ''),
      metadata:     {},
      created_at:   '',
    }))
  } catch {
    return []
  }
}

/** Format memory as readable context string for session start */
export async function memoryContext(): Promise<string> {
  const entries = await readMemory()
  if (!entries.length) return '(No memory yet — this is the first session.)'
  return [...entries].reverse()
    .map(e => `[${e.session_date}] [${e.agent}] ${e.action}`)
    .join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Skills (Turso only — no local copy needed, editable from dashboard)
// ─────────────────────────────────────────────────────────────────────────────

export interface Skill {
  id:         number
  profile_id: string
  name:       string   // human label: 'Brand Voice', 'SEO Rules'
  slug:       string   // 'brand-voice' | 'seo' | 'store' | 'analytics' | custom
  content:    string   // markdown — the actual skill instructions
  is_active:  number
  version:    number
  updated_at: string
}

export async function loadSkills(): Promise<Skill[]> {
  const profile = await getProfile()
  const { rows } = await db.execute({
    sql:  `SELECT * FROM agent_skills WHERE profile_id=? AND is_active=1 ORDER BY name ASC`,
    args: [profile.id],
  })
  return rows as unknown as Skill[]
}

export async function loadSkill(slug: string): Promise<Skill | null> {
  const profile = await getProfile()
  const { rows: [r] } = await db.execute({
    sql:  `SELECT * FROM agent_skills WHERE profile_id=? AND slug=? AND is_active=1 LIMIT 1`,
    args: [profile.id, slug],
  })
  return (r as unknown as Skill) ?? null
}

export async function upsertSkill(slug: string, name: string, content: string): Promise<void> {
  const profile = await getProfile()
  const now     = new Date().toISOString().slice(0, 19) + 'Z'
  await db.execute({
    sql:  `INSERT INTO agent_skills (profile_id, name, slug, content, is_active, version, updated_at)
           VALUES (?,?,?,?,1,1,?)
           ON CONFLICT(profile_id, slug) DO UPDATE SET
             content=excluded.content, name=excluded.name,
             version=version+1, updated_at=excluded.updated_at`,
    args: [profile.id, name, slug, content, now],
  })
}

export async function skillsContext(): Promise<string> {
  const skills = await loadSkills()
  if (!skills.length) return ''
  return skills.map(s => `## Skill: ${s.name}\n${s.content}`).join('\n\n---\n\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Session bootstrap — call at start of every agent session
// ─────────────────────────────────────────────────────────────────────────────

export async function sessionContext(): Promise<{ memory: string; skills: string }> {
  const [memory, skills] = await Promise.all([memoryContext(), skillsContext()])
  return { memory, skills }
}

function safeJSON(v: unknown, fb: unknown) {
  try { return JSON.parse(v as string) } catch { return fb }
}