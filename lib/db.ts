import { createClient, type Client } from '@libsql/client/web'

function createDB(): Client {
  const url   = process.env.TURSO_URL
  const token = process.env.TURSO_TOKEN
  if (!url || !token) {
    throw new Error(
      '\nMissing TURSO_URL or TURSO_TOKEN\n' +
      'Copy .env.example → .env and paste your credentials.\n' +
      'Find them: BusinessKit dashboard → Settings → Credentials\n'
    )
  }
  return createClient({ url, authToken: token })
}

export const db = createDB()
