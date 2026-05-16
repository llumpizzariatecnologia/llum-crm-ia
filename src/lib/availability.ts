import 'server-only'

import { checkAvailability as checkAvailabilityViaSupabase } from '@/lib/reservations'
import { checkAvailabilityViaSheets } from '@/lib/sheets-availability'
import type { AvailabilityResult, AvailabilityStatus } from '@/lib/reservations'

export type { AvailabilityResult, AvailabilityStatus }

export type AvailabilityMode = 'off' | 'supabase' | 'sheets'

/**
 * Picks which availability provider to use based on env config. Defaults to
 * 'off' so the AI never sees synthetic availability data.
 *
 * - AVAILABILITY_PROVIDER=sheets       → read from Google Sheets
 * - AVAILABILITY_PROVIDER=supabase     → read from `reservas` schema
 * - AVAILABILITY_PROVIDER=off (default) → no tool call
 *
 * Legacy: AVAILABILITY_TOOL_ENABLED=true still activates the supabase
 * provider when AVAILABILITY_PROVIDER isn't set.
 */
export function getAvailabilityMode(): AvailabilityMode {
  const raw = process.env.AVAILABILITY_PROVIDER?.toLowerCase().trim()
  if (raw === 'sheets') return 'sheets'
  if (raw === 'supabase') return 'supabase'
  if (raw === 'off') return 'off'
  if (process.env.AVAILABILITY_TOOL_ENABLED === 'true') return 'supabase'
  return 'off'
}

/**
 * Returns null when the provider is disabled — callers should treat this as
 * "no availability info, behave as if the tool isn't there". Provider errors
 * also return null so the Maria flow never crashes because of an outage.
 */
export async function checkAvailability(
  date: string,
  partySize: number | null
): Promise<AvailabilityResult | null> {
  const mode = getAvailabilityMode()
  if (mode === 'off') return null
  try {
    if (mode === 'sheets') return await checkAvailabilityViaSheets(date, partySize)
    return await checkAvailabilityViaSupabase(date, partySize)
  } catch {
    return null
  }
}
