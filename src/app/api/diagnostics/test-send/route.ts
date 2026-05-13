import { NextResponse } from 'next/server'
import { sendManualReply } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'

export async function POST(request: Request) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (!body.conversationId) {
    return NextResponse.json({ error: 'conversationId é obrigatório' }, { status: 400 })
  }

  const result = await sendManualReply(body.conversationId, body.body || 'Teste de envio do diagnóstico.')
  return NextResponse.json({ ok: true, result })
}
