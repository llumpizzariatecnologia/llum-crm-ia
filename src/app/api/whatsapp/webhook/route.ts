import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { processInboundMessage, resolveWhatsAppRuntime } from '@/lib/crm'

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
  const runtime = await resolveWhatsAppRuntime()
  const signature = request.headers.get('x-hub-signature-256')
  const signatureValid = validateSignature(rawBody, signature, runtime.appSecret)

  if (!signatureValid && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  const entry = payload.entry?.[0]
  const changes = entry?.changes?.[0]
  const value = changes?.value
  const message = value?.messages?.[0]
  const contact = value?.contacts?.[0]

  if (!message || !contact) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const body = message.text?.body || '[mensagem sem texto]'

  const result = await processInboundMessage({
    customerName: contact.profile?.name || contact.wa_id,
    phone: contact.wa_id,
    body,
    externalMessageId: message.id,
    source: 'webhook',
    payload,
  })

  return NextResponse.json({ ok: true, signatureValid, result })
}
