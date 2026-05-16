import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // integrations: workspace_id IS NULL for global
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id, label, is_active')
    .eq('provider', 'whatsapp')
    .is('workspace_id', null)

  // channels: workspace_id = 'llum-default' text slug
  const { data: channels } = await supabase
    .from('whatsapp_channel_configs')
    .select('id, display_name, label, is_active, integration_id')
    .eq('workspace_id', 'llum-default')

  console.log('integrations found:', integrations?.length || 0)
  for (const i of integrations || []) console.log('  -', i)

  console.log('channels found:', channels?.length || 0)
  for (const c of channels || []) console.log('  -', c)

  console.log()
  console.log('pairing result (what UI will see):')
  for (const i of integrations || []) {
    const ch = channels?.find((c) => c.integration_id === i.id)
    console.log(`  ${i.label} → ${ch ? `channel "${ch.display_name}"` : 'NO MATCHING CHANNEL'}`)
  }
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
