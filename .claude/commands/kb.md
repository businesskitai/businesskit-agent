# /kb — Knowledge Base (Karpathy LLM Wiki)

Persistent, compounding knowledge base. Agents maintain it. Users only read it.

## How it works

```
agent_notes (inbox)  →  agent reads  →  agent_kb (wiki)
user drops anything      integrates        compiled knowledge
```

One new note can update 10-15 existing KB pages.
Your questions + answers get filed back as new entries — knowledge compounds.

## Session start

```ts
import { kbContext } from './lib/kb.ts'
const index = await kbContext(50)
// Shows: [type] slug: summary — token-efficient, no full content loaded
```

## Process inbox notes (periodic — not every session)

```ts
import { getInboxNotes, upsertEntry, markNoteProcessed } from './lib/kb.ts'

const notes = await getInboxNotes(10)
for (const note of notes) {
  // Read note.content
  // Decide: new KB entry OR update existing one
  // Check index first: does a related entry exist?
  const existing = await searchKB(extractKeyTerm(note.content))

  if (existing.length) {
    // Update existing entry — integrate new info
    // If new info contradicts: markStale(existing[0].slug) first
    await upsertEntry({ slug: existing[0].slug, ... })
  } else {
    // Create new entity/concept/source entry
    await upsertEntry({ entry_type: 'concept', slug, title, content, summary })
  }

  await markNoteProcessed(note.id, 'Integrated into KB as: [slug]')
}
```

## Answer a question + file it back

```ts
import { searchKB, getEntry, fileAnswer } from './lib/kb.ts'

// 1. Read index — find relevant entries
const index = await kbContext()

// 2. Search for relevant pages
const hits = await searchKB('email deliverability')

// 3. Load content only for relevant ones
const entry = await getEntry(hits[0].slug)

// 4. Synthesize answer using entry.content

// 5. File answer back as KB entry (Karpathy: explorations compound)
await fileAnswer(
  'What affects email deliverability?',
  answerText,
  ['email-deliverability', 'ses-setup']
)
```

## Mark stale when info contradicts

```ts
import { markStale } from './lib/kb.ts'

// New note says ConvertKit raised prices → mark old pricing entry stale
await markStale('convertkit-pricing')
// Agent will update it next time it processes that entry
```

## Review stale entries

```ts
import { getStaleEntries } from './lib/kb.ts'
const stale = await getStaleEntries()
// stale entries show ⚠️ in kbContext output
// Process: load note → update entry → version increments, stale clears
```

## Entry types

| type | What | Example slug |
|---|---|---|
| `entity` | Person, product, tool, company | `convertkit` `resend-api` `sarah-chen` |
| `concept` | Strategy, pattern, framework | `email-deliverability` `icp-match` |
| `source` | Processed note/article summary | `src-article-2026-04` |
| `synthesis` | Agent cross-reference or analysis | `qa-best-email-tool` |
| `index` | Auto-maintained index page | `index-email-marketing` |

## Rules

- Agents maintain the KB — users never write directly
- Load index first (cheap) → drill into content only when needed
- summary ≤ 2 sentences — what the page is about in plain terms
- related_ids = links to other KB entries (cross-references)
- source_note_ids = which agent_notes this was compiled from
