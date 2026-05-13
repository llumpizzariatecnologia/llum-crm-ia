import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'
import { APP_DESCRIPTION, APP_NAME } from '@/lib/constants'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: `${APP_NAME} — Atendimento Inteligente`,
  description: APP_DESCRIPTION,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
