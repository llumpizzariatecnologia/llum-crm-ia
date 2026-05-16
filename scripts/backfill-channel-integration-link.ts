// Link existing channel configs to their integrations via phone_number_id.
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: integrations } = await supabase
    .from('integrations')
    .select('id, encrypted_credentials')
    .eq('provider', 'whatsapp')

  const { data: channels } = await supabase
    .from('whatsapp_channel_configs')
    .select('id, phone_number_id, integration_id')

  for (const integ of integrations || []) {
    let phone: string | null = null
    try {
      const parsed = JSON.parse(await decrypt(integ.encrypted_credentials)) as {
        credentials?: Record<string, string>
      }
      phone = parsed.credentials?.phone_number_id || null
    } catch {
      continue
    }
    if (!phone) continue
    const match = channels?.find((c) => c.phone_number_id === phone)
    if (!match) {
      console.log(`no channel for phone ${phone} (integration ${integ.id.slice(0, 8)})`)
      continue
    }
    if (match.integration_id === integ.id) {
      console.log(`already linked: ${integ.id.slice(0, 8)} ↔ ${match.id.slice(0, 8)}`)
      continue
    }
    await supabase
      .from('whatsapp_channel_configs')
      .update({ integration_id: integ.id })
      .eq('id', match.id)
    console.log(`linked: integration ${integ.id.slice(0, 8)} → channel ${match.id.slice(0, 8)} (phone ${phone})`)
  }
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
