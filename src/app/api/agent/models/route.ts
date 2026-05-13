import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/route-guards'
import { getDecryptedIntegration } from '@/lib/crm'
import { listProviderModels, type ProviderModelOption } from '@/lib/providers'

export const dynamic = 'force-dynamic'

const AI_PROVIDERS = ['openai', 'anthropic', 'groq', 'openrouter', 'deepseek'] as const

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const models: ProviderModelOption[] = []
  const providers: Array<{ provider: string; source: 'integration' | 'environment'; count: number }> = []
  const errors: string[] = []

  for (const provider of AI_PROVIDERS) {
    const integration = await getDecryptedIntegration(provider)
    const apiKey = integration?.credentials?.api_key?.trim()
    if (!apiKey) continue

    const result = await listProviderModels(provider, { api_key: apiKey })
    if (result.error) {
      errors.push(`${provider}: ${result.error}`)
      continue
    }

    models.push(...result.models)
    providers.push({
      provider,
      source: 'integration',
      count: result.models.length,
    })
  }

  if (!providers.some((item) => item.provider === 'openai') && process.env.OPENAI_API_KEY?.trim()) {
    const result = await listProviderModels('openai', {
      api_key: process.env.OPENAI_API_KEY.trim(),
    })

    if (result.error) {
      errors.push(`openai: ${result.error}`)
    } else {
      models.push(...result.models)
      providers.push({
        provider: 'openai',
        source: 'environment',
        count: result.models.length,
      })
    }
  }

  const uniqueModels = Array.from(
    new Map(models.map((model) => [`${model.provider}:${model.id}`, model])).values()
  ).sort((a, b) => a.id.localeCompare(b.id))

  return NextResponse.json({
    models: uniqueModels,
    providers,
    errors,
  })
}
