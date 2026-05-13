import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE_NAME } from '@/lib/constants'

const PUBLIC_PATHS = ['/login']
const PUBLIC_API_PATHS = ['/api/auth/login', '/api/whatsapp/webhook']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublicRoute = PUBLIC_PATHS.some((path) => pathname === path)
  const isPublicApi = PUBLIC_API_PATHS.some((path) => pathname.startsWith(path))

  const sessionCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value

  if (!sessionCookie && !isPublicRoute && !isPublicApi) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (sessionCookie && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
