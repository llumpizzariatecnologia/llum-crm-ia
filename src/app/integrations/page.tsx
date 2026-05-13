'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, Shield } from 'lucide-react'
import { fetchJson } from '@/lib/client'

const providerConfigs: Record<
  string,
  { label: string; icon: string; fields: { key: string; label: string; placeholder: string }[] }
> = {
  openai: {
    label: 'OpenAI',
    icon: 'AI',
    fields: [{ key: 'api_key', label: 'API Key', placeholder: 'sk-...' }],
  },
  anthropic: {
    label: 'Anthropic',
    icon: 'AN',
    fields: [{ key: 'api_key', label: 'API Key', placeholder: 'sk-ant-...' }],
  },
  groq: {
    label: 'Groq',
    icon: 'GQ',
    fields: [{ key: 'api_key', label: 'API Key', placeholder: 'gsk_...' }],
  },
  openrouter: {
    label: 'OpenRouter',
    icon: 'OR',
    fields: [{ key: 'api_key', label: 'API Key', placeholder: 'sk-or-...' }],
  },
  deepseek: {
    label: 'DeepSeek',
    icon: 'DS',
    fields: [{ key: 'api_key', label: 'API Key', placeholder: 'sk-...' }],
  },
  whatsapp: {
    label: 'WhatsApp Official',
    icon: 'WA',
    fields: [
      { key: 'access_token', label: 'Access token', placeholder: 'EAAx...' },
      { key: 'phone_number_id', label: 'Phone Number ID', placeholder: '108149...' },
      { key: 'waba_id', label: 'WABA ID', placeholder: '264223...' },
      { key: 'app_secret', label: 'App Secret', placeholder: 'Meta app secret' },
      { key: 'verify_token', label: 'Verify Token', placeholder: 'Token do webhook' },
    ],
  },
}

type SavedIntegration = {
  id: string
  provider: string
  status: string
  masked_preview: string | null
  last_validated_at: string | null
  validation_error?: string | null
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<SavedIntegration[]>([])
  const [addingProvider, setAddingProvider] = useState<string | null>(null)
  const [integrationForm, setIntegrationForm] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingIntegration, setSavingIntegration] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const integrationsResponse = await fetchJson<{ integrations: SavedIntegration[] }>('/api/integrations')
    setIntegrations(integrationsResponse.integrations)
  }

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const integrationsResponse = await fetchJson<{ integrations: SavedIntegration[] }>('/api/integrations')
        if (!active) return
        setIntegrations(integrationsResponse.integrations)
      } catch (err) {
        if (active) setError((err as Error).message)
      } finally {
        if (active) setLoading(false)
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [])

  async function saveIntegration() {
    if (!addingProvider) return
    setSavingIntegration(true)
    setError(null)
    setMessage(null)
    try {
      await fetchJson('/api/integrations', {
        method: 'POST',
        body: JSON.stringify({
          provider: addingProvider,
          credentials: integrationForm,
        }),
      })
      setAddingProvider(null)
      setIntegrationForm({})
      await load()
      setMessage('Integração validada e salva.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingIntegration(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#533afd] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8 xl:px-10">
      <section className="surface-card p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="inline-flex rounded-full border border-[#dce4ef] bg-[#f6f9fc] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#533afd]">
              Plataforma
            </span>
            <h1 className="mt-4 text-[34px] font-light tracking-[-0.04em] text-[#0d253d] md:text-[46px]">
              Integrações
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#5e6d82]">
              Ambiente exclusivo para credenciais, validação backend e storage cifrado. Comportamento do agente e operação do canal não moram aqui.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#dfe7f0] bg-[#f8fbff] px-3 py-1.5 text-xs font-medium text-[#64748d]">
            <Shield className="h-3.5 w-3.5" />
            AES-256-GCM
          </span>
        </div>
      </section>

      {message ? <div className="mt-4 rounded-2xl border border-[#dcefe3] bg-[#f2fbf5] px-4 py-3 text-sm text-[#17884b]">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-[#fde5ee] bg-[#fff7fa] px-4 py-3 text-sm text-[#c7245d]">{error}</div> : null}

      <section className="mt-6 surface-card p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="heading-card">Providers conectáveis</h2>
            <p className="text-sm text-[#64748d]">Cada provider valida no backend antes de persistir.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(providerConfigs).map(([key, provider]) => {
            const existing = integrations.find((item) => item.provider === key)
            return (
              <div key={key} className="rounded-[24px] border border-[#e4ebf4] bg-[#f8fbff] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-xs font-semibold text-[#533afd]">
                    {provider.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#0d253d]">{provider.label}</p>
                    <p className="text-xs text-[#64748d]">{existing?.masked_preview || 'não conectado'}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${existing ? 'bg-[#e7f8ed] text-[#17884b]' : 'bg-white text-[#7a8ca2] border border-[#d8e3ef]'}`}>
                    {existing ? existing.status : 'pendente'}
                  </span>
                  <button onClick={() => { setAddingProvider(key); setIntegrationForm({}) }} className="text-xs font-medium text-[#533afd]">
                    {existing ? 'Atualizar' : 'Conectar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {addingProvider ? (
          <div className="mt-6 rounded-[28px] border border-[#dfe7f0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#0d253d]">Conectar {providerConfigs[addingProvider]?.label}</p>
                <p className="text-xs text-[#64748d]">Só a camada de credenciais vive nesta área.</p>
              </div>
              <button onClick={() => setAddingProvider(null)} className="text-xs font-medium text-[#64748d]">
                Cancelar
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {providerConfigs[addingProvider]?.fields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1.5 block text-xs font-medium text-[#425466]">{field.label}</label>
                  <input type="password" value={integrationForm[field.key] || ''} onChange={(event) => setIntegrationForm({ ...integrationForm, [field.key]: event.target.value })} placeholder={field.placeholder} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
                </div>
              ))}
            </div>

            <button onClick={saveIntegration} disabled={savingIntegration} className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d253d] px-5 text-sm font-medium text-white transition hover:bg-[#1c1e54] disabled:opacity-60">
              {savingIntegration ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Validar e salvar integração
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
