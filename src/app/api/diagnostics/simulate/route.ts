import { NextRequest, NextResponse } from 'next/server'
import { processInboundMessage } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'
import { simulateInboundSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = simulateInboundSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: 'Payload inválido para simulação' }, { status: 400 })
  }

  const result = await processInboundMessage({
    ...payload.data,
    source: 'diagnostic',
  })

  return NextResponse.json({ ok: true, result })
}
