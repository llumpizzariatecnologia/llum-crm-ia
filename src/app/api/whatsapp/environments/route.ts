import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/route-guards'
import { listWhatsappEnvironments, activateWhatsappEnvironment } from '@/lib/crm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const environments = await listWhatsappEnvironments()
  return NextResponse.json({ environments })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as { integrationId?: string } | null
  if (!body?.integrationId) {
    return NextResponse.json({ error: 'integrationId required' }, { status: 400 })
  }

  await activateWhatsappEnvironment(body.integrationId)
  const environments = await listWhatsappEnvironments()
  return NextResponse.json({ ok: true, environments })
}
