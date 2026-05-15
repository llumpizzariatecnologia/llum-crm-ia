import 'server-only'

import { createClient } from '@supabase/supabase-js'

export type AvailabilityStatus = 'available' | 'busy' | 'full' | 'blocked' | 'unknown'

export type AvailabilityResult = {
  date: string
  partySize: number | null
  status: AvailabilityStatus
  capacityLeft: number | null
  capacityMax: number | null
  booked: number | null
  message: string
  /** Suggested alternative dates near the requested one when status is full/blocked. */
  alternatives: Array<{ date: string; status: AvailabilityStatus; capacityLeft: number }>
}

function getReservasClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  // The reservation system lives in a separate Postgres schema in the same project.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'reservas' },
  })
}

type DailyCapacityRow = { date: string; max_people: number | null; is_blocked: boolean | null }
type ReservationRow = { date: string; total_people: number; payment_status: string }
type ConfigRow = { key: string; value: string }
type WeekdayRuleRow = { weekday: number; is_blocked: boolean }

function statusFor(booked: number, max: number, blocked: boolean, partySize: number | null): AvailabilityStatus {
  if (blocked) return 'blocked'
  if (max <= 0) return 'unknown'
  const left = max - booked
  if (partySize !== null && left < partySize) return 'full'
  const ratio = booked / max
  if (ratio >= 1) return 'full'
  if (ratio >= 0.7) return 'busy'
  return 'available'
}

function parseDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const d = new Date(`${date}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export async function checkAvailability(
  date: string,
  partySize: number | null
): Promise<AvailabilityResult> {
  const target = parseDate(date)
  if (!target) {
    return {
      date,
      partySize,
      status: 'unknown',
      capacityLeft: null,
      capacityMax: null,
      booked: null,
      message: 'Data inválida.',
      alternatives: [],
    }
  }

  const supabase = getReservasClient()
  if (!supabase) {
    return {
      date,
      partySize,
      status: 'unknown',
      capacityLeft: null,
      capacityMax: null,
      booked: null,
      message: 'Sistema de reservas indisponível.',
      alternatives: [],
    }
  }

  // Look ±3 days so we can also surface alternatives if the requested date is closed.
  const startDate = new Date(target)
  startDate.setUTCDate(startDate.getUTCDate() - 3)
  const endDate = new Date(target)
  endDate.setUTCDate(endDate.getUTCDate() + 3)
  const start = formatDate(startDate)
  const end = formatDate(endDate)

  const [capsRes, resRes, cfgRes, weekRes] = await Promise.all([
    supabase
      .from('daily_capacity')
      .select('date, max_people, is_blocked')
      .gte('date', start)
      .lte('date', end),
    supabase
      .from('reservations')
      .select('date, total_people, payment_status')
      .gte('date', start)
      .lte('date', end)
      .in('payment_status', ['paid', 'pending']),
    supabase.from('pricing_config').select('key, value').eq('key', 'default_max_capacity'),
    supabase.from('weekday_rules').select('weekday, is_blocked'),
  ])

  const caps = (capsRes.data as DailyCapacityRow[] | null) || []
  const reservations = (resRes.data as ReservationRow[] | null) || []
  const cfgRows = (cfgRes.data as ConfigRow[] | null) || []
  const weekRules = (weekRes.data as WeekdayRuleRow[] | null) || []

  const defaultMax = Number(cfgRows[0]?.value ?? 430)
  const weekBlocked = new Set<number>(weekRules.filter((w) => w.is_blocked).map((w) => w.weekday))

  const bookedByDate = new Map<string, number>()
  for (const r of reservations) {
    bookedByDate.set(r.date, (bookedByDate.get(r.date) || 0) + (r.total_people || 0))
  }

  const computeForDate = (d: Date) => {
    const key = formatDate(d)
    const cap = caps.find((c) => c.date === key)
    const max = cap?.max_people ?? defaultMax
    const blocked = !!cap?.is_blocked || weekBlocked.has(d.getUTCDay())
    const booked = bookedByDate.get(key) || 0
    const left = Math.max(0, max - booked)
    return { key, max, blocked, booked, left, status: statusFor(booked, max, blocked, partySize) }
  }

  const targetResult = computeForDate(target)

  // Gather alternatives only when the target is unavailable.
  const alternatives: AvailabilityResult['alternatives'] = []
  if (targetResult.status === 'full' || targetResult.status === 'blocked') {
    for (let offset = 1; offset <= 3; offset += 1) {
      for (const sign of [-1, 1]) {
        const d = new Date(target)
        d.setUTCDate(d.getUTCDate() + sign * offset)
        const alt = computeForDate(d)
        if (alt.status === 'available' || alt.status === 'busy') {
          alternatives.push({ date: alt.key, status: alt.status, capacityLeft: alt.left })
        }
      }
    }
  }

  const message = (() => {
    switch (targetResult.status) {
      case 'available':
        return `Disponível em ${date} (${targetResult.left} lugares livres).`
      case 'busy':
        return `Disponível mas com alta procura em ${date} (${targetResult.left} lugares livres).`
      case 'full':
        return `Lotado em ${date} (${targetResult.booked}/${targetResult.max} ocupados).`
      case 'blocked':
        return `Casa fechada em ${date}.`
      default:
        return `Sem informações de capacidade para ${date}.`
    }
  })()

  return {
    date,
    partySize,
    status: targetResult.status,
    capacityLeft: targetResult.left,
    capacityMax: targetResult.max,
    booked: targetResult.booked,
    message,
    alternatives: alternatives.slice(0, 4),
  }
}
