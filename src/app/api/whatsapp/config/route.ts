import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/route-guards'
import { whatsappChannelConfigSchema } from '@/lib/schemas'
import {
  defaultWhatsappChannelInput,
  getWhatsappChannelConfig,
  saveWhatsappChannelConfig,
} from '@/lib/workspace-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const config = await getWhatsappChannelConfig()
  return NextResponse.json({ config: config || defaultWhatsappChannelInput })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = whatsappChannelConfigSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: 'Configuração do canal inválida' }, { status: 400 })
  }

  const config = await saveWhatsappChannelConfig(payload.data)
  return NextResponse.json({ ok: true, config })
}
