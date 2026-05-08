// lib/db.ts
// Turso DB client — retry on SQLITE_BUSY, optional read replica.
// Phase 1: .env credentials. Phase 2: swap via db.adapter.ts (one line).

import { createClient, type Client } from '@libsql/client/web'

// Permissive statement type — the libSQL `InStatement` is strict about arg
// element types (`InValue`), but the agent layer uses `unknown[]` everywhere
// since we bind ids, ISO strings, integers, JSON blobs, and nulls freely.
// The runtime client accepts all of these; we forward them as `any`.
export type Stmt = { sql: string; args: unknown[] } | string

let _writer: Client | null = null
let _reader: Client | null = null

function writer(): Client {
  if (!_writer) {
    const url = process.env.TURSO_URL || ''
    const token = process.env.TURSO_TOKEN || ''
    if (!url || !token) throw new Error('TURSO_URL and TURSO_TOKEN required. Run: cp .env.example .env')
    _writer = createClient({ url, authToken: token })
  }
  return _writer
}

function reader(): Client {
  if (!_reader) {
    const url = process.env.TURSO_REPLICA_URL || process.env.TURSO_URL || ''
    const token = process.env.TURSO_TOKEN || ''
    _reader = createClient({ url, authToken: token })
  }
  return _reader
}

// P0-3: SQLITE_BUSY retry — exponential backoff + jitter
export async function withRetry<T>(op: () => Promise<T>, maxTries = 5): Promise<T> {
  for (let i = 0; i < maxTries; i++) {
    try { return await op() }
    catch (e: any) {
      const retryable = /SQLITE_BUSY|database is locked|SQLITE_LOCKED/i.test(e?.message ?? '')
      if (!retryable || i === maxTries - 1) throw e
      await new Promise(r => setTimeout(r, 50 * 2 ** i + Math.random() * 50))
    }
  }
  throw new Error('unreachable')
}

export const db = {
  // Reads — replica if TURSO_REPLICA_URL set, otherwise primary
  execute: (q: Stmt) =>
    withRetry(() => reader().execute(q as any)),

  // Writes — always primary
  write: (q: Stmt) =>
    withRetry(() => writer().execute(q as any)),

  // P0-2: Atomic multi-statement batch — back-compat alias `batch` too
  txn: (stmts: Stmt[]) =>
    withRetry(() => writer().batch(stmts as any, 'write')),

  batch: (stmts: Stmt[]) =>
    withRetry(() => writer().batch(stmts as any, 'write')),
}