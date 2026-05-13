'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  Headphones,
  KeyRound,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Users,
  Webhook,
} from 'lucide-react'
import { fetchJson } from '@/lib/client'
import type { DiagnosticsSnapshot } from '@/types/database'

function SnapshotCard({
  title,
  icon: Icon,
  data,
  highlightKey,
}: {
  title: string
  icon: React.ElementType
  data: Record<string, unknown> | null
  highlightKey: string
}) {
  return (
    <div className="rounded-[24px] border border-[#e4ebf4] bg-white p-4 shadow-[0_10px_28px_rgba(13,37,61,0.05)]">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-medium text-[#0d253d]">{title}</p>
      </div>
      {data ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#0d253d]">{String(data[highlightKey] || '—')}</p>
          <div className="space-y-1 text-xs leading-5 text-[#64748d]">
            {Object.entries(data)
              .filter(([key]) => key !== highlightKey)
              .slice(0, 4)
              .map(([key, value]) => (
                <p key={key}>
                  <span className="text-[#7a8ca2]">{key}:</span> {String(value ?? '—')}
                </p>
              ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[#7a8ca2]">Nenhum registro ainda.</p>
      )}
    </div>
  )
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<DiagnosticsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const diagnostics = await fetchJson<DiagnosticsSnapshot>('/api/diagnostics')
    setData(diagnostics)
  }

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const diagnostics = await fetchJson<DiagnosticsSnapshot>('/api/diagnostics')
        if (!active) return
        setData(diagnostics)
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

  async function runAction(action: 'simulate' | 'test-ai' | 'test-send') {
    if (!data) return
    setBusy(action)
    setError(null)
    try {
      if (action === 'simulate') {
        await fetchJson('/api/diagnostics/simulate', {
          method: 'POST',
          body: JSON.stringify({
            customerName: 'Cliente Diagnóstico',
            phone: '+5541999991234',
            body: 'Quero falar com atendente e saber sobre reserva para hoje',
          }),
        })
      } else if (action === 'test-ai') {
        await fetchJson('/api/diagnostics/test-ai', { method: 'POST' })
      } else if (action === 'test-send') {
        const conversationId =
          (data.last_conversation?.id as string | undefined) || undefined
        if (!conversationId) {
          throw new Error('Nenhuma conversa disponível para testar envio.')
        }
        await fetchJson('/api/diagnostics/test-send', {
          method: 'POST',
          body: JSON.stringify({ conversationId }),
        })
      }
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (loading || !data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#533afd] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 xl:px-10">
      <section className="surface-card p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="heading-sub">Diagnóstico do pipeline</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#64748d]">
              Aqui a equipe consegue confirmar rapidamente se webhook, IA, lead, handoff e outbound estão se comportando como esperado.
            </p>
          </div>
          <button
            onClick={() => void load().catch((err: Error) => setError(err.message))}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#cad6e4] bg-white px-5 text-sm font-medium text-[#0d253d] transition hover:border-[#533afd] hover:text-[#533afd]"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </section>

      {error ? (
        <div className="mt-4 rounded-2xl border border-[#fde5ee] bg-[#fff7fa] px-4 py-3 text-sm text-[#c7245d]">
          {error}
        </div>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ['Tempo médio', `${data.avg_response_time_ms}ms`],
          ['Erros 24h', `${data.errors_last_24h}`],
          [
            'Integrações ativas',
            `${data.integrations.filter((item) => item.status === 'active').length}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="surface-card p-5">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#7a8ca2]">{label}</p>
            <p className="mt-3 text-3xl font-light tracking-[-0.04em] text-[#0d253d]">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <div className="mb-4 flex items-center gap-3">
          <Activity className="h-5 w-5 text-[#533afd]" />
          <h2 className="text-lg font-medium text-[#0d253d]">Snapshots operacionais</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SnapshotCard title="Último webhook" icon={Webhook} data={data.last_webhook as Record<string, unknown> | null} highlightKey="processing_result" />
          <SnapshotCard title="Última conversa" icon={MessageSquare} data={data.last_conversation as Record<string, unknown> | null} highlightKey="status" />
          <SnapshotCard title="Última inbound" icon={ArrowDownLeft} data={data.last_inbound as Record<string, unknown> | null} highlightKey="body" />
          <SnapshotCard title="Última outbound" icon={ArrowUpRight} data={data.last_outbound as Record<string, unknown> | null} highlightKey="body" />
          <SnapshotCard title="Última run IA" icon={Bot} data={data.last_ai_run as Record<string, unknown> | null} highlightKey="intent" />
          <SnapshotCard title="Último lead" icon={Users} data={data.last_lead as Record<string, unknown> | null} highlightKey="intent" />
          <SnapshotCard title="Último handoff" icon={Headphones} data={data.last_handoff as Record<string, unknown> | null} highlightKey="reason" />
          <SnapshotCard title="Último erro" icon={AlertTriangle} data={data.last_error as Record<string, unknown> | null} highlightKey="error" />
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="surface-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-[#533afd]" />
            <div>
              <h2 className="heading-card">Secrets e ambiente</h2>
              <p className="text-sm text-[#64748d]">Checklist mínimo do backend</p>
            </div>
          </div>
          <div className="grid gap-2">
            {Object.entries(data.secrets).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-2xl border border-[#e4ebf4] bg-[#f8fbff] px-4 py-3">
                <span className="text-sm text-[#425466]">{key}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    value ? 'bg-[#e7f8ed] text-[#17884b]' : 'bg-[#fff7fa] text-[#c7245d]'
                  }`}
                >
                  {value ? 'ok' : 'faltando'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <Send className="h-5 w-5 text-[#533afd]" />
            <div>
              <h2 className="heading-card">Testes manuais</h2>
              <p className="text-sm text-[#64748d]">Ações rápidas para validar o fluxo ponta a ponta</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['simulate', 'Simular inbound', 'Cria conversa, classifica, gera lead/handoff e outbound.'],
              ['test-ai', 'Testar IA', 'Roda um cenário comercial completo pelo orquestrador.'],
              ['test-send', 'Testar envio', 'Tenta enviar uma resposta para a última conversa disponível.'],
            ].map(([key, title, copy]) => (
              <button
                key={key}
                onClick={() => void runAction(key as 'simulate' | 'test-ai' | 'test-send')}
                disabled={busy !== null}
                className="rounded-[24px] border border-[#dfe7f0] bg-[#f8fbff] p-4 text-left transition hover:border-[#533afd] hover:bg-white disabled:opacity-60"
              >
                <p className="text-sm font-medium text-[#0d253d]">{title}</p>
                <p className="mt-2 text-sm leading-6 text-[#64748d]">{copy}</p>
                <div className="mt-4 text-xs font-medium text-[#533afd]">
                  {busy === key ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Executando
                    </span>
                  ) : (
                    'Executar'
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
