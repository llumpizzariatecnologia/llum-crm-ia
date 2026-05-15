'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2, Radio, Save, ShieldCheck } from 'lucide-react'
import { fetchJson } from '@/lib/client'

type ChannelConfig = {
  id?: string
  displayName: string
  phoneNumberId: string
  wabaId: string
  webhookUrl: string
  graphApiVersion: string
  verifiedName: string
  qualityRating: string
  splitLongMessages: boolean
  maxMessageChars: number
  splitMessageDelaySeconds: number
  status: 'draft' | 'connected' | 'attention' | 'disconnected'
}

type Integration = {
  provider: string
  status: string
  masked_preview: string | null
  last_validated_at?: string | null
}

type WhatsappEnvironment = {
  integrationId: string
  channelConfigId: string | null
  label: string
  displayName: string
  phoneNumberId: string | null
  wabaId: string | null
  webhookUrl: string | null
  status: string
  isActive: boolean
  hasAccessToken: boolean
  hasAppSecret: boolean
  verifyTokenPreview: string | null
  maskedAccessToken: string | null
}

const emptyConfig: ChannelConfig = {
  displayName: 'LLUM WhatsApp Oficial',
  phoneNumberId: '',
  wabaId: '',
  webhookUrl: '',
  graphApiVersion: 'v20.0',
  verifiedName: '',
  qualityRating: '',
  splitLongMessages: true,
  maxMessageChars: 300,
  splitMessageDelaySeconds: 1,
  status: 'draft',
}

export default function WhatsappPage() {
  const [config, setConfig] = useState<ChannelConfig>(emptyConfig)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [environments, setEnvironments] = useState<WhatsappEnvironment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reloadConfig = useCallback(async () => {
    const configData = await fetchJson<{ config: ChannelConfig }>('/api/whatsapp/config')
    setConfig(configData.config)
  }, [])

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const [configData, integrationData, envsData] = await Promise.all([
          fetchJson<{ config: ChannelConfig }>('/api/whatsapp/config'),
          fetchJson<{ integrations: Integration[] }>('/api/integrations'),
          fetchJson<{ environments: WhatsappEnvironment[] }>('/api/whatsapp/environments'),
        ])
        if (!active) return
        setConfig(configData.config)
        setIntegrations(integrationData.integrations)
        setEnvironments(envsData.environments)
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

  async function activateEnvironment(integrationId: string) {
    setActivatingId(integrationId)
    setError(null)
    setMessage(null)
    try {
      const data = await fetchJson<{ environments: WhatsappEnvironment[] }>(
        '/api/whatsapp/environments',
        {
          method: 'POST',
          body: JSON.stringify({ integrationId }),
        }
      )
      setEnvironments(data.environments)
      await reloadConfig()
      const activated = data.environments.find((env) => env.integrationId === integrationId)
      setMessage(`Ambiente "${activated?.label || 'WhatsApp'}" ativado. Saídas usam este número.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setActivatingId(null)
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const data = await fetchJson<{ config: ChannelConfig }>('/api/whatsapp/config', {
        method: 'POST',
        body: JSON.stringify(config),
      })
      setConfig(data.config)
      setMessage('Configuração do canal WhatsApp salva.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const whatsappIntegration = integrations.find((item) => item.provider === 'whatsapp')

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
        <span className="inline-flex rounded-full border border-[#dce4ef] bg-[#f6f9fc] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#533afd]">
          Canais
        </span>
        <h1 className="mt-4 text-[34px] font-light tracking-[-0.04em] text-[#0d253d] md:text-[46px]">
          WhatsApp Ops
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#5e6d82]">
          Separação entre segredo de integração e operação do canal: número, WABA, webhook, qualidade e estado do ambiente.
        </p>
      </section>

      {message ? <div className="mt-4 rounded-2xl border border-[#dcefe3] bg-[#f2fbf5] px-4 py-3 text-sm text-[#17884b]">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-[#fde5ee] bg-[#fff7fa] px-4 py-3 text-sm text-[#c7245d]">{error}</div> : null}

      {environments.length > 0 ? (
        <section className="surface-card mt-6 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="heading-card">Ambientes WhatsApp</h2>
              <p className="mt-1 text-sm text-[#64748d]">
                O ambiente ativo é usado para enviar respostas e aparece nos formulários abaixo. Webhooks recebidos de qualquer número configurado continuam funcionando.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {environments.map((env) => {
              const active = env.isActive
              return (
                <div
                  key={env.integrationId}
                  className={`rounded-[26px] border px-5 py-4 transition ${
                    active
                      ? 'border-[#533afd] bg-[#f5f7ff] shadow-[0_10px_28px_rgba(83,58,253,0.08)]'
                      : 'border-[#e3eaf3] bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {active ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#533afd]" />
                      ) : (
                        <Circle className="mt-0.5 h-5 w-5 text-[#cad6e4]" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-[#0d253d]">{env.label}</p>
                        <p className="text-xs text-[#7a8ca2]">{env.displayName}</p>
                      </div>
                    </div>
                    {active ? (
                      <span className="rounded-full bg-[#533afd] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white">
                        Ativo
                      </span>
                    ) : (
                      <button
                        onClick={() => activateEnvironment(env.integrationId)}
                        disabled={activatingId !== null}
                        className="rounded-full border border-[#cad6e4] bg-white px-3 py-1 text-xs font-medium text-[#0d253d] transition hover:border-[#533afd] hover:text-[#533afd] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {activatingId === env.integrationId ? 'Ativando…' : 'Ativar'}
                      </button>
                    )}
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-1 text-xs text-[#5e6d82]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#7a8ca2]">Phone ID</dt>
                      <dd className="font-mono text-[11px] text-[#0d253d]">{env.phoneNumberId || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#7a8ca2]">WABA</dt>
                      <dd className="font-mono text-[11px] text-[#0d253d]">{env.wabaId || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#7a8ca2]">Verify token</dt>
                      <dd className="font-mono text-[11px] text-[#0d253d]">{env.verifyTokenPreview || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#7a8ca2]">Access token</dt>
                      <dd className="font-mono text-[11px] text-[#0d253d]">{env.maskedAccessToken || '—'}</dd>
                    </div>
                    {env.webhookUrl ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#7a8ca2]">Webhook</dt>
                        <dd className="truncate text-[11px] text-[#0d253d]" title={env.webhookUrl}>
                          {env.webhookUrl}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="surface-card p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Nome interno do canal</label>
              <input value={config.displayName} onChange={(event) => setConfig({ ...config, displayName: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Status operacional</label>
              <select value={config.status} onChange={(event) => setConfig({ ...config, status: event.target.value as ChannelConfig['status'] })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]">
                <option value="draft">Draft</option>
                <option value="connected">Connected</option>
                <option value="attention">Attention</option>
                <option value="disconnected">Disconnected</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Phone Number ID</label>
              <input value={config.phoneNumberId} onChange={(event) => setConfig({ ...config, phoneNumberId: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">WABA ID</label>
              <input value={config.wabaId} onChange={(event) => setConfig({ ...config, wabaId: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Graph API version</label>
              <input value={config.graphApiVersion} onChange={(event) => setConfig({ ...config, graphApiVersion: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Verified name</label>
              <input value={config.verifiedName} onChange={(event) => setConfig({ ...config, verifiedName: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-[#425466]">Webhook URL</label>
            <input value={config.webhookUrl} onChange={(event) => setConfig({ ...config, webhookUrl: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-[#425466]">Quality rating</label>
            <input value={config.qualityRating} onChange={(event) => setConfig({ ...config, qualityRating: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
          </div>

          <div className="mt-6 rounded-[26px] border border-[#e6edf5] bg-[#f8fbff] p-5">
            <div className="flex items-start gap-3">
              <input
                id="splitLongMessages"
                type="checkbox"
                checked={config.splitLongMessages}
                onChange={(event) =>
                  setConfig({ ...config, splitLongMessages: event.target.checked })
                }
                className="mt-1 h-4 w-4 rounded border border-[#cad6e4] accent-[#533afd]"
              />
              <div>
                <label
                  htmlFor="splitLongMessages"
                  className="text-sm font-medium text-[#0d253d]"
                >
                  Dividir mensagens longas
                </label>
                <p className="mt-1 text-sm leading-6 text-[#64748d]">
                  Divide automaticamente respostas grandes em partes menores para o
                  WhatsApp ficar mais natural.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">
                  Tamanho maximo por mensagem
                </label>
                <input
                  type="number"
                  min={120}
                  max={1200}
                  value={config.maxMessageChars}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      maxMessageChars: Number(event.target.value) || 300,
                    })
                  }
                  disabled={!config.splitLongMessages}
                  className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd] disabled:opacity-60"
                />
                <p className="mt-1 text-xs leading-5 text-[#7a8ca2]">
                  Recomendado: 300 caracteres.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">
                  Tempo entre blocos
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={config.splitMessageDelaySeconds}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      splitMessageDelaySeconds: Number(event.target.value) || 0,
                    })
                  }
                  disabled={!config.splitLongMessages}
                  className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd] disabled:opacity-60"
                />
                <p className="mt-1 text-xs leading-5 text-[#7a8ca2]">
                  Intervalo em segundos entre uma parte e outra.
                </p>
              </div>
            </div>
          </div>

          <button onClick={save} disabled={saving} className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#533afd] px-5 text-sm font-medium text-white transition hover:bg-[#4434d4] disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar operação do canal
          </button>
        </section>

        <aside className="space-y-6">
          <div className="surface-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-card">Segredo do provedor</h2>
                <p className="text-sm text-[#64748d]">Permanece em Integrações.</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[#e6edf5] bg-[#f8fbff] px-4 py-3">
              <p className="text-sm font-medium text-[#0d253d]">{whatsappIntegration?.status || 'pendente'}</p>
              <p className="mt-1 text-xs text-[#64748d]">{whatsappIntegration?.masked_preview || 'Conecte a credencial do WhatsApp em Integrações.'}</p>
            </div>
          </div>

          <div className="surface-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <Radio className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-card">Disciplina de domínio</h2>
                <p className="text-sm text-[#64748d]">Canal não é prompt.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[#425466]">
              <p>Webhook, WABA e quality rating pertencem à operação do canal.</p>
              <p>Token e validação oficial pertencem à camada de integração.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
