import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/route-guards'
import { whatsappTemplateSchema } from '@/lib/schemas'
import { listWhatsappTemplates, saveWhatsappTemplate } from '@/lib/workspace-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const templates = await listWhatsappTemplates()
  return NextResponse.json({ templates })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = whatsappTemplateSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: 'Template inválido para a Meta' }, { status: 400 })
  }

  const result = await saveWhatsappTemplate(payload.data)
  const templates = await listWhatsappTemplates()
  return NextResponse.json({ ok: true, template: result.template, lint: result.lint, templates })
}
