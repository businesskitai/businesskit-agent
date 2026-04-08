/**
 * kb.ts — Karpathy LLM Wiki for BusinessKit agents
 *
 * The agent_kb table is a persistent, compounding knowledge base.
 * Agents maintain it. Users only read it.
 *
 * Three-layer architecture (Karpathy):
 *   agent_notes → raw sources (user drops anything here)
 *   agent_kb    → compiled wiki (agent integrates, cross-references, updates)
 *   agent_skills → schema (tells agent how the KB is structured)
 *
 * How it works:
 *   1. User drops notes into agent_notes (links, ideas, articles, screenshots)
 *   2. Agent runs processInboxNotes() periodically
 *   3. Agent reads each note, decides: new KB entry OR update existing one
 *   4. If new source contradicts existing entry → marks stale=1
 *   5. One new source can update 10-15 existing KB pages (Karpathy's observation)
 *   6. Answers to user questions get filed back as KB entries (compounding)
 *
 * Index pattern (token-efficient):
 *   Agent reads slug+summary only (getIndex) → cheap scan
 *   Drills into content only for relevant entries (getEntry)
 *   Never loads all content at once
 */

import { db } from './db.ts'
import { getProfile } from './profile.ts'
import { ulid, iso } from './id.ts'

export type KBEntryType = 'entity' | 'concept' | 'source' | 'synthesis' | 'index'

export interface KBEntry {
    id: string
    profile_id: string
    entry_type: KBEntryType
    title: string
    slug: string
    content: string
    summary: string | null
    related_ids: string[]
    source_note_ids: string[]
    tags: string[]
    stale: number
    version: number
    updated_at: string
}

export interface KBIndexEntry {
    id: string
    slug: string
    title: string
    summary: string | null
    entry_type: KBEntryType
    stale: number
    updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the KB index — slug + summary only.
 * Token-efficient: agent uses this to find relevant entries without loading content.
 * Karpathy: "agent reads the index first, finds relevant pages, drills in."
 */
export async function getIndex(opts: {
    entry_type?: KBEntryType
    stale_only?: boolean
    limit?: number
} = {}): Promise<KBIndexEntry[]> {
    const profile = await getProfile()
    const args: unknown[] = [profile.id]
    let where = 'WHERE profile_id=? AND hidden=0'

    if (opts.entry_type) { where += ' AND entry_type=?'; args.push(opts.entry_type) }
    if (opts.stale_only) { where += ' AND stale=1' }

    args.push(opts.limit ?? 200)
    const { rows } = await db.execute({
        sql: `SELECT id,slug,title,summary,entry_type,stale,updated_at
           FROM agent_kb ${where}
           ORDER BY updated_at DESC LIMIT ?`,
        args,
    })
    return rows.map(parse_index) as KBIndexEntry[]
}

/**
 * Get a full KB entry by slug. Loads content.
 * Only call after finding the slug in getIndex().
 */
export async function getEntry(slug: string): Promise<KBEntry | null> {
    const profile = await getProfile()
    const { rows: [r] } = await db.execute({
        sql: `SELECT * FROM agent_kb WHERE profile_id=? AND slug=? AND hidden=0 LIMIT 1`,
        args: [profile.id, slug],
    })
    return r ? parse_entry(r) : null
}

/**
 * Get multiple entries by their IDs (for loading related_ids).
 * Returns slug+summary only — caller drills into content if needed.
 */
export async function getRelated(ids: string[]): Promise<KBIndexEntry[]> {
    if (!ids.length) return []
    const profile = await getProfile()
    const placeholders = ids.map(() => '?').join(',')
    const { rows } = await db.execute({
        sql: `SELECT id,slug,title,summary,entry_type,stale,updated_at
           FROM agent_kb WHERE profile_id=? AND id IN (${placeholders}) AND hidden=0`,
        args: [profile.id, ...ids],
    })
    return rows.map(parse_index) as KBIndexEntry[]
}

/**
 * Search KB by title/content match.
 * Simple full-text via LIKE — sufficient at KB scale (<500 entries).
 */
export async function searchKB(query: string, limit = 20): Promise<KBIndexEntry[]> {
    const profile = await getProfile()
    const term = `%${query}%`
    const { rows } = await db.execute({
        sql: `SELECT id,slug,title,summary,entry_type,stale,updated_at
           FROM agent_kb
           WHERE profile_id=? AND hidden=0
           AND (title LIKE ? OR summary LIKE ? OR content LIKE ?)
           ORDER BY updated_at DESC LIMIT ?`,
        args: [profile.id, term, term, term, limit],
    })
    return rows.map(parse_index) as KBIndexEntry[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Write (agent-only — users never write directly)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create or update a KB entry by slug (upsert).
 * Agent calls this when integrating a new source or updating an existing page.
 * Karpathy: "one new source can ripple through 10-15 existing pages."
 */
export async function upsertEntry(input: {
    entry_type: KBEntryType
    title: string
    slug: string
    content: string
    summary?: string
    related_ids?: string[]
    source_note_ids?: string[]
    tags?: string[]
}): Promise<string> {
    const profile = await getProfile()
    const existing = await getEntry(input.slug)
    const now = iso()

    if (existing) {
        // Update — increment version, clear stale flag
        await db.execute({
            sql: `UPDATE agent_kb SET
             title=?,content=?,summary=?,related_ids=?,
             source_note_ids=?,tags=?,stale=0,
             version=version+1,updated_at=?
             WHERE id=?`,
            args: [
                input.title, input.content,
                input.summary ?? null,
                JSON.stringify(input.related_ids ?? []),
                JSON.stringify(input.source_note_ids ?? []),
                JSON.stringify(input.tags ?? []),
                now, existing.id,
            ],
        })
        return existing.id
    }

    // Create new entry
    const id = ulid()
    await db.execute({
        sql: `INSERT INTO agent_kb
           (id,profile_id,entry_type,title,slug,content,summary,
            related_ids,source_note_ids,tags,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
            id, profile.id, input.entry_type,
            input.title, input.slug, input.content,
            input.summary ?? null,
            JSON.stringify(input.related_ids ?? []),
            JSON.stringify(input.source_note_ids ?? []),
            JSON.stringify(input.tags ?? []),
            now, now,
        ],
    })
    return id
}

/**
 * Mark an entry as stale when new info contradicts it.
 * Agent reviews stale entries and updates them.
 */
export async function markStale(slug: string): Promise<void> {
    const profile = await getProfile()
    await db.execute({
        sql: `UPDATE agent_kb SET stale=1,updated_at=? WHERE profile_id=? AND slug=?`,
        args: [iso(), profile.id, slug],
    })
}

/**
 * File back an agent answer as a KB synthesis entry.
 * Karpathy: "your questions and the agents' answers get filed back as new wiki pages."
 * Call this whenever the agent produces a useful analysis or answer.
 */
export async function fileAnswer(
    question: string,
    answer: string,
    related_slugs: string[] = []
): Promise<string> {
    const slug = 'qa-' + question.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
    const summary = answer.slice(0, 200).replace(/\n/g, ' ') + '…'

    const related_ids: string[] = []
    for (const s of related_slugs) {
        const e = await getEntry(s)
        if (e) related_ids.push(e.id)
    }

    return upsertEntry({
        entry_type: 'synthesis',
        title: question,
        slug,
        content: `# Q: ${question}\n\n${answer}`,
        summary,
        related_ids,
        tags: ['qa', 'synthesis'],
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Process inbox notes → KB (the core Karpathy integration loop)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get unprocessed notes from agent_notes (status='inbox').
 * Agent reads these, integrates them into KB, marks them 'done'.
 */
export async function getInboxNotes(limit = 10): Promise<Array<{
    id: string; content: string; tags: string[]
}>> {
    const profile = await getProfile()
    const { rows } = await db.execute({
        sql: `SELECT id,content,tags FROM agent_notes
           WHERE profile_id=? AND status='inbox' AND hidden=0
           ORDER BY created_at ASC LIMIT ?`,
        args: [profile.id, limit],
    })
    return rows.map(r => ({
        id: r.id as string,
        content: r.content as string,
        tags: safeJSON(r.tags, []) as string[],
    }))
}

/**
 * Mark a note as processed after integrating it into KB.
 */
export async function markNoteProcessed(
    noteId: string,
    agentResponse: string
): Promise<void> {
    const profile = await getProfile()
    await db.execute({
        sql: `UPDATE agent_notes SET status='done',agent_response=?,updated_at=?
           WHERE id=? AND profile_id=?`,
        args: [agentResponse, iso(), noteId, profile.id],
    })
}

/**
 * Get all stale entries for agent review.
 * Agent should update these when it has new info.
 */
export async function getStaleEntries(): Promise<KBIndexEntry[]> {
    return getIndex({ stale_only: true })
}

/**
 * Format the KB index as a compact context string for agents.
 * Token-efficient — only slug, type, and summary.
 */
export async function kbContext(limit = 50): Promise<string> {
    const index = await getIndex({ limit })
    if (!index.length) return '(Knowledge base is empty — add notes via agent_notes inbox)'

    const lines = index.map(e =>
        `[${e.entry_type}] ${e.slug}: ${e.summary ?? e.title}${e.stale ? ' ⚠️ stale' : ''}`
    )
    return `## Knowledge Base Index (${index.length} entries)\n${lines.join('\n')}`
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeJSON(v: unknown, fb: unknown) {
    try { return JSON.parse(v as string) } catch { return fb }
}

function parse_index(r: Record<string, unknown>): KBIndexEntry {
    return {
        id: r.id as string,
        slug: r.slug as string,
        title: r.title as string,
        summary: r.summary as string | null,
        entry_type: r.entry_type as KBEntryType,
        stale: r.stale as number,
        updated_at: r.updated_at as string,
    }
}

function parse_entry(r: Record<string, unknown>): KBEntry {
    return {
        id: r.id as string,
        profile_id: r.profile_id as string,
        entry_type: r.entry_type as KBEntryType,
        title: r.title as string,
        slug: r.slug as string,
        content: r.content as string,
        summary: r.summary as string | null,
        related_ids: safeJSON(r.related_ids, []) as string[],
        source_note_ids: safeJSON(r.source_note_ids, []) as string[],
        tags: safeJSON(r.tags, []) as string[],
        stale: r.stale as number,
        version: r.version as number,
        updated_at: r.updated_at as string,
    }
}