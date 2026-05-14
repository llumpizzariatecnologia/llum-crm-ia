import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/route-guards'
import { knowledgeDocumentSchema } from '@/lib/schemas'
import { listKnowledgeDocuments, saveKnowledgeDocument } from '@/lib/workspace-admin'
import { indexKnowledgeDocument } from '@/lib/knowledge-rag'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const documents = await listKnowledgeDocuments()
  return NextResponse.json({ documents })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = knowledgeDocumentSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: 'Documento da base inválido' }, { status: 400 })
  }

  const document = await saveKnowledgeDocument(payload.data)
  const indexing = await indexKnowledgeDocument({ document })
  const documents = await listKnowledgeDocuments()
  return NextResponse.json({ ok: true, document, documents, indexing })
}
