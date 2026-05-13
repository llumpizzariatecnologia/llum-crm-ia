import { NextResponse } from 'next/server'
import { fetchDashboardData } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const data = await fetchDashboardData()
  return NextResponse.json(data)
}
