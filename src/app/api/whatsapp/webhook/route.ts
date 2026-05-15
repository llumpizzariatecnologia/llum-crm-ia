import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { processInboundMessage, resolveWhatsAppRuntime } from '@/lib/crm'
import { getServerSupabaseClient } from '@/lib/server/supabase'
import type { WebhookEvent } from '@/types/database'

// Allow the background `after()` task to keep running for up to 60s after
// we respond 200. The webhook itself targets <200ms response time.
export const maxDuration = 60

function validateSignature(requestBody: string, signatureHeader: string | null, appSecret: string | null) {
  if (!appSecret || !signatureHeader) return false

  const expected = `sha256=${createHmac('sha256', appSecret).update(requestBody).digest('hex')}`
  const actualBuffer = Buffer.from(signatureHeader)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

export async function GET(request: NextRequest) {
  const runtime = await resolveWhatsAppRuntime()
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && token === runtime.verifyToken) {
    return new NextResponse(challenge || 'ok', { status: 200 })
  }

  return NextResponse.json({ error: 'Webhook verification failed' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: true, ignored: 'invalid_json' })
  }

  const entry = (payload.entry as Array<Record<string, unknown>> | undefined)?.[0]
  const changes = (entry?.changes as Array<Record<string, unknown>> | undefined)?.[0]
  const value = changes?.value as Record<string, unknown> | undefined
  const metadata = value?.metadata as { phone_number_id?: string } | undefined
  const message = (value?.messages as Array<Record<string, unknown>> | undefined)?.[0] as
    | { id?: string; text?: { body?: string } }
    | undefined
  const contact = (value?.contacts as Array<Record<string, unknown>> | undefined)?.[0] as
    | { profile?: { name?: string }; wa_id?: string }
    | undefined

  // Use the inbound phone_number_id (from Meta's metadata) to select the right
  // environment's credentials — supports running production + test side by side.
  const inboundPhoneNumberId = metadata?.phone_number_id?.trim() || undefined
  const runtime = await resolveWhatsAppRuntime(undefined, inboundPhoneNumberId)
  const signature = request.headers.get('x-hub-signature-256')
  const signatureValid = validateSignature(rawBody, signature, runtime.appSecret)

  if (!signatureValid && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  if (!message || !contact || !contact.wa_id) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const body = message.text?.body || '[mensagem sem texto]'

  // 1. Persist webhook event immediately so we have an audit row even if
  //    processing fails or times out. processed=false marks it for retry.
  const supabase = getServerSupabaseClient()
  const insertResult = (await supabase
    .from('webhook_events')
    .insert({
      provider: 'meta',
      event_type: 'message',
      external_message_id: message.id ?? null,
      phone_number_id: inboundPhoneNumberId || runtime.phoneNumberId,
      wa_id: contact.wa_id,
      payload,
      signature_valid: signatureValid,
      processed: false,
      processing_result: 'pending',
      error: null,
    } as never)
    .select('id')
    .single()) as { data: Pick<WebhookEvent, 'id'> | null }

  const webhookEventId = insertResult.data?.id ?? null

  // 2. Schedule background processing. Returns 200 immediately to Meta.
  after(async () => {
    try {
      await processInboundMessage({
        customerName: contact.profile?.name || contact.wa_id!,
        phone: contact.wa_id!,
        body,
        externalMessageId: message.id ?? null,
        source: 'webhook',
        payload,
        webhookEventId,
        inboundPhoneNumberId,
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (webhookEventId) {
        await supabase
          .from('webhook_events')
          .update({
            processed: true,
            processing_result: 'error',
            error: errMsg,
          } as never)
          .eq('id', webhookEventId)
      }
    }
  })

  return NextResponse.json({ ok: true, signatureValid, queued: webhookEventId })
}
