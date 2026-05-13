import Link from 'next/link'
import { BookOpen, BrainCircuit, KeyRound, Radio, Send, ShieldCheck } from 'lucide-react'
import { ClosingMessageCard } from '@/components/settings/ClosingMessageCard'

const setupAreas = [
  {
    href: '/ai/agent',
    title: 'Agente de IA',
    copy: 'Defina persona, prompt principal, modelo, handoff e limites operacionais do agente.',
    icon: BrainCircuit,
  },
  {
    href: '/ai/knowledge',
    title: 'Base de Conhecimento',
    copy: 'Organize FAQs, preços, cardápio, políticas e fatos que a IA pode usar com segurança.',
    icon: BookOpen,
  },
  {
    href: '/channels/whatsapp',
    title: 'WhatsApp Ops',
    copy: 'Concentre webhook, número conectado, WABA, healthcheck e governança do canal.',
    icon: Radio,
  },
  {
    href: '/channels/templates',
    title: 'Templates Meta',
    copy: 'Crie templates com preview, variáveis e checklist local antes de mandar para aprovação.',
    icon: Send,
  },
  {
    href: '/integrations',
    title: 'Integrações',
    copy: 'Mantenha providers e credenciais em um único lugar, com validação e storage cifrado.',
    icon: KeyRound,
  },
]

const platformNotes = [
  'Agente, conhecimento, canal e integração agora são domínios separados.',
  'A tela de settings deixa de ser o lugar onde “cabe tudo”.',
  'O próximo passo natural é ligar knowledge e templates ao runtime do agente.',
]

export default function SettingsPage() {
  const securityItems = [
    { label: 'Admin do CRM', value: process.env.CRM_ADMIN_EMAIL || 'não configurado' },
    {
      label: 'Sessão privada',
      value: process.env.CRM_SESSION_SECRET ? 'configurada' : 'pendente',
    },
    {
      label: 'Criptografia',
      value: process.env.ENCRYPTION_KEY ? 'configurada' : 'usando fallback local',
    },
  ]

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8 xl:px-10">
      <section className="surface-card overflow-hidden p-6 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <span className="inline-flex rounded-full border border-[#dce4ef] bg-[#f6f9fc] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#533afd]">
              Plataforma
            </span>
            <h1 className="mt-4 text-[34px] font-light tracking-[-0.04em] text-[#0d253d] md:text-[46px]">
              Configurações gerais sem misturar operação, IA e canal.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#5e6d82]">
              Esta área agora funciona como painel de arquitetura do produto. Cada domínio crítico tem sua própria superfície e seu próprio ciclo de evolução.
            </p>
          </div>

          <div className="rounded-[28px] border border-[#dfe7f0] bg-[radial-gradient(circle_at_top_left,#dce3ff_0%,#f5f8ff_48%,#ffffff_100%)] p-5">
            <div className="rounded-[22px] border border-[#dce4ef] bg-white/90 p-5 shadow-[0_14px_32px_rgba(13,37,61,0.06)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0d253d]">Saúde de configuração</p>
                  <p className="text-xs text-[#64748d]">Ambiente e acessos base do CRM</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {securityItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-2xl border border-[#e6edf5] bg-[#f8fbff] px-4 py-3"
                  >
                    <span className="text-sm text-[#425466]">{item.label}</span>
                    <span className="text-sm font-medium text-[#0d253d]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {setupAreas.map((area) => {
          const Icon = area.icon
          return (
            <Link
              key={area.href}
              href={area.href}
              className="surface-card group p-6 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(13,37,61,0.08)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-medium text-[#0d253d]">{area.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#64748d]">{area.copy}</p>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.08em] text-[#533afd]">
                Abrir domínio
              </p>
            </Link>
          )
        })}
      </section>

      <section className="mt-6 surface-card p-6">
        <h2 className="heading-card">Princípios desta refatoração</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {platformNotes.map((note) => (
            <div key={note} className="rounded-2xl border border-[#e6edf5] bg-[#f8fbff] p-4 text-sm leading-6 text-[#425466]">
              {note}
            </div>
          ))}
        </div>
      </section>
      <div className="mt-6">
        <ClosingMessageCard />
      </div>
    </div>
  )
}
