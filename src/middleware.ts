import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Dev auth bypass — local development only, never set in production
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Dev auth bypass — skip all auth checks
  if (DEV_AUTH_BYPASS) {
    return NextResponse.next({ request: { headers: request.headers } })
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Always refresh the session — this handles token refresh and cookie propagation
  // IMPORTANT: must run for ALL routes including /auth/callback so cookies are set properly
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Skip auth redirects for public paths.
  // /api/rufus-qna* validates its own Bearer token (rufus_extension_api_key)
  // instead of Supabase session cookies — without this exclusion, curl/scripts
  // hit 307 → /login before the route handler ever runs.
  const isPublicPath = pathname.startsWith('/login') || pathname.startsWith('/auth/callback') || pathname.startsWith('/api/health') || pathname.startsWith('/api/rufus-qna')
  if (isPublicPath) {
    // Logged in + on login page → redirect to dashboard
    if (user && pathname === '/login') {
      const dashboardUrl = new URL('/dashboard', request.url)
      return NextResponse.redirect(dashboardUrl)
    }
    return response
  }

  // No session + protected route → redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
