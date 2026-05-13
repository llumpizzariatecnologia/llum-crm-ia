'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock3, Headphones, UserRoundCheck } from 'lucide-react'
import { fetchJson } from '@/lib/client'
import type { HandoffWithRelations } from '@/types/database'

export default function HandoffsPage() {
  const router = useRouter()
  const [handoffs, setHandoffs] = useState<HandoffWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const data = await fetchJson<{ handoffs: HandoffWithRelations[] }>('/api/handoffs')
    setHandoffs(data.handoffs)
  }

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const data = await fetchJson<{ handoffs: HandoffWithRelations[] }>('/api/handoffs')
        if (!active) return
        setHandoffs(data.handoffs)
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

  const stats = useMemo(() => {
    return {
      pending: handoffs.filter((item) => item.status === 'pending').length,
      inProgress: handoffs.filter((item) => item.status === 'in_progress').length,
      resolved: handoffs.filter((item) => item.status === 'resolved').length,
    }
  }, [handoffs])

  async function updateHandoff(handoffId: string, action: 'claim' | 'resolve') {
    setBusyId(handoffId)
    setError(null)
    try {
      const response = await fetchJson<{ conversationId?: string }>(`/api/handoffs/${handoffId}/claim`, {
        method: 'POST',
        body: JSON.stringify(action === 'resolve' ? { action: 'resolve' } : {}),
      })
      if (action === 'claim' && response.conversationId) {
        router.push(`/inbox?conversation=${response.conversationId}`)
        return
      }
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyId(null)
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
    <div className="mx-auto max-w-[1320px] px-6 py-8 xl:px-10">
      <section className="surface-card p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="heading-sub">Handoffs humanos</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#64748d]">
              Toda conversa que saiu do fluxo automático cai aqui com contexto e status operacional.
            </p>
          </div>
          <div className="grid min-w-[320px] gap-3 sm:grid-cols-3">
            {[
              ['Pendentes', stats.pending],
              ['Em andamento', stats.inProgress],
              ['Resolvidos', stats.resolved],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[#e4ebf4] bg-[#f8fbff] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[#7a8ca2]">{label}</p>
                <p className="mt-2 text-2xl font-light tracking-[-0.04em] text-[#0d253d]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-4 rounded-2xl border border-[#fde5ee] bg-[#fff7fa] px-4 py-3 text-sm text-[#c7245d]">
          {error}
        </div>
      ) : null}

      <section className="mt-6 grid gap-4">
        {handoffs.map((handoff) => {
          const pending = handoff.status === 'pending'
          const inProgress = handoff.status === 'in_progress'
          const disabled = busyId === handoff.id
          return (
            <article key={handoff.id} className="surface-card p-5">
              <div className="flex flex-wrap items-start gap-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef2ff] text-sm font-medium text-[#533afd]">
                  {handoff.customers?.name?.slice(0, 1) || '?'}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-medium text-[#0d253d]">
                      {handoff.customers?.name || 'Contato sem nome'}
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        pending
                          ? 'bg-[#fff3dd] text-[#a85a05]'
                          : inProgress
                            ? 'bg-[#eef2ff] text-[#533afd]'
                            : 'bg-[#e7f8ed] text-[#17884b]'
                      }`}
                    >
                      {handoff.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#64748d]">{handoff.customers?.phone}</p>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[#425466]">
                    {handoff.reason || 'Sem motivo registrado'}
                  </p>
                </div>

                <div className="min-w-[220px] rounded-2xl border border-[#e4ebf4] bg-[#f8fbff] px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-[#64748d]">
                    <Clock3 className="h-3.5 w-3.5" />
                    solicitado em{' '}
                    {new Date(handoff.requested_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {pending ? (
                  <button
                    onClick={() => updateHandoff(handoff.id, 'claim')}
                    disabled={disabled}
                    className="rounded-full bg-[#533afd] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4434d4] disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Headphones className="h-4 w-4" />
                      Assumir atendimento
                    </span>
                  </button>
                ) : null}
                {inProgress ? (
                  <button
                    onClick={() => updateHandoff(handoff.id, 'resolve')}
                    disabled={disabled}
                    className="rounded-full border border-[#cad6e4] bg-white px-4 py-2 text-sm font-medium text-[#0d253d] transition hover:border-[#533afd] hover:text-[#533afd] disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2">
                      <UserRoundCheck className="h-4 w-4" />
                      Marcar como resolvido
                    </span>
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}

        {handoffs.length === 0 ? (
          <div className="surface-card p-10 text-center text-sm text-[#64748d]">
            Nenhum handoff no momento.
          </div>
        ) : null}
      </section>
    </div>
  )
}
