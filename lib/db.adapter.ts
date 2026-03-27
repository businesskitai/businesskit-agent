/**
 * db.adapter.ts — Universal DB adapter
 *
 * This is the ONE file that differs between Phase 1 and Phase 2.
 * Everything else (agents, lib/) is identical in both environments.
 *
 * Phase 1 (local / CLI / Claude Code):
 *   db is created from process.env in lib/db.ts
 *
 * Phase 2 (Cloudflare Worker / Qwik routeAction$):
 *   db is injected from event.sharedMap — already decrypted + connected
 *   by plugin.ts. Import createAgentDB() instead of db directly.
 */

import type { Client } from '@libsql/client'

/**
 * Phase 2: extract the raw libSQL client from Qwik's sharedMap.
 * sharedMap["userClient"] is set by plugin.ts on every request.
 */
export function createAgentDB(event: { sharedMap: Map<string, unknown> }): Client {
  const client = event.sharedMap.get('userClient') as Client | undefined
  if (!client) {
    throw new Error(
      'No userClient in sharedMap. ' +
      'Ensure plugin.ts has run and the user has a connected Turso DB.'
    )
  }
  return client
}
