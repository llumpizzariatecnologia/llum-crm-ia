import { NextResponse } from 'next/server'
import { fetchDashboardData } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  try {
    const data = await fetchDashboardData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('dashboard_route_error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao carregar dashboard' },
      { status: 500 }
    )
  }
}
