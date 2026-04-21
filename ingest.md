# /ingest — Process Inbox Into Knowledge Base

Process everything in `agent_notes` with `status='inbox'` into the knowledge base.
This is the magic moment: raw captures → structured, cross-linked wiki pages.

Run this periodically — not every session. Daily or weekly depending on how much you capture.

---

## What it does

1. Fetch unprocessed notes from `agent_notes` (status='inbox')
2. For each note, decide: new KB entry OR update existing one
3. Cross-reference with existing KB index (slug + summary scan — no full content load)
4. Write or update KB entry with cross-links
5. If new note contradicts existing entry → mark existing stale first
6. File the note as processed

---

## Steps

```ts
import { getInboxNotes, getIndex, searchKB, getEntry,
         upsertEntry, markStale, markNoteProcessed } from './lib/kb.ts'

// 1. Load index — cheap, summaries only
const index = await getIndex({ limit: 200 })
console.log(`KB has ${index.length} entries`)

// 2. Get inbox
const notes = await getInboxNotes(20)
if (!notes.length) {
  console.log('Inbox empty — nothing to process')
  return
}
console.log(`Processing ${notes.length} notes...`)

// 3. For each note:
for (const note of notes) {
  // a. Search for related existing entries
  const term = extractKeyTerm(note.content)  // first meaningful phrase
  const hits  = await searchKB(term, 5)

  // b. Decide: update existing or create new?
  if (hits.length && isSameConcept(note.content, hits[0])) {
    // Load the full entry only for the one we're updating
    const existing = await getEntry(hits[0].slug)
    // Check for contradiction
    if (contradicts(note.content, existing?.content)) {
      await markStale(hits[0].slug)
    }
    // Integrate new info into existing entry
    await upsertEntry({
      ...existing,
      content: integrate(existing.content, note.content),
      summary: refreshSummary(existing.content, note.content),
      source_note_ids: [...existing.source_note_ids, note.id],
      version: existing.version + 1,
    })
    await markNoteProcessed(note.id, `Integrated into: ${hits[0].slug}`)
  } else {
    // New entity or concept
    const slug = generateSlug(note.content)
    await upsertEntry({
      entry_type: classifyNote(note.content), // entity/concept/source/synthesis
      title:      extractTitle(note.content),
      slug,
      content:    compileWikiPage(note.content),
      summary:    oneSentenceSummary(note.content),
      source_note_ids: [note.id],
      tags:       extractTags(note.content),
    })
    await markNoteProcessed(note.id, `Compiled into new KB entry: ${slug}`)
  }
}
```

## After each ingest

- Log to `agent_memory`: how many notes processed, how many new entries, how many updated
- Run stale check: show any entries marked stale that need updating
- Push summary to `agent_reports` if batch was large (10+ notes)

## Stale handling

After processing inbox, check for stale entries:

```ts
const stale = await getStaleEntries()
if (stale.length) {
  console.log(`${stale.length} entries need updating:`)
  stale.forEach(e => console.log(`  - ${e.slug}: ${e.summary}`))
  // Offer to update them or leave for next /ingest run
}
```

## When to run /ingest

- After a batch of notes have been added to inbox
- Before a deep research session (so KB is fresh)
- Weekly at minimum if you capture regularly
- Run by Scheduler agent on a weekly cron

## One new source can ripple through 10-15 pages

That's the Karpathy insight. When you ingest a new article about email deliverability,
the agent updates not just the deliverability entry — it checks every entry that
references it (SES setup, ConvertKit comparison, newsletter strategy) and updates
the cross-links. That's what makes the KB compound over time.
