import 'server-only'

import type { AvailabilityResult, AvailabilityStatus } from '@/lib/reservations'
import { getTodayBrazilDate } from '@/lib/reservations'

// Default capacity matches the LLUM production house cap. Override via env if
// future Saturdays or special dates ever differ.
const CAPACITY_WEEKDAY = Number(process.env.AVAILABILITY_CAPACITY_WEEKDAY ?? '430')
const CAPACITY_SATURDAY = Number(process.env.AVAILABILITY_CAPACITY_SATURDAY ?? CAPACITY_WEEKDAY)
const CACHE_TTL_MS = Number(process.env.AVAILABILITY_CACHE_TTL_SECONDS ?? '120') * 1000

type CacheEntry = {
  fetchedAt: number
  bookedByDate: Map<string, number>
}
let cache: CacheEntry | null = null

function parseCsv(csv: string): string[][] {
  // RFC 4180-style parser: handles quoted fields with embedded commas and newlines.
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < csv.length; i += 1) {
    const c = csv[i]
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
        continue
      }
      field += c
      continue
    }
    if (c === '"') {
      inQuotes = true
      continue
    }
    if (c === ',') {
      current.push(field)
      field = ''
      continue
    }
    if (c === '\r') continue
    if (c === '\n') {
      current.push(field)
      field = ''
      if (current.some((cell) => cell.length > 0)) rows.push(current)
      current = []
      continue
    }
    field += c
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field)
    if (current.some((cell) => cell.length > 0)) rows.push(current)
  }
  return rows
}

function parseSheetDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = m[2].padStart(2, '0')
  return `${m[3]}-${month}-${day}`
}

function formatIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function capacityFor(dateIso: string): number {
  const d = new Date(`${dateIso}T12:00:00`)
  return d.getUTCDay() === 6 ? CAPACITY_SATURDAY : CAPACITY_WEEKDAY
}

function statusFor(booked: number, max: number, partySize: number | null): AvailabilityStatus {
  if (max <= 0) return 'unknown'
  const left = max - booked
  if (partySize !== null && left < partySize) return 'full'
  const ratio = booked / max
  if (ratio >= 1) return 'full'
  if (ratio >= 0.7) return 'busy'
  return 'available'
}

async function fetchAndParse(sheetId: string): Promise<Map<string, number>> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.bookedByDate
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
  const resp = await fetch(url, { cache: 'no-store' })
  if (!resp.ok) {
    throw new Error(`Sheets fetch failed: ${resp.status} ${resp.statusText}`)
  }
  const csv = await resp.text()
  // Google returns an HTML error page when the sheet is private. Detect that.
  if (csv.trimStart().startsWith('<')) {
    throw new Error('Sheets returned HTML — check that the sheet is shared publicly.')
  }

  const rows = parseCsv(csv)
  if (rows.length === 0) return new Map()

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const dateIdx = headers.findIndex((h) => h.includes('data') && h.includes('reserva'))
  const totalIdx = headers.findIndex((h) => h.includes('total') && h.includes('pessoas'))
  const cancelIdx = headers.findIndex((h) => h.includes('cancelad'))
  if (dateIdx === -1 || totalIdx === -1) {
    throw new Error(`CSV missing required columns. Found: ${headers.join(' | ')}`)
  }

  const bookedByDate = new Map<string, number>()
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]
    if (cancelIdx >= 0 && row[cancelIdx]?.trim()) continue // any value in "Cancelados" means skip
    const rawDate = row[dateIdx]?.trim()
    if (!rawDate) continue
    const iso = parseSheetDate(rawDate)
    if (!iso) continue
    const totalStr = (row[totalIdx] || '').replace(/[^0-9]/g, '')
    const total = parseInt(totalStr, 10) || 0
    if (total <= 0) continue
    bookedByDate.set(iso, (bookedByDate.get(iso) || 0) + total)
  }

  cache = { fetchedAt: now, bookedByDate }
  return bookedByDate
}

function buildMessage(
  status: AvailabilityStatus,
  date: string,
  booked: number,
  max: number,
  left: number
): string {
  switch (status) {
    case 'available':
      return `Disponível em ${date} (${left} lugares livres de ${max}).`
    case 'busy':
      return `Disponível mas com alta procura em ${date} (${left} lugares livres de ${max}).`
    case 'full':
      return `Lotado em ${date} (${booked}/${max} ocupados).`
    case 'blocked':
      return `Casa fechada em ${date}.`
    default:
      return `Sem informações de capacidade para ${date}.`
  }
}

export async function checkAvailabilityViaSheets(
  date: string,
  partySize: number | null
): Promise<AvailabilityResult> {
  const today = getTodayBrazilDate()
  const isToday = date === today
  const isPast = date < today

  const sheetId = process.env.AVAILABILITY_SHEET_ID
  if (!sheetId) {
    return {
      date,
      partySize,
      status: 'unknown',
      capacityLeft: null,
      capacityMax: null,
      booked: null,
      message: 'AVAILABILITY_SHEET_ID não configurado.',
      isToday,
      isPast,
      alternatives: [],
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      date,
      partySize,
      status: 'unknown',
      capacityLeft: null,
      capacityMax: null,
      booked: null,
      message: 'Data inválida.',
      isToday,
      isPast,
      alternatives: [],
    }
  }

  let bookedByDate: Map<string, number>
  try {
    bookedByDate = await fetchAndParse(sheetId)
  } catch (err) {
    return {
      date,
      partySize,
      status: 'unknown',
      capacityLeft: null,
      capacityMax: null,
      booked: null,
      message: `Sistema de reservas indisponível: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      isToday,
      isPast,
      alternatives: [],
    }
  }

  const max = capacityFor(date)
  const booked = bookedByDate.get(date) || 0
  const left = Math.max(0, max - booked)
  const status = statusFor(booked, max, partySize)

  // Suggest alternative dates ONLY in the future when the target is full.
  // Never suggest past dates, and skip alternatives entirely when the requested
  // date itself is in the past or today (today-full is handled by the prompt,
  // not by alt suggestions).
  const alternatives: AvailabilityResult['alternatives'] = []
  if (!isPast && !isToday && status === 'full') {
    const target = new Date(`${date}T12:00:00`)
    // Search forward up to 7 days (always future of `today`)
    for (let offset = 1; offset <= 7 && alternatives.length < 4; offset += 1) {
      const d = new Date(target)
      d.setUTCDate(d.getUTCDate() + offset)
      const altIso = formatIsoDate(d)
      if (altIso <= today) continue
      const altMax = capacityFor(altIso)
      const altBooked = bookedByDate.get(altIso) || 0
      const altLeft = altMax - altBooked
      const altStatus = statusFor(altBooked, altMax, partySize)
      if (altStatus === 'available' || altStatus === 'busy') {
        alternatives.push({ date: altIso, status: altStatus, capacityLeft: altLeft })
      }
    }
  }

  return {
    date,
    partySize,
    status,
    capacityLeft: left,
    capacityMax: max,
    booked,
    message: buildMessage(status, date, booked, max, left),
    isToday,
    isPast,
    alternatives: alternatives.slice(0, 4),
  }
}
