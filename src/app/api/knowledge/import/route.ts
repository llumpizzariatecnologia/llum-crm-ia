import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/route-guards'
import { importKnowledgePdf } from '@/lib/knowledge-rag'
import { listKnowledgeDocuments } from '@/lib/workspace-admin'

export const dynamic = 'force-dynamic'

function parseTags(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Selecione um PDF para importar.' }, { status: 400 })
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'O arquivo precisa estar em PDF.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await importKnowledgePdf({
    buffer,
    fileName: file.name,
    title: typeof formData.get('title') === 'string' ? String(formData.get('title')) : undefined,
    category: typeof formData.get('category') === 'string' ? String(formData.get('category')) : undefined,
    sourceType:
      typeof formData.get('sourceType') === 'string'
        ? (String(formData.get('sourceType')) as
            | 'faq'
            | 'policy'
            | 'menu'
            | 'pricing'
            | 'operations'
            | 'custom')
        : undefined,
    summary:
      typeof formData.get('summary') === 'string' ? String(formData.get('summary')) : undefined,
    tags: parseTags(formData.get('tags')),
    status:
      typeof formData.get('status') === 'string'
        ? (String(formData.get('status')) as 'draft' | 'published' | 'archived')
        : 'published',
  })

  const documents = await listKnowledgeDocuments()

  return NextResponse.json({
    ok: true,
    document: result.document,
    documents,
    indexing: {
      chunkCount: result.chunkCount,
      embeddedCount: result.embeddedCount,
      embeddingModel: result.embeddingModel,
      extractedChars: result.extractedChars,
      warnings: result.warnings,
    },
  })
}
