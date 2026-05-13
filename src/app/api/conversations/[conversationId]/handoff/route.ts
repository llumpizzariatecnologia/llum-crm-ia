import { NextRequest, NextResponse } from 'next/server'
import { requestConversationHandoff } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'
import { handoffSchema } from '@/lib/schemas'

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/conversations/[conversationId]/handoff'>
) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = handoffSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: 'Dados inválidos para handoff' }, { status: 400 })
  }

  const { conversationId } = await context.params
  const handoff = await requestConversationHandoff(
    conversationId,
    payload.data.reason || 'Solicitado manualmente pelo operador'
  )
  return NextResponse.json({ handoff })
}
