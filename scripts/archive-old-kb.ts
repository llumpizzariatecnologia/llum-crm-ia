import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // Match the old monolithic doc by title prefix.
  const { data: docs } = await supabase
    .from('knowledge_documents')
    .select('id, title, status')
    .ilike('title', 'ATENDIMENTO BASE DE CONHECIMENTO LLUM%')

  if (!docs || docs.length === 0) {
    console.log('no matching docs found')
    return
  }

  for (const doc of docs) {
    if (doc.status === 'archived') {
      console.log(`already archived: ${doc.id} (${doc.title.slice(0, 60)})`)
      continue
    }
    // Archive the doc. Also delete its chunks so RAG stops returning them.
    await supabase
      .from('knowledge_documents')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', doc.id)

    const { count } = await supabase
      .from('knowledge_chunks')
      .delete({ count: 'exact' })
      .eq('document_id', doc.id)

    console.log(`archived: ${doc.id} (${doc.title.slice(0, 60)}) — removed ${count} chunks`)
  }
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
