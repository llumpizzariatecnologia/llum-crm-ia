'use client'

import { useEffect, useState } from 'react'
import { Bot, Loader2, Save, Sparkles } from 'lucide-react'
import { fetchJson } from '@/lib/client'

const SYSTEM_PROMPT_LIMIT = 12000
const BUSINESS_CONTEXT_LIMIT = 3000
const HANDOFF_MESSAGE_LIMIT = 500

type AgentProfileForm = {
  id?: string
  name: string
  description: string
  assistantName: string
  tone: string
  systemPrompt: string
  businessContext: string
  handoffMessage: string
  model: string
  temperature: number
  aiEnabled: boolean
  handoffOnUnknown: boolean
  maxResponseChars: number
  status: 'draft' | 'active' | 'archived'
}

const defaultAgentProfileInput: AgentProfileForm = {
  name: 'LLUM Atendimento Principal',
  description: 'Perfil operacional padrao para atendimento inbound da LLUM.',
  assistantName: 'Marcos',
  tone: 'acolhedor, simpatico, claro e objetivo',
  systemPrompt:
    'Voce e o agente principal da LLUM Pizzaria. Responda com clareza, naturalidade e sem inventar precos, promocoes, disponibilidade ou politicas. Quando faltar seguranca, faca handoff.',
  businessContext:
    'Atendimento da LLUM Pizzaria via WhatsApp com foco em cardapio, reservas, horarios, precos, espaco kids e suporte humano.',
  handoffMessage:
    'Perfeito! Vou chamar um atendente da LLUM pra te ajudar melhor. Enquanto isso, se quiser, ja pode me mandar mais detalhes por aqui.',
  model: 'gpt-4.1-mini',
  temperature: 0.2,
  aiEnabled: true,
  handoffOnUnknown: true,
  maxResponseChars: 420,
  status: 'active',
}

export default function AgentPage() {
  const [form, setForm] = useState<AgentProfileForm>(defaultAgentProfileInput)
  const [profiles, setProfiles] = useState<AgentProfileForm[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const systemPromptLength = form.systemPrompt.length
  const businessContextLength = form.businessContext.length
  const handoffMessageLength = form.handoffMessage.length
  const systemPromptTooLong = systemPromptLength > SYSTEM_PROMPT_LIMIT
  const businessContextTooLong = businessContextLength > BUSINESS_CONTEXT_LIMIT
  const handoffMessageTooLong = handoffMessageLength > HANDOFF_MESSAGE_LIMIT
  const formHasLengthError = systemPromptTooLong || businessContextTooLong || handoffMessageTooLong

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const data = await fetchJson<{ profiles: AgentProfileForm[]; primary: AgentProfileForm }>('/api/agent')
        if (!active) return
        setProfiles(data.profiles)
        setForm(data.primary)
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
    if (formHasLengthError) {
      setMessage(null)
      if (systemPromptTooLong) {
        setError(`System prompt excedeu o limite de ${SYSTEM_PROMPT_LIMIT} caracteres (${systemPromptLength}/${SYSTEM_PROMPT_LIMIT}).`)
        return
      }
      if (businessContextTooLong) {
        setError(`Contexto de negocio excedeu o limite de ${BUSINESS_CONTEXT_LIMIT} caracteres (${businessContextLength}/${BUSINESS_CONTEXT_LIMIT}).`)
        return
      }
      setError(`Mensagem de handoff excedeu o limite de ${HANDOFF_MESSAGE_LIMIT} caracteres (${handoffMessageLength}/${HANDOFF_MESSAGE_LIMIT}).`)
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const data = await fetchJson<{ profile: AgentProfileForm; profiles: AgentProfileForm[] }>('/api/agent', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setForm(data.profile)
      setProfiles(data.profiles)
      setMessage('Perfil do agente salvo com sucesso.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full border border-[#dce4ef] bg-[#f6f9fc] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#533afd]">
              IA
            </span>
            <h1 className="mt-4 text-[34px] font-light tracking-[-0.04em] text-[#0d253d] md:text-[46px]">
              Agente de IA
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#5e6d82]">
              Aqui fica o comportamento do agente: persona, prompt principal, modelo, handoff e limites de resposta.
            </p>
          </div>

          <div className="rounded-[24px] border border-[#dfe7f0] bg-[#f8fbff] px-4 py-3 text-sm text-[#425466]">
            {profiles.length} perfil(is) no workspace
          </div>
        </div>
      </section>

      {message ? <div className="mt-4 rounded-2xl border border-[#dcefe3] bg-[#f2fbf5] px-4 py-3 text-sm text-[#17884b]">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-[#fde5ee] bg-[#fff7fa] px-4 py-3 text-sm text-[#c7245d]">{error}</div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="surface-card p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Nome do perfil</label>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Nome do assistente</label>
              <input value={form.assistantName} onChange={(event) => setForm({ ...form, assistantName: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Descricao operacional</label>
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Modelo</label>
              <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Status</label>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AgentProfileForm['status'] })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]">
                <option value="active">Ativo</option>
                <option value="draft">Draft</option>
                <option value="archived">Arquivado</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Temperatura</label>
              <input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Maximo de caracteres</label>
              <input type="number" min="120" max="4000" step="10" value={form.maxResponseChars} onChange={(event) => setForm({ ...form, maxResponseChars: Number(event.target.value) })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-[#425466]">Tom</label>
            <input value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="block text-xs font-medium text-[#425466]">System prompt</label>
              <span className={`text-xs ${systemPromptTooLong ? 'font-medium text-[#c7245d]' : 'text-[#7a8ca2]'}`}>
                {systemPromptLength}/{SYSTEM_PROMPT_LIMIT}
              </span>
            </div>
            <textarea rows={8} value={form.systemPrompt} onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })} className={`w-full rounded-2xl border bg-white px-4 py-3 text-sm leading-6 text-[#0d253d] outline-none transition ${systemPromptTooLong ? 'border-[#f3a5bf] focus:border-[#c7245d]' : 'border-[#cad6e4] focus:border-[#533afd]'}`} />
            {systemPromptTooLong ? <p className="mt-2 text-xs text-[#c7245d]">Reduza o texto para salvar esse perfil.</p> : null}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="block text-xs font-medium text-[#425466]">Contexto de negocio</label>
              <span className={`text-xs ${businessContextTooLong ? 'font-medium text-[#c7245d]' : 'text-[#7a8ca2]'}`}>
                {businessContextLength}/{BUSINESS_CONTEXT_LIMIT}
              </span>
            </div>
            <textarea rows={6} value={form.businessContext} onChange={(event) => setForm({ ...form, businessContext: event.target.value })} className={`w-full rounded-2xl border bg-white px-4 py-3 text-sm leading-6 text-[#0d253d] outline-none transition ${businessContextTooLong ? 'border-[#f3a5bf] focus:border-[#c7245d]' : 'border-[#cad6e4] focus:border-[#533afd]'}`} />
            {businessContextTooLong ? <p className="mt-2 text-xs text-[#c7245d]">Esse campo tambem precisa ficar dentro do limite para salvar.</p> : null}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="block text-xs font-medium text-[#425466]">Mensagem de handoff</label>
              <span className={`text-xs ${handoffMessageTooLong ? 'font-medium text-[#c7245d]' : 'text-[#7a8ca2]'}`}>
                {handoffMessageLength}/{HANDOFF_MESSAGE_LIMIT}
              </span>
            </div>
            <textarea rows={4} value={form.handoffMessage} onChange={(event) => setForm({ ...form, handoffMessage: event.target.value })} className={`w-full rounded-2xl border bg-white px-4 py-3 text-sm leading-6 text-[#0d253d] outline-none transition ${handoffMessageTooLong ? 'border-[#f3a5bf] focus:border-[#c7245d]' : 'border-[#cad6e4] focus:border-[#533afd]'}`} />
            {handoffMessageTooLong ? <p className="mt-2 text-xs text-[#c7245d]">Encurta essa mensagem para concluir o salvamento.</p> : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <button onClick={() => setForm({ ...form, aiEnabled: !form.aiEnabled })} className="flex items-center justify-between rounded-2xl border border-[#e4ebf4] bg-[#f8fbff] px-4 py-3 text-left">
              <div>
                <p className="text-sm font-medium text-[#0d253d]">IA ativa</p>
                <p className="text-xs text-[#64748d]">Liga ou desliga as respostas automaticas.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${form.aiEnabled ? 'bg-[#e7f8ed] text-[#17884b]' : 'border border-[#d8e3ef] bg-white text-[#7a8ca2]'}`}>{form.aiEnabled ? 'ativa' : 'pausada'}</span>
            </button>

            <button onClick={() => setForm({ ...form, handoffOnUnknown: !form.handoffOnUnknown })} className="flex items-center justify-between rounded-2xl border border-[#e4ebf4] bg-[#f8fbff] px-4 py-3 text-left">
              <div>
                <p className="text-sm font-medium text-[#0d253d]">Handoff no desconhecido</p>
                <p className="text-xs text-[#64748d]">Escala para humano quando faltar seguranca.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${form.handoffOnUnknown ? 'bg-[#e7f8ed] text-[#17884b]' : 'border border-[#d8e3ef] bg-white text-[#7a8ca2]'}`}>{form.handoffOnUnknown ? 'ligado' : 'desligado'}</span>
            </button>
          </div>

          <button onClick={save} disabled={saving || formHasLengthError} className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#533afd] px-5 text-sm font-medium text-white transition hover:bg-[#4434d4] disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar perfil do agente
          </button>
        </section>

        <aside className="space-y-6">
          <div className="surface-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-card">Perfis existentes</h2>
                <p className="text-sm text-[#64748d]">Use como base sem misturar canais.</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {profiles.length === 0 ? <p className="text-sm text-[#7a8ca2]">Nenhum perfil salvo ainda.</p> : null}
              {profiles.map((profile) => (
                <button key={profile.id || profile.name} onClick={() => setForm(profile)} className="w-full rounded-2xl border border-[#e6edf5] bg-[#f8fbff] px-4 py-3 text-left">
                  <p className="text-sm font-medium text-[#0d253d]">{profile.name}</p>
                  <p className="mt-1 text-xs text-[#64748d]">{profile.model} - {profile.status}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-card">Separacao correta</h2>
                <p className="text-sm text-[#64748d]">Prompt nao e base de conhecimento.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[#425466]">
              <p>Agente define comportamento, limites e voz.</p>
              <p>Knowledge define fatos confiaveis para resposta.</p>
              <p>Templates e canal ficam fora do prompt operacional.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
