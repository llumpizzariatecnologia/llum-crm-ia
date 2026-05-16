// Self-contained test: validates the CSV parser and aggregation logic
// against the live Google Sheet. Avoids the server-only import constraint.
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const SHEET_ID = '1G2MO0GvsIhwDRH0niWxSBOxFkxz3H5P-kn0DNjEjVWo'
const CAPACITY = 430

function parseCsv(csv: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < csv.length; i += 1) {
    const c = csv[i]
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') { field += '"'; i += 1 } else { inQuotes = false }
        continue
      }
      field += c
      continue
    }
    if (c === '"') { inQuotes = true; continue }
    if (c === ',') { current.push(field); field = ''; continue }
    if (c === '\r') continue
    if (c === '\n') {
      current.push(field); field = ''
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
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

async function main() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`
  console.log('fetching', url)
  const resp = await fetch(url)
  console.log('status:', resp.status)
  if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`)

  const csv = await resp.text()
  console.log('csv length:', csv.length, 'chars')

  const rows = parseCsv(csv)
  console.log('parsed rows:', rows.length)

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  console.log('headers:', headers)
  const dateIdx = headers.findIndex((h) => h.includes('data') && h.includes('reserva'))
  const totalIdx = headers.findIndex((h) => h.includes('total') && h.includes('pessoas'))
  const cancelIdx = headers.findIndex((h) => h.includes('cancelad'))
  console.log('column indexes:', { dateIdx, totalIdx, cancelIdx })

  const bookedByDate = new Map<string, number>()
  let skippedCancelled = 0
  let skippedBadDate = 0
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]
    if (cancelIdx >= 0 && row[cancelIdx]?.trim()) {
      skippedCancelled += 1
      continue
    }
    const iso = parseSheetDate(row[dateIdx] || '')
    if (!iso) {
      skippedBadDate += 1
      continue
    }
    const total = parseInt((row[totalIdx] || '').replace(/[^0-9]/g, ''), 10) || 0
    if (total <= 0) continue
    bookedByDate.set(iso, (bookedByDate.get(iso) || 0) + total)
  }

  console.log(`\naggregated dates: ${bookedByDate.size}`)
  console.log(`skipped cancelled: ${skippedCancelled}, skipped bad date: ${skippedBadDate}`)

  console.log('\ndates with most bookings:')
  const sorted = [...bookedByDate.entries()].sort((a, b) => b[1] - a[1])
  for (const [date, booked] of sorted.slice(0, 15)) {
    const left = CAPACITY - booked
    const status = booked >= CAPACITY ? 'full' : booked / CAPACITY >= 0.7 ? 'busy' : 'available'
    console.log(`  ${date} → ${booked}/${CAPACITY} (${left} left) [${status}]`)
  }

  // Probe specific dates
  console.log('\nspecific dates check:')
  for (const d of ['2026-05-16', '2026-05-17', '2026-05-20', '2026-05-23', '2026-04-30']) {
    const booked = bookedByDate.get(d) || 0
    const left = CAPACITY - booked
    const status = booked >= CAPACITY ? 'full' : booked / CAPACITY >= 0.7 ? 'busy' : 'available'
    console.log(`  ${d} → ${booked}/${CAPACITY} (${left} left) [${status}]`)
  }

  // Alternatives forward of TODAY
  console.log('\nalternatives forward of today (2026-05-16):')
  const today = '2026-05-16'
  const candidates: string[] = []
  for (let offset = 1; offset <= 7; offset += 1) {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + offset)
    candidates.push(d.toISOString().slice(0, 10))
  }
  for (const c of candidates) {
    const booked = bookedByDate.get(c) || 0
    const left = CAPACITY - booked
    const status = booked >= CAPACITY ? 'full' : booked / CAPACITY >= 0.7 ? 'busy' : 'available'
    if (status !== 'full') {
      console.log(`  ${c} → ${booked}/${CAPACITY} (${left} left) [${status}] ✓ alt candidate`)
    } else {
      console.log(`  ${c} → ${booked}/${CAPACITY} [full] skip`)
    }
  }
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
