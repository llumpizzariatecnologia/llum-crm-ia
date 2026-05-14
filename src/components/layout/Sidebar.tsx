'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BookOpen,
  BrainCircuit,
  FileText,
  Headphones,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Radio,
  Send,
  Settings,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navSections = [
  {
    label: 'Operacao',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/inbox', label: 'Inbox', icon: MessageSquare },
      { href: '/leads', label: 'Leads', icon: UserPlus },
      { href: '/handoffs', label: 'Handoffs', icon: Headphones },
      { href: '/logs', label: 'Logs', icon: FileText },
    ],
  },
  {
    label: 'IA',
    items: [
      { href: '/ai/agent', label: 'Agente', icon: BrainCircuit },
      { href: '/ai/knowledge', label: 'Base de Conhecimento', icon: BookOpen },
    ],
  },
  {
    label: 'Canais',
    items: [
      { href: '/channels/whatsapp', label: 'WhatsApp Ops', icon: Radio },
      { href: '/channels/templates', label: 'Templates Meta', icon: Send },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      { href: '/integrations', label: 'Integracoes', icon: KeyRound },
      { href: '/settings', label: 'Configuracoes Gerais', icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="hidden w-[288px] shrink-0 border-r border-[#dfe7f0] bg-[#f6f9fc] xl:flex xl:flex-col">
      <div className="border-b border-[#dfe7f0] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1c1e54] text-white shadow-[0_12px_30px_rgba(28,30,84,0.24)]">
            <span className="text-sm font-semibold tracking-[-0.03em]">LL</span>
          </div>
          <div>
            <p className="text-sm font-medium text-[#0d253d]">LLUM CRM IA</p>
            <p className="text-xs text-[#64748d]">WhatsApp, IA e operacao auditavel</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-5">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7a8ca2]">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive =
                    item.href === '/'
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const Icon = item.icon

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition',
                        isActive
                          ? 'bg-white text-[#0d253d] shadow-[0_12px_30px_rgba(13,37,61,0.08)]'
                          : 'text-[#5e6d82] hover:bg-white hover:text-[#0d253d]'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4',
                          isActive ? 'text-[#533afd]' : 'text-[#7a8ca2]'
                        )}
                      />
                      <span>{item.label}</span>
                      {isActive ? <span className="ml-auto h-2 w-2 rounded-full bg-[#533afd]" /> : null}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-[#dfe7f0] p-4">
        <button
          onClick={logout}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#cad6e4] bg-white px-4 text-sm font-medium text-[#0d253d] transition hover:border-[#533afd] hover:text-[#533afd]"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}
