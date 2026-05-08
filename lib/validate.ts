// lib/validate.ts
// Guard numeric fields before DB writes.
// DB triggers will reject out-of-bounds — catch early for clearer errors.

export function leadScore(n: number): number {
    if (!Number.isFinite(n) || n < 0 || n > 100)
        throw new Error(`lead_score must be 0–100, got ${n}`)
    return Math.round(n)
}

export function probability(n: number): number {
    if (!Number.isFinite(n) || n < 0 || n > 100)
        throw new Error(`probability must be 0–100, got ${n}`)
    return Math.round(n)
}

export function cents(n: number): number {
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n))
        throw new Error(`cents must be non-negative integer, got ${n}`)
    return n
}

export function hotScore(n: number): number {
    if (!Number.isFinite(n) || n < 0)
        throw new Error(`hot_score must be >= 0, got ${n}`)
    return n
}

export function slug(s: string): string {
    if (!s || s.length > 200)
        throw new Error(`slug must be 1–200 chars, got "${s}"`)
    return s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
}