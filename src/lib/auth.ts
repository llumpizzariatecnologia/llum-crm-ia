import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { jwtVerify, SignJWT } from 'jose'
import { AUTH_COOKIE_NAME } from '@/lib/constants'

type SessionPayload = {
  sub: string
  email: string
  role: 'admin'
}

const encoder = new TextEncoder()

function getSessionSecret() {
  return process.env.CRM_SESSION_SECRET || process.env.ENCRYPTION_KEY || 'llum-local-dev-secret'
}

function getAdminEmail() {
  return process.env.CRM_ADMIN_EMAIL || 'admin@llum.local'
}

function getAdminPassword() {
  return process.env.CRM_ADMIN_PASSWORD || 'llum-admin-123'
}

async function getJwtKey() {
  return encoder.encode(getSessionSecret())
}

export async function createSession(email: string) {
  const token = await new SignJWT({ role: 'admin', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(await getJwtKey())

  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete(AUTH_COOKIE_NAME)
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, await getJwtKey(), {
      algorithms: ['HS256'],
    })

    if (!payload.sub || !payload.email) return null

    return {
      sub: String(payload.sub),
      email: String(payload.email),
      role: 'admin',
    }
  } catch {
    return null
  }
}

export async function requireSession() {
  const session = await readSession()
  if (!session) redirect('/login')
  return session
}

export async function isAuthorizedLogin(email: string, password: string) {
  return email === getAdminEmail() && password === getAdminPassword()
}

export function getAuthHints() {
  return {
    email: getAdminEmail(),
    password: getAdminPassword(),
  }
}
