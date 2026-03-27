/**
 * progress.ts — session memory across conversations
 *
 * Agents append to progress.md after significant actions.
 * Next session reads it first — solving the cold-start problem.
 *
 * This is agent working memory, not business data.
 * Stored locally in repo root. Never committed (in .gitignore).
 * Re-created fresh if deleted.
 */

import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs'

const FILE = './progress.md'

/** Append a single action line to progress.md */
export function logAction(action: string): void {
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const line = `- ${ts}: ${action}\n`
    ensureFile()
    appendFileSync(FILE, line, 'utf8')
}

/** Update the "open items" section — replaces it entirely */
export function setOpenItems(items: string[]): void {
    ensureFile()
    const content = readFileSync(FILE, 'utf8')
    const header = '## Open items\n'
    const nextHeader = '\n## '
    const start = content.indexOf(header)

    if (start === -1) {
        appendFileSync(FILE, `\n${header}${items.map(i => `- ${i}`).join('\n')}\n`)
        return
    }

    const end = content.indexOf(nextHeader, start + header.length)
    const before = content.slice(0, start + header.length)
    const after = end === -1 ? '' : content.slice(end)
    const newItems = items.map(i => `- ${i}`).join('\n') + '\n'
    writeFileSync(FILE, before + newItems + after, 'utf8')
}

/** Update the briefing summary block */
export function setBriefingSummary(summary: {
    revenue_30d: string
    revenue_trend: string
    top_product: string
    total_clicks: number
}): void {
    const block = `
## Last briefing summary (CEO)
- Revenue last 30d: ${summary.revenue_30d} (${summary.revenue_trend})
- Top product: "${summary.top_product}"
- Traffic: ${summary.total_clicks.toLocaleString()} clicks
`
    ensureFile()
    const content = readFileSync(FILE, 'utf8')
    const header = '## Last briefing summary'
    const start = content.indexOf(header)

    if (start === -1) {
        appendFileSync(FILE, block, 'utf8')
    } else {
        const next = content.indexOf('\n## ', start + header.length)
        const after = next === -1 ? '' : content.slice(next)
        writeFileSync(FILE, content.slice(0, start) + block.trimStart() + after, 'utf8')
    }
}

/** Read the full progress file — agents call this at session start */
export function readProgress(): string {
    if (!existsSync(FILE)) return '(No progress history yet. This is the first session.)'
    return readFileSync(FILE, 'utf8')
}

function ensureFile(): void {
    if (existsSync(FILE)) return
    writeFileSync(FILE, `# BusinessKit Agent Progress\n\n## Recent actions\n`, 'utf8')
}