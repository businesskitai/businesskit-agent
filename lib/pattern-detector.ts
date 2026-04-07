/**
 * pattern-detector.ts — Hermes-inspired periodic pattern detection
 *
 * NOT called on every agent run — called periodically by the Scheduler agent
 * or when user explicitly runs /detect-patterns.
 *
 * What it does:
 *   1. Reads last 20 agent_memory entries
 *   2. Finds actions repeated 3+ times in 7 days by the same agent
 *   3. Checks if a task already exists for that pattern
 *   4. If not: creates a PENDING agent_tasks row + sets pending_skill_suggestion
 *      on the agents table → surfaces in dashboard for user to approve/reject
 *
 * User approves → task status='active', skill is_active=1
 * User rejects  → task status='cancelled'
 *
 * "Having them is better — not forced, not run every time."
 */

import { db } from './db.ts'
import { getProfile } from './profile.ts'
import { ulid, now, iso } from './id.ts'

const PATTERN_THRESHOLD = 3    // times an action must repeat
const PATTERN_WINDOW_DAYS = 7    // within this many days

export interface DetectedPattern {
    agent: string
    action: string  // action string that repeated
    count: number
    memory_ids: number[]
}

/**
 * Scan agent_memory for repeated patterns.
 * Returns patterns that don't already have an active/pending task.
 */
export async function detectPatterns(): Promise<DetectedPattern[]> {
    const profile = await getProfile()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - PATTERN_WINDOW_DAYS)
    const cutoffISO = cutoff.toISOString().slice(0, 10)

    const { rows } = await db.execute({
        sql: `SELECT id, agent, action, session_date FROM agent_memory
           WHERE profile_id=? AND session_date >= ?
           ORDER BY id DESC`,
        args: [profile.id, cutoffISO],
    })

    // Count occurrences per agent+action_prefix
    const counts = new Map<string, { agent: string; action: string; ids: number[] }>()

    for (const row of rows) {
        // Normalize action: strip IDs and numbers to find the pattern
        // "Published 'Email Tips' (listicle, 2100 words)" → "published post"
        const normalized = normalizeAction(row.action as string)
        const key = `${row.agent}::${normalized}`

        if (!counts.has(key)) {
            counts.set(key, { agent: row.agent as string, action: normalized, ids: [] })
        }
        counts.get(key)!.ids.push(row.id as number)
    }

    const patterns: DetectedPattern[] = []
    for (const [, v] of counts) {
        if (v.ids.length >= PATTERN_THRESHOLD) {
            patterns.push({ agent: v.agent, action: v.action, count: v.ids.length, memory_ids: v.ids })
        }
    }

    // Filter out patterns that already have a task
    if (!patterns.length) return []

    const filtered: DetectedPattern[] = []
    for (const p of patterns) {
        const { rows: [existing] } = await db.execute({
            sql: `SELECT id FROM agent_tasks WHERE profile_id=? AND agent=?
             AND status NOT IN ('cancelled') AND command LIKE ?
             LIMIT 1`,
            args: [profile.id, p.agent, `%${p.action.split(' ')[0]}%`],
        })
        if (!existing) filtered.push(p)
    }

    return filtered
}

/**
 * For each detected pattern: create a pending task + set skill suggestion.
 * User sees these in dashboard and can approve or reject.
 */
export async function suggestFromPatterns(patterns: DetectedPattern[]): Promise<void> {
    if (!patterns.length) return
    const profile = await getProfile()
    const ts = now()

    for (const p of patterns) {
        const taskId = ulid()
        const taskTitle = `Auto-detected: ${p.agent} — ${p.action} (${p.count}x in 7 days)`
        const skillContent = `# Auto-detected skill: ${p.action}\n\nThis task was detected because the ${p.agent} agent performed "${p.action}" ${p.count} times in the last 7 days.\n\nApprove to schedule it automatically.`

        // Create pending task
        try {
            await db.execute({
                sql: `INSERT OR IGNORE INTO agent_tasks
               (id,profile_id,agent,title,command,source,status,created_at,updated_at)
               VALUES (?,?,?,?,'auto-detected','agent','pending',?,?)`,
                args: [taskId, profile.id, p.agent, taskTitle, ts, ts],
            })
        } catch { /* already exists */ }

        // Set pending skill suggestion on agents table
        try {
            const suggestion = JSON.stringify({
                slug: `auto-${p.agent}-${p.action.replace(/\s+/g, '-').toLowerCase().slice(0, 30)}`,
                name: `Auto: ${p.action}`,
                content: skillContent,
                detected_from: p.memory_ids,
                task_id: taskId,
            })
            await db.execute({
                sql: `UPDATE agents SET pending_skill_suggestion=?, skill_suggestion_at=?, updated_at=?
               WHERE profile_id=? AND agent_type=?`,
                args: [suggestion, ts, ts, profile.id, p.agent],
            })
        } catch { /* agents table may not exist */ }
    }
}

/**
 * Run full detection + suggestion cycle.
 * Called by Scheduler agent periodically (e.g. weekly).
 * Not called on every agent run.
 */
export async function runPatternDetection(): Promise<{
    patterns_found: number
    suggestions_created: number
}> {
    const patterns = await detectPatterns()
    if (!patterns.length) return { patterns_found: 0, suggestions_created: 0 }

    await suggestFromPatterns(patterns)

    return {
        patterns_found: patterns.length,
        suggestions_created: patterns.length,
    }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalizeAction(action: string): string {
    return action
        .toLowerCase()
        // Remove quoted strings (post titles, names)
        .replace(/"[^"]*"/g, '')
        .replace(/'[^']*'/g, '')
        // Remove parenthetical details
        .replace(/\([^)]*\)/g, '')
        // Remove numbers
        .replace(/\d+/g, '')
        // Remove common filler
        .replace(/\b(the|a|an|for|to|and|or|in|on|at|with)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50)
}