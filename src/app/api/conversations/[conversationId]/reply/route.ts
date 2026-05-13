import { NextRequest, NextResponse } from 'next/server'
import { sendManualReply } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'
import { sendMessageSchema } from '@/lib/schemas'

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/conversations/[conversationId]/reply'>
) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = sendMessageSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: 'Mensagem inválida' }, { status: 400 })
  }

  const { conversationId } = await context.params
  const result = await sendManualReply(conversationId, payload.data.body)
  return NextResponse.json(result)
}
