// Standalone script (no Next/server-only) that decrypts the WhatsApp
// integration and prints the verify token and webhook URL.
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12
const TAG_LENGTH = 128

async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('llum-crm-ia-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

async function decrypt(encryptedBase64: string): Promise<string> {
  const secret =
    process.env.ENCRYPTION_KEY || process.env.CRM_SESSION_SECRET || 'llum-local-dev-secret'
  const key = await deriveKey(secret)
  const combined = Buffer.from(encryptedBase64, 'base64')
  const iv = combined.subarray(0, IV_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH)
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    ciphertext
  )
  return new TextDecoder().decode(plaintext)
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: integration } = await supabase
    .from('integrations')
    .select('provider, encrypted_credentials, workspace_id')
    .eq('provider', 'whatsapp')
    .maybeSingle()

  const { data: channel } = await supabase
    .from('whatsapp_channel_configs')
    .select('display_name, phone_number_id, waba_id, webhook_url, workspace_id')
    .maybeSingle()

  let creds: Record<string, string> = {}
  if (integration?.encrypted_credentials) {
    try {
      const raw = await decrypt(integration.encrypted_credentials)
      const parsed = JSON.parse(raw) as { credentials?: Record<string, string> }
      creds = parsed.credentials || {}
    } catch (err) {
      console.error('decrypt error:', err)
    }
  }

  console.log('--- INTEGRATION (table: integrations, provider=whatsapp) ---')
  console.log('workspace_id    :', integration?.workspace_id || '(none — global)')
  console.log('verify_token    :', creds.verify_token || '(not saved in DB)')
  console.log('access_token    :', creds.access_token ? `${creds.access_token.slice(0, 6)}...${creds.access_token.slice(-4)}` : '(not saved)')
  console.log('phone_number_id :', creds.phone_number_id || '(not saved)')
  console.log('waba_id         :', creds.waba_id || '(not saved)')
  console.log('app_secret      :', creds.app_secret ? `${creds.app_secret.slice(0, 4)}...${creds.app_secret.slice(-4)}` : '(not saved)')
  console.log()
  console.log('--- CHANNEL CONFIG (table: whatsapp_channel_configs) ---')
  console.log('display_name    :', channel?.display_name || '(none)')
  console.log('phone_number_id :', channel?.phone_number_id || '(none)')
  console.log('waba_id         :', channel?.waba_id || '(none)')
  console.log('webhook_url     :', channel?.webhook_url || '(none)')
  console.log()
  console.log('--- ENV FALLBACKS (.env.local) ---')
  console.log('META_VERIFY_TOKEN  :', process.env.META_VERIFY_TOKEN || '(not set)')
  console.log('META_ACCESS_TOKEN  :', process.env.META_ACCESS_TOKEN ? 'set' : '(not set)')
  console.log('META_PHONE_NUMBER_ID:', process.env.META_PHONE_NUMBER_ID || '(not set)')
  console.log('META_WABA_ID       :', process.env.META_WABA_ID || '(not set)')
  console.log('META_APP_SECRET    :', process.env.META_APP_SECRET ? 'set' : '(not set)')
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
