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

export interface ProviderModelOption {
  id: string
  provider: Exclude<ProviderType, 'whatsapp'>
  label: string
}

export interface ProviderModelsResult {
  models: ProviderModelOption[]
  error?: string
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
      return { valid: false, error: `Provider '${provider}' nao suportado` }
  }
}

export async function listProviderModels(
  provider: Exclude<ProviderType, 'whatsapp'>,
  credentials: Record<string, string>
): Promise<ProviderModelsResult> {
  const apiKey = credentials.api_key?.trim()
  if (!apiKey) {
    return { models: [], error: 'API key nao configurada para listar modelos' }
  }

  try {
    switch (provider) {
      case 'openai':
        return {
          models: await listOpenAIModels(apiKey),
        }
      case 'anthropic':
        return {
          models: await listAnthropicModels(apiKey),
        }
      case 'groq':
        return {
          models: await listGroqModels(apiKey),
        }
      case 'openrouter':
        return {
          models: await listOpenRouterModels(apiKey),
        }
      case 'deepseek':
        return {
          models: await listDeepSeekModels(apiKey),
        }
    }
  } catch (error) {
    return {
      models: [],
      error: (error as Error).message,
    }
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
    return { valid: false, error: `Falha na conexao: ${(error as Error).message}` }
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
    return { valid: false, error: `Falha na conexao: ${(error as Error).message}` }
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
    return { valid: false, error: `Falha na conexao: ${(error as Error).message}` }
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
    return { valid: false, error: `Falha na conexao: ${(error as Error).message}` }
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
    return { valid: false, error: `Falha na conexao: ${(error as Error).message}` }
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
      error: `Falha na conexao com Graph API: ${(error as Error).message}`,
    }
  }
}

function dedupeModels(models: ProviderModelOption[]) {
  const byId = new Map<string, ProviderModelOption>()

  for (const model of models) {
    if (!byId.has(model.id)) {
      byId.set(model.id, model)
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
}

function toModelOption(
  id: string,
  provider: ProviderModelOption['provider'],
  label?: string | null
): ProviderModelOption {
  return {
    id,
    provider,
    label: label?.trim() || id,
  }
}

async function listOpenAIModels(apiKey: string) {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Falha ao listar modelos OpenAI (${res.status})`)
  }

  const body = (await res.json()) as { data?: Array<{ id?: string }> }
  return dedupeModels(
    (body.data || [])
      .map((model) => model.id?.trim())
      .filter(Boolean)
      .map((id) => toModelOption(id as string, 'openai'))
  )
}

async function listAnthropicModels(apiKey: string) {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Falha ao listar modelos Anthropic (${res.status})`)
  }

  const body = (await res.json()) as {
    data?: Array<{ id?: string; display_name?: string | null }>
  }

  return dedupeModels(
    (body.data || [])
      .map((model) => {
        const id = model.id?.trim()
        if (!id) return null
        return toModelOption(id, 'anthropic', model.display_name)
      })
      .filter(Boolean) as ProviderModelOption[]
  )
}

async function listGroqModels(apiKey: string) {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Falha ao listar modelos Groq (${res.status})`)
  }

  const body = (await res.json()) as { data?: Array<{ id?: string }> }
  return dedupeModels(
    (body.data || [])
      .map((model) => model.id?.trim())
      .filter(Boolean)
      .map((id) => toModelOption(id as string, 'groq'))
  )
}

async function listOpenRouterModels(apiKey: string) {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Falha ao listar modelos OpenRouter (${res.status})`)
  }

  const body = (await res.json()) as {
    data?: Array<{ id?: string; name?: string | null }>
  }

  return dedupeModels(
    (body.data || [])
      .map((model) => {
        const id = model.id?.trim()
        if (!id) return null
        return toModelOption(id, 'openrouter', model.name)
      })
      .filter(Boolean)
      .slice(0, 200) as ProviderModelOption[]
  )
}

async function listDeepSeekModels(apiKey: string) {
  const res = await fetch('https://api.deepseek.com/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Falha ao listar modelos DeepSeek (${res.status})`)
  }

  const body = (await res.json()) as { data?: Array<{ id?: string }> }
  return dedupeModels(
    (body.data || [])
      .map((model) => model.id?.trim())
      .filter(Boolean)
      .map((id) => toModelOption(id as string, 'deepseek'))
  )
}
