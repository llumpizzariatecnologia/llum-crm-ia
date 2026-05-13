'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Users } from 'lucide-react'
import { fetchJson } from '@/lib/client'
import { LEAD_STATUS_LABELS } from '@/lib/constants'
import type { LeadWithRelations } from '@/types/database'

const columns: Array<LeadWithRelations['status']> = [
  'new',
  'qualifying',
  'waiting_customer',
  'handoff_requested',
  'converted_to_reservation',
  'lost',
]

const columnAccent: Record<string, string> = {
  new: '#533afd',
  qualifying: '#0d253d',
  waiting_customer: '#9b6829',
  handoff_requested: '#ea2261',
  converted_to_reservation: '#17884b',
  lost: '#94a3b8',
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void fetchJson<{ leads: LeadWithRelations[] }>('/api/leads')
      .then((data) => active && setLeads(data.leads))
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [])

  const totals = useMemo(() => {
    return {
      total: leads.length,
      active: leads.filter((lead) =>
        ['new', 'qualifying', 'waiting_customer', 'handoff_requested'].includes(lead.status)
      ).length,
      converted: leads.filter((lead) => lead.status === 'converted_to_reservation').length,
    }
  }, [leads])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#533afd] border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="surface-card p-6">
          <p className="text-sm text-[#ea2261]">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8 xl:px-10">
      <section className="surface-card p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="heading-sub">Pipeline de leads</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#64748d]">
              Todo lead gerado pela IA ou pelo handoff humano aparece aqui com contexto da conversa e status comercial.
            </p>
          </div>
          <div className="grid min-w-[280px] gap-3 sm:grid-cols-3">
            {[
              ['Total', totals.total],
              ['Ativos', totals.active],
              ['Convertidos', totals.converted],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[#e5ebf3] bg-[#f8fbff] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[#7a8ca2]">{label}</p>
                <p className="mt-2 text-2xl font-light tracking-[-0.04em] text-[#0d253d]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => {
          const items = leads.filter((lead) => lead.status === column)

          return (
            <div key={column} className="min-h-[600px] w-[320px] shrink-0 rounded-[28px] border border-[#dfe7f0] bg-[#f6f9fc] p-4">
              <div className="mb-4 flex items-center gap-3 px-1">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: columnAccent[column] }}
                />
                <div>
                  <p className="text-sm font-medium text-[#0d253d]">{LEAD_STATUS_LABELS[column]}</p>
                  <p className="text-xs text-[#7a8ca2]">{items.length} lead(s)</p>
                </div>
              </div>

              <div className="space-y-3">
                {items.map((lead) => (
                  <article key={lead.id} className="surface-card rounded-[24px] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef2ff] text-sm font-medium text-[#533afd]">
                        {lead.customers?.name?.slice(0, 1) || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#0d253d]">
                          {lead.customers?.name || 'Contato sem nome'}
                        </p>
                        <p className="mt-1 text-xs text-[#64748d]">{lead.customers?.phone}</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl bg-[#f8fbff] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-[#7a8ca2]">Intenção</p>
                        <p className="mt-1 text-sm text-[#0d253d]">{lead.intent || 'sem intenção'}</p>
                      </div>
                      <p className="text-sm leading-6 text-[#425466]">
                        {lead.summary || 'Lead sem resumo operacional.'}
                      </p>

                      <div className="flex items-center gap-3 text-xs text-[#64748d]">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          score {lead.score}
                        </span>
                        {lead.desired_date ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {lead.desired_date}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}

                {items.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-[#d3dce7] bg-white/70 px-4 py-10 text-center text-sm text-[#7a8ca2]">
                    Nenhum lead nesta etapa.
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
