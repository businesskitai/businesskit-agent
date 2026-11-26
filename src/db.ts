// src/db.ts
// Direct Turso / LibSQL client connection for BusinessKit MCP Server

import { createClient, type Client } from '@libsql/client';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Load environment variables from .env file
dotenv.config();

let clientInstance: Client | null = null;
let currentProfileId: string = process.env.PROFILE_ID || process.env.BK_PROFILE_ID || '';
let profileResolved = false;

export function getTursoConfig(): { url: string; token: string; readOnly: boolean } | null {
  const url =
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_URL ||
    process.env.BK_TURSO_URL ||
    process.env.DATABASE_URL ||
    '';

  const token =
    process.env.TURSO_AUTH_TOKEN ||
    process.env.TURSO_TOKEN ||
    process.env.TURSO_READ_ONLY_TOKEN ||
    process.env.TURSO_RO_TOKEN ||
    process.env.BK_TURSO_TOKEN ||
    process.env.AUTH_TOKEN ||
    '';

  const isReadOnly = Boolean(
    process.env.TURSO_READ_ONLY_TOKEN ||
      process.env.TURSO_RO_TOKEN ||
      process.env.READ_ONLY === 'true' ||
      process.env.TURSO_READONLY === 'true'
  );

  const trimmedUrl = url.trim();
  const trimmedToken = token.trim();

  // Guard against missing or placeholder values
  if (
    !trimmedUrl ||
    !trimmedToken ||
    trimmedUrl.includes('your-db') ||
    trimmedUrl.includes('your-database') ||
    trimmedToken.includes('your-token') ||
    trimmedToken.includes('your-turso-auth-token')
  ) {
    return null;
  }

  // Normalize URL to https or libsql
  let normalizedUrl = trimmedUrl;
  if (normalizedUrl.startsWith('turso://')) {
    normalizedUrl = 'https://' + normalizedUrl.slice(8);
  }

  return { url: normalizedUrl, token: trimmedToken, readOnly: isReadOnly };
}

export function isDbConfigured(): boolean {
  return getTursoConfig() !== null;
}

export function isDbReadOnly(): boolean {
  const cfg = getTursoConfig();
  return cfg ? cfg.readOnly : false;
}

export function getDbClient(): Client {
  if (clientInstance) {
    return clientInstance;
  }

  const config = getTursoConfig();
  if (!config) {
    throw new Error(
      'Turso database credentials not configured. Please define TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your .env file or environment variables.'
    );
  }

  clientInstance = createClient({
    url: config.url,
    authToken: config.token,
  });

  return clientInstance;
}

export async function getActiveProfileId(): Promise<string> {
  if (currentProfileId) {
    return currentProfileId;
  }

  if (profileResolved || !isDbConfigured()) {
    currentProfileId = 'default';
    return currentProfileId;
  }

  try {
    profileResolved = true;
    const client = getDbClient();
    // 1. Try querying profiles table
    const result = await client.execute('SELECT id FROM profiles LIMIT 1');
    if (result.rows.length > 0 && result.rows[0].id) {
      currentProfileId = String(result.rows[0].id);
      return currentProfileId;
    }

    // 2. Fallback: try shop_items profile_id
    const shopResult = await client.execute('SELECT profile_id FROM shop_items LIMIT 1');
    if (shopResult.rows.length > 0 && shopResult.rows[0].profile_id) {
      currentProfileId = String(shopResult.rows[0].profile_id);
      return currentProfileId;
    }
  } catch (err: any) {
    console.error('[DB] Profile lookup error (defaulting to "default"):', err?.message || err);
  }

  currentProfileId = 'default';
  return currentProfileId;
}

export function setActiveProfileId(id: string): void {
  currentProfileId = id.trim();
  profileResolved = true;
}

export async function query<T = any>(sql: string, args: any[] = []): Promise<T[]> {
  const client = getDbClient();
  const res = await client.execute({ sql, args });
  return (res.rows as unknown) as T[];
}

export async function execute(
  sql: string,
  args: any[] = []
): Promise<{ rowsAffected: number; lastInsertRowid?: bigint }> {
  if (isDbReadOnly()) {
    throw new Error(
      'Database is connected in read-only mode (read-only token). Write operations (INSERT, UPDATE, DELETE) are not permitted.'
    );
  }
  const client = getDbClient();
  const res = await client.execute({ sql, args });
  return {
    rowsAffected: res.rowsAffected,
    lastInsertRowid: res.lastInsertRowid,
  };
}

export function generateId(prefix: string): string {
  const cleanPrefix = prefix.endsWith('_') ? prefix : `${prefix}_`;
  return `${cleanPrefix}${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateSku(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let sku = '';
  for (let i = 0; i < 10; i++) {
    sku += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return sku;
}
