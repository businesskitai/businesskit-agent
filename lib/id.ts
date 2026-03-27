const ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function ulid(): string {
  let t = Date.now(), time = ''
  for (let i = 9; i >= 0; i--) { time = ENC[t % 32] + time; t = Math.floor(t / 32) }
  const rand = new Uint8Array(10)
  crypto.getRandomValues(rand)
  return time + Array.from(rand, b => ENC[b % 32]).join('')
}

/** Unix epoch seconds — for INTEGER timestamp columns */
export const now = () => Math.floor(Date.now() / 1000)

/** ISO-8601 string — for TEXT timestamp columns (posts, jobs, forms, docs) */
export const iso = () => new Date().toISOString().slice(0, 19) + 'Z'
