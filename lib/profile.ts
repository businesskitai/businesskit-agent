import { db as _defaultDB } from './db.ts'
import type { Client } from '@libsql/client'

export interface Profile {
  id: string; user_id: string; slug: string; title: string
  bio: string | null; tagline: string | null; avatar_url: string | null
  social_links: Array<{ platform: string; url: string }>
  enabled_categories: string[]
}

export interface Settings {
  site_title: string | null; logo_url: string | null
  theme: Record<string, unknown>
}

/**
 * Credentials — read-only for agents. Never log these values.
 *
 * Columns are added to the `credentials` table via ALTER TABLE migrations
 * in provision.ts MIGRATIONS_SQL. New columns = new entries there.
 */
export interface Credentials {
  // ── Email ──────────────────────────────────────────────────────────────────
  resend_api_key: string | null
  ses_access_key: string | null
  ses_secret_key: string | null
  ses_region: string | null
  ses_from_email: string | null

  // ── LLMs ───────────────────────────────────────────────────────────────────
  anthropic_api_key: string | null
  openai_api_key: string | null
  gemini_api_key: string | null

  // ── X / Twitter ────────────────────────────────────────────────────────────
  twitter_api_key: string | null
  twitter_api_secret: string | null
  twitter_access_token: string | null
  twitter_access_secret: string | null

  // ── LinkedIn ───────────────────────────────────────────────────────────────
  linkedin_access_token: string | null
  linkedin_person_urn: string | null       // urn:li:person:{id}

  // ── Facebook ───────────────────────────────────────────────────────────────
  facebook_page_id: string | null
  facebook_page_token: string | null

  // ── Instagram (Facebook Graph API) ─────────────────────────────────────────
  instagram_account_id: string | null
  instagram_access_token: string | null

  // ── Automation (optional) ──────────────────────────────────────────────────
  n8n_webhook_url: string | null
}

export interface BrandContext {
  profile: Profile; settings: Settings; credentials: Credentials
}

let _ctx: BrandContext | null = null

export async function getBrandContext(client?: Client): Promise<BrandContext> {
  if (!client && _ctx) return _ctx

  const db = client ?? _defaultDB
  const [[p], [s], [c]] = await Promise.all([
    db.execute('SELECT * FROM profiles LIMIT 1').then(r => r.rows),
    db.execute('SELECT * FROM settings LIMIT 1').then(r => r.rows),
    db.execute('SELECT * FROM credentials LIMIT 1').then(r => r.rows),
  ])

  if (!p) throw new Error('No profile found — is your Turso DB provisioned?')

  const parse = (v: unknown, fb: unknown) => { try { return JSON.parse(v as string) } catch { return fb } }
  const str = (v: unknown) => (v as string | null) ?? null

  const profile: Profile = {
    id: p.id as string, user_id: p.user_id as string,
    slug: p.slug as string, title: p.title as string,
    bio: str(p.bio), tagline: str(p.tagline), avatar_url: str(p.avatar_url),
    social_links: parse(p.social_links, []),
    enabled_categories: parse(p.enabled_categories, []),
  }

  const settings: Settings = {
    site_title: str(s?.site_title ?? p.site_title),
    logo_url: str(s?.logo_url),
    theme: parse(s?.theme, {}),
  }

  const credentials: Credentials = {
    resend_api_key:          str(c?.resend_api_key),
    ses_access_key:          str(c?.ses_access_key),
    ses_secret_key:          str(c?.ses_secret_key),
    ses_region:              str(c?.ses_region),
    ses_from_email:          str(c?.ses_from_email),
    anthropic_api_key:       str(c?.anthropic_api_key),
    openai_api_key:          str(c?.openai_api_key),
    gemini_api_key:          str(c?.gemini_api_key),
    twitter_api_key:         str(c?.twitter_api_key),
    twitter_api_secret:      str(c?.twitter_api_secret),
    twitter_access_token:    str(c?.twitter_access_token),
    twitter_access_secret:   str(c?.twitter_access_secret),
    linkedin_access_token:   str(c?.linkedin_access_token),
    linkedin_person_urn:     str(c?.linkedin_person_urn),
    facebook_page_id:        str(c?.facebook_page_id),
    facebook_page_token:     str(c?.facebook_page_token),
    instagram_account_id:    str(c?.instagram_account_id),
    instagram_access_token:  str(c?.instagram_access_token),
    n8n_webhook_url:         str(c?.n8n_webhook_url),
  }

  const result = { profile, settings, credentials }
  if (!client) _ctx = result
  return result
}

export const getProfile = async (client?: Client) => (await getBrandContext(client)).profile