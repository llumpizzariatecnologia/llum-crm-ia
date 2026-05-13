import { redirect } from 'next/navigation'
import { readSession } from '@/lib/auth'
import { APP_NAME } from '@/lib/constants'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ next?: string }>

export default async function LoginPage(props: { searchParams: SearchParams }) {
  const session = await readSession()
  if (session) redirect('/')

  const searchParams = await props.searchParams
  const nextPath = searchParams.next || '/'

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dfe7ff_0%,#f6f9fc_34%,#eef3f8_65%,#ffffff_100%)] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center">
        <section className="grid w-full gap-12 rounded-[28px] border border-[#dfe7f0] bg-white/90 p-6 shadow-[0_24px_70px_rgba(13,37,61,0.08)] backdrop-blur md:grid-cols-[1.15fr_0.85fr] md:p-10">
          <div className="flex flex-col justify-between">
            <div className="space-y-6">
              <span className="inline-flex w-fit items-center rounded-full border border-[#d9e3f0] bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#533afd]">
                Operação protegida
              </span>
              <div className="space-y-4">
                <h1 className="max-w-xl text-[42px] font-light leading-[1.02] tracking-[-0.04em] text-[#0d253d] md:text-[56px]">
                  Entrar no {APP_NAME}
                </h1>
                <p className="max-w-lg text-[15px] leading-7 text-[#5d6f86]">
                  Ambiente interno da LLUM para atendimento via WhatsApp, leads, handoff humano e diagnóstico do pipeline.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Inbox', 'Conversas, reply manual e handoff'],
                ['Leads', 'Qualificação comercial e contexto'],
                ['Logs', 'Rastreabilidade de inbound e outbound'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-2xl border border-[#e6edf5] bg-[#f6f9fc] p-4">
                  <p className="text-sm font-medium text-[#0d253d]">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#64748d]">{copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[#dfe7f0] bg-[#f6f9fc] p-6">
            <form action="/api/auth/login" method="post" className="space-y-5">
              <input type="hidden" name="next" value={nextPath} />
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium text-[#425466]">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue="paulorneto2007@gmail.com"
                  className="h-11 w-full rounded-xl border border-[#cbd7e6] bg-white px-3 text-sm text-[#0d253d] outline-none ring-0 transition focus:border-[#533afd]"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium text-[#425466]">
                  Senha
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  defaultValue="Paulorneto10@"
                  className="h-11 w-full rounded-xl border border-[#cbd7e6] bg-white px-3 text-sm text-[#0d253d] outline-none ring-0 transition focus:border-[#533afd]"
                />
              </div>

              <button
                type="submit"
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#533afd] px-5 text-sm font-medium text-white transition hover:bg-[#4434d4]"
              >
                Entrar no CRM
              </button>

              <p className="rounded-2xl border border-[#e4ebf4] bg-white px-4 py-3 text-xs leading-5 text-[#64748d]">
                Configure `CRM_ADMIN_EMAIL`, `CRM_ADMIN_PASSWORD` e `CRM_SESSION_SECRET` no ambiente para produção.
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
