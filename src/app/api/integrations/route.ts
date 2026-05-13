import { NextRequest, NextResponse } from 'next/server'
import { saveValidatedIntegration, listIntegrations } from '@/lib/crm'
import { validateProvider, type ProviderType } from '@/lib/providers'
import { requireApiSession } from '@/lib/route-guards'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const integrations = await listIntegrations()
  return NextResponse.json({ integrations })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const body = (await request.json()) as {
    provider: ProviderType
    credentials: Record<string, string>
  }

  if (!body.provider || !body.credentials) {
    return NextResponse.json({ error: 'provider e credentials são obrigatórios' }, { status: 400 })
  }

  const validation = await validateProvider(body.provider, body.credentials)
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || 'Credencial inválida', valid: false },
      { status: 422 }
    )
  }

  await saveValidatedIntegration({
    provider: body.provider,
    credentials: body.credentials,
    validationDetails: validation.details || null,
  })

  const integrations = (await listIntegrations()) as Array<{
    provider: string
    [key: string]: unknown
  }>
  const integration = integrations.find((item) => item.provider === body.provider) ?? null

  return NextResponse.json({ ok: true, integration })
}
