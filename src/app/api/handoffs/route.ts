import { NextResponse } from 'next/server'
import { listHandoffs } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const handoffs = await listHandoffs()
  return NextResponse.json({ handoffs })
}
