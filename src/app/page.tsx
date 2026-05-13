'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Clock3,
  Headphones,
  Mail,
  MessageSquare,
  UserPlus,
  Users,
} from 'lucide-react'
import { fetchJson } from '@/lib/client'
import type { AgentRun, ConversationWithCustomer, DashboardStats } from '@/types/database'

function StatCard({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  detail?: string
}) {
  return (
    <div className="surface-card p-5">
      <div className="mb-5 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
          <Icon className="h-5 w-5" />
        </div>
        {detail ? (
          <span className="rounded-full border border-[#d8e1ef] bg-[#f8fbff] px-2.5 py-1 text-[11px] font-medium text-[#64748d]">
            {detail}
          </span>
        ) : null}
      </div>
      <p className="metric-value text-[#0d253d]">{value}</p>
      <p className="mt-1 text-sm text-[#64748d]">{label}</p>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [conversations, setConversations] = useState<ConversationWithCustomer[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void fetchJson<{
      stats: DashboardStats
      conversations: ConversationWithCustomer[]
      runs: AgentRun[]
    }>('/api/dashboard')
      .then((data) => {
        if (!active) return
        setStats(data.stats)
        setConversations(data.conversations)
        setRuns(data.runs)
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#533afd] border-t-transparent" />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="p-8">
        <div className="surface-card p-6">
          <p className="text-sm text-[#ea2261]">{error || 'Falha ao carregar o dashboard.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1380px] px-6 py-8 xl:px-10">
      <section className="surface-card overflow-hidden p-6 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-[#dce4ef] bg-[#f6f9fc] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#533afd]">
              Operação em tempo real
            </span>
            <h1 className="heading-display max-w-3xl">
              Atendimento, IA e handoff em um painel que dá para confiar.
            </h1>
            <p className="max-w-2xl text-[15px] leading-7 text-[#5e6d82]">
              O CRM agora roda em cima de rotas próprias, com observabilidade, persistência e ações reais para a equipe da LLUM tocar a operação.
            </p>
          </div>

          <div className="rounded-[28px] bg-[radial-gradient(circle_at_top_left,#d8d9ff_0%,#eef3ff_25%,#f7f9fc_70%)] p-5">
            <div className="rounded-[22px] border border-[#dce4ef] bg-white/90 p-5 shadow-[0_12px_32px_rgba(13,37,61,0.08)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7a8ca2]">saúde operacional</p>
                  <p className="mt-1 text-lg font-medium text-[#0d253d]">LLUM WhatsApp Pipeline</p>
                </div>
                <span className="rounded-full bg-[#e7f8ed] px-3 py-1 text-[11px] font-medium text-[#17884b]">
                  Online
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  ['Inbox ativa', `${stats.activeConversations} conversas abertas`],
                  ['Fila humana', `${stats.pendingHandoffs} handoffs pendentes`],
                  ['IA respondendo', `${stats.aiResponseRate}% de sucesso recente`],
                ].map(([title, copy]) => (
                  <div key={title} className="flex items-center justify-between rounded-2xl border border-[#e5ebf3] bg-[#f8fbff] px-4 py-3">
                    <span className="text-sm text-[#425466]">{title}</span>
                    <span className="text-sm font-medium text-[#0d253d]">{copy}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Conversas ativas" value={stats.activeConversations} icon={MessageSquare} />
        <StatCard label="Mensagens não lidas" value={stats.unreadMessages} icon={Mail} />
        <StatCard label="Handoffs pendentes" value={stats.pendingHandoffs} icon={Headphones} />
        <StatCard label="Leads novos" value={stats.newLeads} icon={UserPlus} />
        <StatCard label="Em qualificação" value={stats.qualifyingLeads} icon={Users} />
        <StatCard label="Taxa de resposta da IA" value={`${stats.aiResponseRate}%`} icon={Bot} />
        <StatCard label="Erros nas últimas 24h" value={stats.errorsLast24h} icon={AlertTriangle} />
        <StatCard label="Tempo médio de resposta" value={`${stats.avgResponseTime}ms`} icon={Clock3} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e7edf5] px-6 py-5">
            <div>
              <h2 className="heading-card">Conversas recentes</h2>
              <p className="mt-1 text-sm text-[#64748d]">O que entrou por último no CRM</p>
            </div>
            <a href="/inbox" className="inline-flex items-center gap-2 rounded-full border border-[#d5deea] px-3 py-1.5 text-xs font-medium text-[#533afd]">
              Ver inbox <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="divide-y divide-[#edf2f7]">
            {conversations.map((conversation) => (
              <a
                key={conversation.id}
                href={`/inbox?conversation=${conversation.id}`}
                className="flex items-center gap-4 px-6 py-4 transition hover:bg-[#f8fbff]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef3ff] text-sm font-medium text-[#533afd]">
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
                    {conversation.last_message_preview || 'Sem prévia'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-[#425466]">{conversation.current_intent || 'sem intenção'}</p>
                  <p className="mt-1 text-[11px] text-[#7a8ca2]">{conversation.status}</p>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-card">Últimas runs</h2>
                <p className="text-sm text-[#64748d]">Classificação e decisão da IA</p>
              </div>
            </div>

            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="rounded-2xl border border-[#e6edf5] bg-[#f8fbff] px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0d253d]">
                        {run.intent || run.task}
                      </p>
                      <p className="mt-1 text-xs text-[#64748d]">
                        {run.model || 'sem modelo'} · {run.latency_ms || 0}ms
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                        run.status === 'success'
                          ? 'bg-[#e7f8ed] text-[#17884b]'
                          : 'bg-[#ffe8ef] text-[#c7245d]'
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
