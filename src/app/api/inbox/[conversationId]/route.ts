import { NextRequest, NextResponse } from 'next/server'
import { getConversationDetail } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  context: RouteContext<'/api/inbox/[conversationId]'>
) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const { conversationId } = await context.params
  const detail = await getConversationDetail(conversationId)
  return NextResponse.json(detail)
}
