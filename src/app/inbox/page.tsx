'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Headphones, Phone, Send, Sparkles } from 'lucide-react'
import { fetchJson } from '@/lib/client'
import { CONVERSATION_STATUS_LABELS } from '@/lib/constants'
import type { ConversationWithCustomer, Handoff, Interaction, Lead } from '@/types/database'
import { cn } from '@/lib/utils'

type ConversationDetail = {
  conversation: ConversationWithCustomer
  messages: Interaction[]
  handoff: Handoff | null
  lead: Lead | null
}

const filters = [
  { label: 'Todas', value: 'all' },
  { label: 'IA ativa', value: 'ai_active' },
  { label: 'Handoff', value: 'handoff_requested' },
  { label: 'Humano', value: 'human_active' },
  { label: 'Nao lidas', value: 'unread' },
  { label: 'Fechadas', value: 'closed' },
]

export default function InboxPage() {
  const [conversations, setConversations] = useState<ConversationWithCustomer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('conversation')
  })
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null)
  const [statusTransition, setStatusTransition] = useState<string | null>(null)
  const messageViewportRef = useRef<HTMLDivElement | null>(null)

  const loadConversations = useCallback(async (nextSelectedId?: string | null) => {
    const data = await fetchJson<{ conversations: ConversationWithCustomer[] }>('/api/inbox')
    setConversations(data.conversations)

    if (nextSelectedId) {
      const exists = data.conversations.some((conversation) => conversation.id === nextSelectedId)
      if (exists) {
        setSelectedId(nextSelectedId)
        return
      }
    }

    if (data.conversations[0] && !selectedId) {
      setSelectedId(data.conversations[0].id)
    }
  }, [selectedId])

  const loadDetail = useCallback(async (conversationId: string) => {
    const data = await fetchJson<ConversationDetail>(`/api/inbox/${conversationId}`)
    setDetail(data)
  }, [])

  useEffect(() => {
    let active = true

    const run = async () => {
      try {
        const data = await fetchJson<{ conversations: ConversationWithCustomer[] }>('/api/inbox')
        if (!active) return
        setConversations(data.conversations)
        if (!selectedId && data.conversations[0]) {
          setSelectedId(data.conversations[0].id)
        }
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
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    let active = true

    const run = async () => {
      try {
        const data = await fetchJson<ConversationDetail>(`/api/inbox/${selectedId}`)
        if (!active) return
        setDetail(data)
      } catch (err) {
        if (active) setError((err as Error).message)
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return

    const refreshInbox = async () => {
      try {
        await Promise.all([loadConversations(selectedId), loadDetail(selectedId)])
      } catch (err) {
        setError((err as Error).message)
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshInbox()
    }, 5000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshInbox()
      }
    }

    window.addEventListener('focus', handleVisibilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleVisibilityChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [selectedId, loadConversations, loadDetail])

  useEffect(() => {
    if (!messageViewportRef.current || !detail) return
    messageViewportRef.current.scrollTop = messageViewportRef.current.scrollHeight
  }, [detail, selectedId])

  const filtered = useMemo(() => {
    return conversations.filter((conversation) => {
      if (filter === 'unread') return conversation.unread_count > 0
      if (filter !== 'all' && conversation.status !== filter) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        conversation.customers?.name?.toLowerCase().includes(q) ||
        conversation.customers?.phone?.toLowerCase().includes(q)
      )
    })
  }, [conversations, filter, search])

  async function handleSend() {
    if (!selectedId || !draft.trim()) return
    setSubmitting(true)
    setError(null)
    setStatusFeedback(null)

    try {
      await fetchJson(`/api/conversations/${selectedId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body: draft }),
      })
      setDraft('')
      await Promise.all([loadConversations(selectedId), loadDetail(selectedId)])
      setStatusFeedback('Resposta humana enviada. A IA continua pausada nesta conversa.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleHandoff() {
    if (!selectedId) return
    setSubmitting(true)
    setError(null)
    setStatusFeedback(null)

    try {
      await fetchJson(`/api/conversations/${selectedId}/handoff`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Solicitado pelo operador na inbox' }),
      })
      await Promise.all([loadConversations(selectedId), loadDetail(selectedId)])
      setStatusFeedback('Handoff solicitado. A conversa foi sinalizada para atendimento humano.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function updateStatus(status: 'ai_active' | 'human_active' | 'handoff_requested' | 'closed') {
    if (!selectedId) return
    setSubmitting(true)
    setError(null)
    setStatusFeedback(null)
    setStatusTransition(
      status === 'human_active'
        ? 'Assumindo atendimento e pausando a IA...'
        : status === 'ai_active'
          ? 'Devolvendo a conversa para a IA...'
          : status === 'closed'
            ? 'Encerrando atendimento...'
            : 'Atualizando status da conversa...'
    )

    const previousDetail = detail
    const previousConversations = conversations

    setDetail((current) =>
      current
        ? {
            ...current,
            conversation: {
              ...current.conversation,
              status,
            },
          }
        : current
    )
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === selectedId
          ? {
              ...conversation,
              status,
            }
          : conversation
      )
    )

    try {
      await fetchJson(`/api/conversations/${selectedId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      await Promise.all([loadConversations(selectedId), loadDetail(selectedId)])
      setStatusFeedback(
        status === 'human_active'
          ? 'Atendimento assumido pelo humano. A IA esta pausada nesta conversa.'
          : status === 'ai_active'
            ? 'Conversa devolvida para a IA. Novas mensagens do cliente podem ser respondidas automaticamente.'
            : status === 'closed'
              ? 'Conversa encerrada e mensagem final enviada ao cliente.'
              : 'Status da conversa atualizado.'
      )
    } catch (err) {
      setDetail(previousDetail)
      setConversations(previousConversations)
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
      setStatusTransition(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#533afd] border-t-transparent" />
      </div>
    )
  }

  const isHumanActive = detail?.conversation.status === 'human_active'
  const isAiActive = detail?.conversation.status === 'ai_active'
  const isHandoffRequested = detail?.conversation.status === 'handoff_requested'

  const modeBadgeClass = isHumanActive
    ? 'bg-[#eef2ff] text-[#533afd]'
    : isHandoffRequested
      ? 'bg-[#fff3dd] text-[#a85a05]'
      : isAiActive
        ? 'bg-[#e7f8ed] text-[#17884b]'
        : 'bg-[#eef3f8] text-[#5e6d82]'

  return (
    <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-[#dfe7f0] bg-[#f6f9fc]">
        <div className="border-b border-[#dfe7f0] px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-medium text-[#0d253d]">Inbox</h1>
              <p className="mt-1 text-sm text-[#64748d]">{filtered.length} conversas</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]"
            />

            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition',
                    filter === item.value
                      ? 'bg-[#533afd] text-white'
                      : 'border border-[#d5deea] bg-white text-[#5e6d82] hover:text-[#0d253d]'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-[#e6edf5]">
          {filtered.map((conversation) => {
            const active = conversation.id === selectedId
            return (
              <button
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className={cn(
                  'flex w-full items-start gap-3 px-5 py-4 text-left transition',
                  active ? 'bg-white shadow-[inset_3px_0_0_#533afd]' : 'hover:bg-white/80'
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef2ff] text-sm font-medium text-[#533afd]">
                  {conversation.customers?.name?.slice(0, 1) || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-[#0d253d]">
                      {conversation.customers?.name || 'Contato sem nome'}
                    </p>
                    {conversation.unread_count > 0 ? (
                      <span className="rounded-full bg-[#0d253d] px-2 py-0.5 text-[10px] font-medium text-white">
                        {conversation.unread_count}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-[#64748d]">
                    {conversation.last_message_preview || 'Sem previa'}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[#7a8ca2]">
                    <Phone className="h-3 w-3" />
                    <span>{conversation.customers?.phone || 'sem telefone'}</span>
                    <span>·</span>
                    <span>{conversation.current_intent || 'sem intencao'}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden">
        {detail ? (
          <>
            <header className="border-b border-[#dfe7f0] bg-white px-6 py-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef2ff] text-base font-medium text-[#533afd]">
                  {detail.conversation.customers?.name?.slice(0, 1) || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-medium text-[#0d253d]">
                    {detail.conversation.customers?.name}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm text-[#64748d]">{detail.conversation.customers?.phone}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${modeBadgeClass}`}>
                      {CONVERSATION_STATUS_LABELS[detail.conversation.status] || detail.conversation.status}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleHandoff}
                    disabled={submitting || isHandoffRequested}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70',
                      isHandoffRequested
                        ? 'border-[#ffe1a8] bg-[#fff8ea] text-[#a85a05]'
                        : 'border-[#cad6e4] bg-white text-[#0d253d] hover:border-[#533afd] hover:text-[#533afd]'
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Headphones className="h-4 w-4" />
                      Handoff
                    </span>
                  </button>
                  <button
                    onClick={() => updateStatus('human_active')}
                    disabled={submitting || isHumanActive}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70',
                      isHumanActive
                        ? 'border-[#ccd6ff] bg-[#eef2ff] text-[#533afd]'
                        : 'border-[#cad6e4] bg-white text-[#0d253d] hover:border-[#533afd] hover:text-[#533afd]'
                    )}
                  >
                    Assumir
                  </button>
                  <button
                    onClick={() => updateStatus('ai_active')}
                    disabled={submitting || isAiActive}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70',
                      isAiActive
                        ? 'border-[#d7efdf] bg-[#effaf3] text-[#17884b]'
                        : 'border-[#cad6e4] bg-white text-[#0d253d] hover:border-[#533afd] hover:text-[#533afd]'
                    )}
                  >
                    Devolver para IA
                  </button>
                  <button
                    onClick={() => updateStatus('closed')}
                    disabled={submitting}
                    className="rounded-full bg-[#0d253d] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1c1e54] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Encerrar
                  </button>
                </div>
              </div>

              {statusFeedback ? (
                <div className="mt-4 rounded-2xl border border-[#dce4ef] bg-[#f8fbff] px-4 py-3 text-sm text-[#425466]">
                  {statusFeedback}
                </div>
              ) : null}

              {statusTransition ? (
                <div className="mt-4 rounded-2xl border border-[#ccd6ff] bg-[#f5f7ff] px-4 py-3 text-sm font-medium text-[#3848b5]">
                  {statusTransition}
                </div>
              ) : null}

              {isHumanActive ? (
                <div className="mt-4 rounded-2xl border border-[#ccd6ff] bg-[#eef2ff] px-4 py-3 text-sm text-[#3848b5]">
                  Atendimento humano ativo. A IA esta pausada nesta conversa ate voce devolver o controle.
                </div>
              ) : null}

              {isHandoffRequested ? (
                <div className="mt-4 rounded-2xl border border-[#ffe1a8] bg-[#fff8ea] px-4 py-3 text-sm text-[#8c5a00]">
                  Handoff aberto. A conversa aguarda ou ja esta em transicao para atendimento humano.
                </div>
              ) : null}

              {detail.lead || detail.handoff ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {detail.lead ? (
                    <div className="rounded-2xl border border-[#e4ebf4] bg-[#f8fbff] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.08em] text-[#7a8ca2]">Lead vinculado</p>
                      <p className="mt-1 text-sm font-medium text-[#0d253d]">
                        {detail.lead.intent || 'sem intencao'}
                      </p>
                      <p className="mt-1 text-sm text-[#64748d]">{detail.lead.summary || 'Sem resumo'}</p>
                    </div>
                  ) : null}
                  {detail.handoff ? (
                    <div className="rounded-2xl border border-[#fde5ee] bg-[#fff7fa] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.08em] text-[#c7245d]">Handoff aberto</p>
                      <p className="mt-1 text-sm font-medium text-[#0d253d]">{detail.handoff.reason}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </header>

            <div
              ref={messageViewportRef}
              className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] px-4 py-6 md:px-8"
            >
              <div className="mx-auto max-w-4xl space-y-4">
                {detail.messages.map((message) => {
                  const inbound = message.direction === 'inbound'
                  const ai = message.sender_type === 'ai'

                  return (
                    <div key={message.id} className={cn('flex', inbound ? 'justify-start' : 'justify-end')}>
                      <div
                        className={cn(
                          'max-w-[80%] rounded-[26px] px-4 py-3 text-sm leading-6 shadow-[0_10px_28px_rgba(13,37,61,0.05)]',
                          inbound
                            ? 'rounded-bl-md border border-[#e3eaf3] bg-white text-[#0d253d]'
                            : ai
                              ? 'rounded-br-md bg-[#1c1e54] text-white'
                              : 'rounded-br-md border border-[#d8e3f0] bg-[#eef3f8] text-[#0d253d]'
                        )}
                      >
                        {!inbound ? (
                          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-white/60">
                            {ai ? <Sparkles className="h-3 w-3" /> : null}
                            {ai ? 'IA' : 'Humano'}
                          </div>
                        ) : null}
                        <p>{message.body}</p>
                        <div
                          className={cn(
                            'mt-2 flex items-center gap-1 text-[10px]',
                            inbound ? 'text-[#7a8ca2]' : ai ? 'text-white/60' : 'text-[#64748d]'
                          )}
                        >
                          {inbound ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                          {new Date(message.created_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <footer className="border-t border-[#dfe7f0] bg-white px-6 py-5">
              {error ? <p className="mb-3 text-sm text-[#c7245d]">{error}</p> : null}
              <div className="mx-auto flex max-w-4xl items-center gap-3">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Digite uma resposta manual para o cliente"
                  className="h-12 flex-1 rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]"
                />
                <button
                  onClick={handleSend}
                  disabled={submitting || !draft.trim()}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#533afd] px-5 text-sm font-medium text-white transition hover:bg-[#4434d4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  Enviar
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[#64748d]">Selecione uma conversa para comecar.</p>
          </div>
        )}
      </section>
    </div>
  )
}
