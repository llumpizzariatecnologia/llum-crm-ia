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

  console.log('=== Last 5 webhook_events ===')
  const { data: webhooks } = await supabase
    .from('webhook_events')
    .select('id, phone_number_id, wa_id, signature_valid, processed, processing_result, error, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  for (const w of webhooks || []) {
    console.log(`[${w.created_at}] phone=${w.phone_number_id} wa=${w.wa_id} sig=${w.signature_valid} processed=${w.processed} result=${w.processing_result} err=${w.error || '-'}`)
  }

  console.log()
  console.log('=== Last 5 conversations ===')
  const { data: convos } = await supabase
    .from('conversations')
    .select('id, status, last_inbound_at, last_outbound_at, last_message_preview, current_intent, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5)
  for (const c of convos || []) {
    console.log(`[${c.updated_at}] status=${c.status} intent=${c.current_intent} inbound=${c.last_inbound_at} outbound=${c.last_outbound_at}`)
    console.log(`  preview: ${(c.last_message_preview || '').slice(0, 90)}`)
  }

  console.log()
  console.log('=== Last 5 interactions ===')
  const { data: interactions } = await supabase
    .from('interactions')
    .select('id, conversation_id, direction, sender_type, body, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(5)
  for (const i of interactions || []) {
    console.log(`[${i.created_at}] dir=${i.direction} sender=${i.sender_type} body=${(i.body || '').slice(0, 80)}`)
  }

  console.log()
  console.log('=== Last 5 agent_runs ===')
  const { data: runs } = await supabase
    .from('agent_runs')
    .select('id, conversation_id, task, model, intent, status, error, latency_ms, created_at, output')
    .order('created_at', { ascending: false })
    .limit(5)
  for (const r of runs || []) {
    console.log(`[${r.created_at}] task=${r.task} model=${r.model} intent=${r.intent} status=${r.status} latency=${r.latency_ms}ms`)
    if (r.error) console.log(`  ERROR: ${r.error}`)
    const out = r.output as Record<string, unknown> | null
    if (out?.reply) console.log(`  reply: ${String(out.reply).slice(0, 120)}`)
    if (out?.stage_latency_ms) console.log(`  stages: ${JSON.stringify(out.stage_latency_ms)}`)
    if (out?.extractedData) {
      const ed = out.extractedData as Record<string, unknown>
      if (ed.leadFields) console.log(`  leadFields: ${JSON.stringify(ed.leadFields)}`)
      if (ed.availability) console.log(`  availability: ${JSON.stringify(ed.availability)}`)
    }
  }

  console.log()
  console.log('=== Last 5 whatsapp_sends ===')
  const { data: sends } = await supabase
    .from('whatsapp_sends')
    .select('id, status, error_message, attempts, last_attempt_at, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  for (const s of sends || []) {
    console.log(`[${s.created_at}] status=${s.status} attempts=${s.attempts} err=${s.error_message || '-'}`)
  }
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
