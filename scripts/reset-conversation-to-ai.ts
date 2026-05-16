import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

async function main() {
  const phoneSuffix = process.argv[2] || '4197168912' // últimos 10 dígitos
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: customers } = await supabase
    .from('customers')
    .select('id, phone, name')
    .ilike('phone', `%${phoneSuffix}`)

  if (!customers || customers.length === 0) {
    console.log(`no customer found for phone ending in ${phoneSuffix}`)
    return
  }

  for (const c of customers) {
    console.log(`customer: ${c.id} phone=${c.phone} name=${c.name}`)

    const { data: convos } = await supabase
      .from('conversations')
      .select('id, status, assigned_to, updated_at')
      .eq('customer_id', c.id)
      .order('updated_at', { ascending: false })

    for (const conv of convos || []) {
      console.log(`  conversation ${conv.id} status=${conv.status} → resetting to ai_active`)
      await supabase
        .from('conversations')
        .update({
          status: 'ai_active',
          assigned_to: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id)

      // Close any open handoffs so they don't re-trigger human_active
      await supabase
        .from('handoffs')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('conversation_id', conv.id)
        .neq('status', 'resolved')
    }
  }

  console.log('\ndone — IA reativada nessa(s) conversa(s).')
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
