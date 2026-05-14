import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/route-guards'
import { whatsappChannelConfigSchema } from '@/lib/schemas'
import {
  defaultWhatsappChannelInput,
  getWhatsappChannelConfig,
  saveWhatsappChannelConfig,
} from '@/lib/workspace-admin'
import type { WhatsappChannelConfig } from '@/types/database'

export const dynamic = 'force-dynamic'

function serializeChannelConfig(config: WhatsappChannelConfig | typeof defaultWhatsappChannelInput) {
  if ('displayName' in config) return config

  return {
    id: config.id,
    displayName: config.display_name,
    phoneNumberId: config.phone_number_id,
    wabaId: config.waba_id,
    webhookUrl: config.webhook_url || '',
    graphApiVersion: config.graph_api_version,
    verifiedName: config.verified_name || '',
    qualityRating: config.quality_rating || '',
    splitLongMessages: config.split_long_messages,
    maxMessageChars: config.max_message_chars,
    splitMessageDelaySeconds: config.split_message_delay_seconds,
    status: config.status,
  }
}

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const config = await getWhatsappChannelConfig()
  return NextResponse.json({ config: serializeChannelConfig(config || defaultWhatsappChannelInput) })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = whatsappChannelConfigSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: 'Configuração do canal inválida' }, { status: 400 })
  }

  const config = await saveWhatsappChannelConfig(payload.data)
  return NextResponse.json({ ok: true, config: serializeChannelConfig(config) })
}
