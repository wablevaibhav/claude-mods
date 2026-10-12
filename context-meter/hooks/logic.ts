import type { Level } from '../types'

export const WARN_AT = 70
export const HIGH_AT = 90

const RANK: Record<Level, number> = { ok: 0, warn: 1, high: 2 }

export const levelFor = (pct: number): Level => (pct >= HIGH_AT ? 'high' : pct >= WARN_AT ? 'warn' : 'ok')

/** The level just entered while climbing, or null when the level did not rise. */
export const risen = (prev: Level, pct: number): Level | null => {
  const now = levelFor(pct)
  return RANK[now] > RANK[prev] ? now : null
}

export const bar = (pct: number, width = 24): string => {
  const filled = Math.max(0, Math.min(width, Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

export const advice = (level: Level): string =>
  level === 'high'
    ? 'Almost full: run /compact now, or start a fresh session.'
    : level === 'warn'
      ? 'Getting full: consider /compact soon.'
      : ''
