#!/usr/bin/env tsx
/**
 * scripts/generate-schema.ts
 *
 * Parses `businesskit-files/*.ts` → emits `lib/schema.ts`.
 *
 * What it does:
 *   1. Finds every `CREATE TABLE IF NOT EXISTS <name> ( ... )` in the schema files
 *   2. Parses columns: name, SQL type, NOT NULL, DEFAULT
 *   3. Detects enum values from the nearest `-- 'a'|'b'|'c'`-style comment
 *      on the same line or the next line
 *   4. Emits one `export interface <PascalName>` per table + a `TABLES` const
 *
 * Run:
 *   npx tsx scripts/generate-schema.ts
 *
 * The output is intentionally conservative — when in doubt, the column type
 * widens to `string | null`. Never hand-edit lib/schema.ts; regenerate.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..')
const SRC_DIR = join(REPO, 'businesskit-files')
const OUT = join(REPO, 'lib', 'schema.ts')

// ── Types ────────────────────────────────────────────────────────────────────

interface Column {
  name: string
  sqlType: string
  notNull: boolean
  hasDefault: boolean
  enumValues: string[]   // parsed from -- 'a'|'b'|'c' comments
}

interface Table {
  name: string
  columns: Column[]
  sourceFile: string
}

// ── Parser ───────────────────────────────────────────────────────────────────

function extractCreateTables(source: string, sourceFile: string): Table[] {
  const tables: Table[] = []
  // CREATE TABLE IF NOT EXISTS name ( ... ) — match everything up to the closing
  // paren that's followed by `,` or backtick (the template-string end).
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\s*\)/g

  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const name = m[1]
    const body = m[2]
    tables.push({ name, columns: parseColumns(body), sourceFile })
  }
  return tables
}

function parseColumns(body: string): Column[] {
  // Split on commas at depth 0 (SQLite col defs don't nest parens much,
  // but constraints like CHECK(...) might; fold them conservatively).
  const lines = splitTopLevelCommas(body)
  const cols: Column[] = []
  let pendingEnum: string[] = []

  for (let raw of lines) {
    raw = raw.trim()
    if (!raw) continue

    // Detect comment-only lines — they're enum hints for the PREVIOUS column
    const commentOnly = raw.match(/^--\s*(.+)/)
    if (commentOnly) {
      const hinted = parseEnumComment(commentOnly[1])
      if (hinted.length && cols.length) {
        const last = cols[cols.length - 1]
        if (!last.enumValues.length) last.enumValues = hinted
      }
      continue
    }

    // Skip table-level constraints (PRIMARY KEY (...), UNIQUE(...), FOREIGN KEY)
    const upper = raw.toUpperCase()
    if (/^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|CONSTRAINT)\s*[(\s]/.test(upper)) continue

    const col = parseColumnLine(raw)
    if (!col) continue

    // Same-line comment → enum values
    if (pendingEnum.length) {
      col.enumValues = pendingEnum
      pendingEnum = []
    }
    const inline = raw.match(/--\s*(.+)$/)
    if (inline) {
      const vals = parseEnumComment(inline[1])
      if (vals.length) col.enumValues = vals
    }

    cols.push(col)
  }
  return cols
}

function parseColumnLine(line: string): Column | null {
  // strip trailing comma and inline comment for type parsing
  const codeOnly = line.replace(/--.*$/, '').trim().replace(/,$/, '').trim()
  if (!codeOnly) return null

  // name [type] [constraints]
  const parts = codeOnly.split(/\s+/)
  if (parts.length < 2) return null
  const name = parts[0]
  if (!/^\w+$/.test(name)) return null

  const rest = parts.slice(1).join(' ')
  const sqlType = (rest.match(/^(TEXT|INTEGER|REAL|BLOB|NUMERIC)/i)?.[1] ?? 'TEXT').toUpperCase()
  const notNull = /\bNOT NULL\b/i.test(rest)
  const hasDefault = /\bDEFAULT\b/i.test(rest)

  return { name, sqlType, notNull, hasDefault, enumValues: [] }
}

function parseEnumComment(text: string): string[] {
  // Matches 'a'|'b'|'c'  (with anything around it)
  const matches = [...text.matchAll(/'([a-z0-9_-]+)'(?:\s*\|\s*'([a-z0-9_-]+)')+/gi)]
  for (const m of matches) {
    const raw = m[0]
    const vals = [...raw.matchAll(/'([a-z0-9_-]+)'/gi)].map(x => x[1])
    if (vals.length >= 2) return vals
  }
  return []
}

function splitTopLevelCommas(body: string): string[] {
  const out: string[] = []
  let buf = ''
  let depth = 0
  let inString = false
  for (const ch of body) {
    if (ch === "'" ) inString = !inString
    if (!inString) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue }
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf)
  return out
}

// ── Emitter ──────────────────────────────────────────────────────────────────

function sqlToTs(col: Column): string {
  // Enum literal union takes priority over SQL type
  if (col.enumValues.length) {
    const union = col.enumValues.map(v => `'${v}'`).join(' | ')
    return col.notNull || col.hasDefault ? union : `${union} | null`
  }

  let base: string
  switch (col.sqlType) {
    case 'INTEGER': base = 'number'; break
    case 'REAL':    base = 'number'; break
    case 'TEXT':    base = 'string'; break
    case 'BLOB':    base = 'Uint8Array'; break
    case 'NUMERIC': base = 'number'; break
    default:        base = 'string'
  }
  // NOT NULL or has DEFAULT → reads are always defined
  return col.notNull || col.hasDefault ? base : `${base} | null`
}

function pascalCase(snake: string): string {
  return snake.split('_').map(p => p ? p[0].toUpperCase() + p.slice(1) : '').join('')
}

function emit(tables: Table[]): string {
  const header = `// lib/schema.ts
// AUTO-GENERATED by scripts/generate-schema.ts — DO NOT EDIT.
// Source: businesskit-files/*.ts (copies of app-side schema).
// Regenerate: npm run schema:gen
//
// What this gives you:
//   - One \`interface <PascalTable>\` per UserDB table
//   - Enum literal unions for columns with \`-- 'a'|'b'|'c'\` comment hints
//   - \`TABLES\` const for typo-safe table references
//
// Rows returned by libSQL's Client are \`Record<string, Value>\` — cast via
// \`as unknown as <Interface>\` at the call site after SELECT.
`

  const groups = new Map<string, Table[]>()
  for (const t of tables) {
    const key = t.sourceFile
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  const body = [...groups.entries()]
    .map(([file, ts]) => {
      const interfaces = ts.map(t => {
        const fields = t.columns
          .map(c => `  ${c.name}: ${sqlToTs(c)}`)
          .join('\n')
        return `export interface ${pascalCase(t.name)} {\n${fields}\n}`
      }).join('\n\n')
      return `// ── ${file} ${'─'.repeat(Math.max(0, 60 - file.length))}\n\n${interfaces}`
    })
    .join('\n\n')

  const tableNames = tables.map(t => `  ${t.name}: '${t.name}' as const,`).join('\n')
  const constBlock = `\nexport const TABLES = {\n${tableNames}\n}\n\nexport type TableName = keyof typeof TABLES\n`

  return `${header}\n${body}\n${constBlock}`
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const files = readdirSync(SRC_DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.md')).sort()
  if (!files.length) {
    console.error(`No schema files found in ${SRC_DIR}`)
    process.exit(1)
  }

  const all: Table[] = []
  for (const f of files) {
    const src = readFileSync(join(SRC_DIR, f), 'utf8')
    const tables = extractCreateTables(src, f)
    all.push(...tables)
    console.log(`  ${f}: ${tables.length} tables`)
  }

  const out = emit(all)
  writeFileSync(OUT, out, 'utf8')
  console.log(`\nWrote ${OUT} — ${all.length} tables, ${all.reduce((a, t) => a + t.columns.length, 0)} columns.`)
}

main()
