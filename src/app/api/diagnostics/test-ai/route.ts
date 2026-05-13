import { NextResponse } from 'next/server'
import { processInboundMessage } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'

export async function POST() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const result = await processInboundMessage({
    customerName: 'Teste IA',
    phone: '+5541999990000',
    body: 'Quero reservar uma mesa hoje para 4 pessoas',
    source: 'diagnostic',
  })

  return NextResponse.json({ ok: true, result })
}
