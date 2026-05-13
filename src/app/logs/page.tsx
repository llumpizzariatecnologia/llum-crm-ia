'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, MessageSquareMore, Send, Webhook, type LucideIcon } from 'lucide-react'
import { fetchJson } from '@/lib/client'
import type { AgentRun, Interaction, WebhookEvent, WhatsappSend } from '@/types/database'
import { cn } from '@/lib/utils'

type LogsResponse = {
  runs: AgentRun[]
  webhooks: WebhookEvent[]
  interactions: Interaction[]
  sends: WhatsappSend[]
}

type LogTab = 'runs' | 'webhooks' | 'messages' | 'sends'

type SummaryCard = {
  icon: LucideIcon
  label: string
  value: number
}

export default function LogsPage() {
  const [tab, setTab] = useState<LogTab>('runs')
  const [data, setData] = useState<LogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void fetchJson<LogsResponse>('/api/logs')
      .then((response) => active && setData(response))
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    switch (tab) {
      case 'runs':
        return data.runs
      case 'webhooks':
        return data.webhooks
      case 'messages':
        return data.interactions
      case 'sends':
        return data.sends
    }
  }, [data, tab])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#533afd] border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="surface-card p-6">
          <p className="text-sm text-[#ea2261]">{error || 'Falha ao carregar logs.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1380px] px-6 py-8 xl:px-10">
      <section className="surface-card p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="heading-sub">Logs e rastreabilidade</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#64748d]">
              Entradas da Meta, mensagens persistidas, execuções de IA e tentativas de envio ficam centralizadas aqui.
            </p>
          </div>
          <div className="grid min-w-[320px] gap-3 sm:grid-cols-4">
            {[
              { icon: Bot, label: 'Runs', value: data.runs.length },
              { icon: Webhook, label: 'Webhooks', value: data.webhooks.length },
              { icon: MessageSquareMore, label: 'Mensagens', value: data.interactions.length },
              { icon: Send, label: 'Envios', value: data.sends.length },
            ].map(({ icon: Icon, label, value }: SummaryCard) => (
              <div key={label} className="rounded-2xl border border-[#e4ebf4] bg-[#f8fbff] px-4 py-3">
                <Icon className="h-4 w-4 text-[#533afd]" />
                <p className="mt-3 text-2xl font-light tracking-[-0.04em] text-[#0d253d]">{value}</p>
                <p className="text-xs text-[#7a8ca2]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 surface-card overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {[
              ['runs', 'Agent runs'],
              ['webhooks', 'Webhooks'],
              ['messages', 'Mensagens'],
              ['sends', 'Envios'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key as LogTab)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition',
                  tab === key
                    ? 'bg-[#533afd] text-white'
                    : 'border border-[#d5deea] bg-white text-[#64748d] hover:text-[#0d253d]'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f8fbff] text-xs uppercase tracking-[0.08em] text-[#7a8ca2]">
              <tr>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Contexto</th>
                <th className="px-6 py-4">Resultado</th>
                <th className="px-6 py-4">Quando</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7]">
              {rows.map((row: AgentRun | WebhookEvent | Interaction | WhatsappSend) => {
                if (tab === 'runs') {
                  const run = row as AgentRun
                  return (
                    <tr key={run.id}>
                      <td className="px-6 py-4 font-medium text-[#0d253d]">{run.task}</td>
                      <td className="px-6 py-4 text-[#425466]">{run.intent || run.model || 'sem contexto'}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            run.status === 'success'
                              ? 'bg-[#e7f8ed] text-[#17884b]'
                              : 'bg-[#fff7fa] text-[#c7245d]'
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[#64748d]">
                        {new Date(run.created_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  )
                }

                if (tab === 'webhooks') {
                  const webhook = row as WebhookEvent
                  return (
                    <tr key={webhook.id}>
                      <td className="px-6 py-4 font-medium text-[#0d253d]">{webhook.event_type || 'evento'}</td>
                      <td className="px-6 py-4 text-[#425466]">{webhook.wa_id || webhook.external_message_id}</td>
                      <td className="px-6 py-4 text-[#64748d]">{webhook.processing_result || 'sem resultado'}</td>
                      <td className="px-6 py-4 text-[#64748d]">
                        {new Date(webhook.created_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  )
                }

                if (tab === 'messages') {
                  const interaction = row as Interaction
                  return (
                    <tr key={interaction.id}>
                      <td className="px-6 py-4 font-medium text-[#0d253d]">{interaction.direction}</td>
                      <td className="px-6 py-4 text-[#425466]">{interaction.body || 'sem conteúdo'}</td>
                      <td className="px-6 py-4 text-[#64748d]">{interaction.sender_type}</td>
                      <td className="px-6 py-4 text-[#64748d]">
                        {new Date(interaction.created_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  )
                }

                const send = row as WhatsappSend
                return (
                  <tr key={send.id}>
                    <td className="px-6 py-4 font-medium text-[#0d253d]">WhatsApp send</td>
                    <td className="px-6 py-4 text-[#425466]">{send.message_body || 'sem corpo'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          send.status === 'sent' || send.status === 'simulated'
                            ? 'bg-[#e7f8ed] text-[#17884b]'
                            : 'bg-[#fff7fa] text-[#c7245d]'
                        }`}
                      >
                        {send.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[#64748d]">
                      {new Date(send.created_at).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-[#7a8ca2]">
            <AlertTriangle className="h-4 w-4" />
            Nenhum registro nesta aba.
          </div>
        ) : null}
      </section>
    </div>
  )
}
