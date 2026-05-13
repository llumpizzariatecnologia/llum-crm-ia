'use client'

import { useEffect, useState } from 'react'
import { Loader2, Radio, Save, ShieldCheck } from 'lucide-react'
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
  status: 'draft' | 'connected' | 'attention' | 'disconnected'
}

type Integration = {
  provider: string
  status: string
  masked_preview: string | null
  last_validated_at?: string | null
}

const emptyConfig: ChannelConfig = {
  displayName: 'LLUM WhatsApp Oficial',
  phoneNumberId: '',
  wabaId: '',
  webhookUrl: '',
  graphApiVersion: 'v20.0',
  verifiedName: '',
  qualityRating: '',
  status: 'draft',
}

export default function WhatsappPage() {
  const [config, setConfig] = useState<ChannelConfig>(emptyConfig)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const [configData, integrationData] = await Promise.all([
          fetchJson<{ config: ChannelConfig }>('/api/whatsapp/config'),
          fetchJson<{ integrations: Integration[] }>('/api/integrations'),
        ])
        if (!active) return
        setConfig(configData.config)
        setIntegrations(integrationData.integrations)
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
