import 'server-only'

import { NextResponse } from 'next/server'
import { readSession } from '@/lib/auth'

export async function requireApiSession() {
  const session = await readSession()
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }),
    }
  }

  return { ok: true as const, session }
}
