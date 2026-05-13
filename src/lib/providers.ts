export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'openrouter'
  | 'deepseek'
  | 'whatsapp'

export interface ValidationResult {
  valid: boolean
  error?: string
  details?: Record<string, unknown>
}

export async function validateProvider(
  provider: ProviderType,
  credentials: Record<string, string>
): Promise<ValidationResult> {
  switch (provider) {
    case 'openai':
      return validateOpenAI(credentials.api_key)
    case 'anthropic':
      return validateAnthropic(credentials.api_key)
    case 'groq':
      return validateGroq(credentials.api_key)
    case 'openrouter':
      return validateOpenRouter(credentials.api_key)
    case 'deepseek':
      return validateDeepSeek(credentials.api_key)
    case 'whatsapp':
      return validateWhatsApp(
        credentials.access_token,
        credentials.phone_number_id,
        credentials.waba_id
      )
    default:
      return { valid: false, error: `Provider '${provider}' não suportado` }
  }
}

async function validateOpenAI(apiKey: string): Promise<ValidationResult> {
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) return { valid: true }
    const body = await res.json().catch(() => ({}))
    return { valid: false, error: body?.error?.message || `HTTP ${res.status}` }
  } catch (error) {
    return { valid: false, error: `Falha na conexão: ${(error as Error).message}` }
  }
}

async function validateAnthropic(apiKey: string): Promise<ValidationResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    if (res.ok || res.status === 400) return { valid: true }
    return { valid: false, error: `HTTP ${res.status}` }
  } catch (error) {
    return { valid: false, error: `Falha na conexão: ${(error as Error).message}` }
  }
}

async function validateGroq(apiKey: string): Promise<ValidationResult> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) return { valid: true }
    return { valid: false, error: `HTTP ${res.status}` }
  } catch (error) {
    return { valid: false, error: `Falha na conexão: ${(error as Error).message}` }
  }
}

async function validateOpenRouter(apiKey: string): Promise<ValidationResult> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) return { valid: true }
    return { valid: false, error: `HTTP ${res.status}` }
  } catch (error) {
    return { valid: false, error: `Falha na conexão: ${(error as Error).message}` }
  }
}

async function validateDeepSeek(apiKey: string): Promise<ValidationResult> {
  try {
    const res = await fetch('https://api.deepseek.com/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) return { valid: true }
    return { valid: false, error: `HTTP ${res.status}` }
  } catch (error) {
    return { valid: false, error: `Falha na conexão: ${(error as Error).message}` }
  }
}

async function validateWhatsApp(
  accessToken: string,
  phoneNumberId: string,
  wabaId: string
): Promise<ValidationResult> {
  try {
    const [phoneRes, wabaRes] = await Promise.all([
      fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch(`https://graph.facebook.com/v20.0/${wabaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ])

    if (phoneRes.ok && wabaRes.ok) {
      const phoneData = await phoneRes.json()
      const wabaData = await wabaRes.json()

      return {
        valid: true,
        details: {
          display_phone_number: phoneData.display_phone_number,
          verified_name: phoneData.verified_name,
          quality_rating: phoneData.quality_rating,
          waba_name: wabaData.name || null,
        },
      }
    }

    const body = await phoneRes.json().catch(() => ({}))
    return { valid: false, error: body?.error?.message || `HTTP ${phoneRes.status}` }
  } catch (error) {
    return {
      valid: false,
      error: `Falha na conexão com Graph API: ${(error as Error).message}`,
    }
  }
}
