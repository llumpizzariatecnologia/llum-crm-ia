import 'server-only'

// AES-256-GCM encryption utilities for secure credential storage.
// In development, we fall back to CRM_SESSION_SECRET to keep local setup usable.

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12
const TAG_LENGTH = 128

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY || process.env.CRM_SESSION_SECRET || 'llum-local-dev-secret'
  return key
}

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

export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey(getEncryptionKey())
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoder = new TextEncoder()

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    encoder.encode(plaintext)
  )

  // Combine IV + ciphertext into a single base64 string
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return Buffer.from(combined).toString('base64')
}

export async function decrypt(encryptedBase64: string): Promise<string> {
  const key = await deriveKey(getEncryptionKey())
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

export function maskCredential(value: string): string {
  if (!value || value.length < 8) return '****'
  const prefix = value.substring(0, 4)
  const suffix = value.substring(value.length - 4)
  return `${prefix}...${suffix}`
}
