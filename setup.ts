/**
 * setup.ts — run once after cloning to verify your Turso connection.
 * Usage: npm run setup
 */

import 'dotenv/config'
import { db }             from './lib/db.ts'
import { getBrandContext } from './lib/profile.ts'

console.log('\n🔌 Checking Turso connection...')

try {
  await db.execute('SELECT 1')
  console.log('✓ Turso connected\n')
} catch (e) {
  console.error('✗ Turso connection failed:', e)
  console.error('\nCheck TURSO_URL and TURSO_TOKEN in your .env file.')
  process.exit(1)
}

console.log('👤 Loading profile...')
try {
  const { profile, settings } = await getBrandContext()
  console.log(`✓ Profile: ${profile.title} (@${profile.slug})`)
  console.log(`✓ Site title: ${settings.site_title ?? profile.title}`)
  console.log(`✓ Profile ID: ${profile.id}`)
} catch (e) {
  console.error('✗ Could not load profile:', e)
  console.error('\nIs your Turso DB provisioned? Complete BusinessKit onboarding first.')
  process.exit(1)
}

console.log('\n✅ All good. Open this folder in Claude Code and type /aria to start.\n')
