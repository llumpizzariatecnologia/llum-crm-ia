'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { fetchJson } from '@/lib/client'

type CrmSettingsForm = {
  assistantName: string
  tone: string
  aiEnabled: boolean
  handoffMessage: string
  businessContext: string
  closingMessage?: string
}

export function ClosingMessageCard() {
  const [settings, setSettings] = useState<CrmSettingsForm | null>(null)
  const [closingMessage, setClosingMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const data = await fetchJson<{ settings: CrmSettingsForm }>('/api/settings')
        if (!active) return
        setSettings(data.settings)
        setClosingMessage(data.settings.closingMessage || '')
      } catch (err) {
        if (active) setError((err as Error).message)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  async function save() {
    if (!settings) return
    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const payload = {
        ...settings,
        closingMessage,
      }

      const data = await fetchJson<{ settings: CrmSettingsForm }>('/api/settings', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setSettings(data.settings)
      setClosingMessage(data.settings.closingMessage || '')
      setMessage('Mensagem de encerramento salva.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="surface-card p-6">
      <h2 className="heading-card">Mensagem de encerramento</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748d]">
        Quando o operador encerrar uma conversa, este texto serÃ¡ enviado ao cliente automaticamente.
      </p>

      <textarea
        rows={4}
        value={closingMessage}
        onChange={(event) => setClosingMessage(event.target.value)}
        className="mt-4 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 py-3 text-sm leading-6 text-[#0d253d] outline-none transition focus:border-[#533afd]"
      />

      {message ? <div className="mt-4 rounded-2xl border border-[#dcefe3] bg-[#f2fbf5] px-4 py-3 text-sm text-[#17884b]">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-[#fde5ee] bg-[#fff7fa] px-4 py-3 text-sm text-[#c7245d]">{error}</div> : null}

      <button
        onClick={save}
        disabled={saving || !settings}
        className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#533afd] px-5 text-sm font-medium text-white transition hover:bg-[#4434d4] disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar mensagem
      </button>
    </div>
  )
}
