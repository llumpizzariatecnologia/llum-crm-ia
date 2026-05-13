'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isInbox = pathname === '/inbox' || pathname.startsWith('/inbox/')

  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#eef3f8]">
      <Sidebar />
      <main
        className={cn(
          'min-w-0 flex-1 bg-[linear-gradient(180deg,#f6f9fc_0%,#ffffff_100%)]',
          isInbox ? 'overflow-hidden' : 'overflow-y-auto'
        )}
      >
        {children}
      </main>
    </div>
  )
}
