import { NextRequest, NextResponse } from 'next/server'
import { createSession, isAuthorizedLogin } from '@/lib/auth'
import { loginSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''
  let email = ''
  let password = ''
  let nextPath = '/'

  if (contentType.includes('application/json')) {
    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    email = String(body.email || '')
    password = String(body.password || '')
    nextPath = String(body.next || '/')
  } else {
    const formData = await request.formData()
    email = String(formData.get('email') || '')
    password = String(formData.get('password') || '')
    nextPath = String(formData.get('next') || '/')
  }

  const parsed = loginSchema.safeParse({ email, password })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 400 })
  }

  const isValid = await isAuthorizedLogin(parsed.data.email, parsed.data.password)
  if (!isValid) {
    return NextResponse.json({ error: 'Email ou senha incorretos' }, { status: 401 })
  }

  await createSession(parsed.data.email)

  if (contentType.includes('application/json')) {
    return NextResponse.json({ ok: true, redirectTo: nextPath })
  }

  return NextResponse.redirect(new URL(nextPath, request.url), { status: 303 })
}
