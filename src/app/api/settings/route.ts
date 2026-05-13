import { NextRequest, NextResponse } from 'next/server'
import { getCrmSettings, saveCrmSettings } from '@/lib/crm'
import { requireApiSession } from '@/lib/route-guards'
import { crmSettingsSchema } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const settings = await getCrmSettings()
  return NextResponse.json({ settings })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = crmSettingsSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: 'Configurações inválidas' }, { status: 400 })
  }

  const settings = await saveCrmSettings(payload.data)
  return NextResponse.json({ ok: true, settings })
}
