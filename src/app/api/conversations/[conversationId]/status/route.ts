import { NextRequest, NextResponse } from 'next/server'
import { updateConversationState } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'
import { conversationStatusSchema } from '@/lib/schemas'

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/conversations/[conversationId]/status'>
) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = conversationStatusSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
  }

  const { conversationId } = await context.params
  await updateConversationState(conversationId, payload.data.status)
  return NextResponse.json({ ok: true })
}
