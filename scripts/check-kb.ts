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

  const { data: docs } = await supabase
    .from('knowledge_documents')
    .select('id, title, status, category, source_type, updated_at')
    .order('updated_at', { ascending: false })

  const { data: chunks } = await supabase
    .from('knowledge_chunks')
    .select('document_id')
  const chunkCounts = new Map<string, number>()
  for (const c of chunks || []) {
    chunkCounts.set(c.document_id, (chunkCounts.get(c.document_id) || 0) + 1)
  }

  console.log('total docs:', docs?.length || 0)
  console.log()
  for (const d of docs || []) {
    const n = chunkCounts.get(d.id) || 0
    console.log(`[${d.status}] ${d.title.padEnd(48)} chunks=${n} (${d.category})`)
  }
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
