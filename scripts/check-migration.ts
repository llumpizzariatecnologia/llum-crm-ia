// Quick check: did the 20260515 multi-environment migration land?
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

  const { data: intRow, error: intErr } = await supabase
    .from('integrations')
    .select('id, is_active, workspace_id, provider, label')
    .limit(5)

  const { data: chanRow, error: chanErr } = await supabase
    .from('whatsapp_channel_configs')
    .select('id, is_active, label, integration_id, workspace_id, display_name, phone_number_id')
    .limit(5)

  console.log('=== integrations ===')
  console.log(intErr ? `ERR: ${intErr.message}` : intRow)

  console.log()
  console.log('=== whatsapp_channel_configs ===')
  console.log(chanErr ? `ERR: ${chanErr.message}` : chanRow)
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
