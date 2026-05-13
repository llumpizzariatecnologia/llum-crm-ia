import { NextResponse } from 'next/server'
import { claimHandoff, resolveHandoff } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'

export async function POST(
  request: Request,
  context: RouteContext<'/api/handoffs/[handoffId]/claim'>
) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const { handoffId } = await context.params

  if (body.action === 'resolve') {
    const handoff = await resolveHandoff(handoffId)
    return NextResponse.json({ handoff, conversationId: handoff.conversation_id })
  }

  const handoff = await claimHandoff(handoffId)
  return NextResponse.json({ handoff, conversationId: handoff.conversation_id })
}
