import { NextResponse, type NextRequest } from 'next/server';

// Only checks that cookies exist. The API still validates the session on
// every call, this just avoids flashing screens to logged-out users.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has('pos_session');
  const hasDevice = req.cookies.has('pos_device');
  const go = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (pathname.startsWith('/dashboard') && !hasSession) return go('/login');

  // tills and kitchen screens fall back to the PIN lock screen
  if ((pathname.startsWith('/pos') || pathname.startsWith('/kitchen')) && !hasSession) {
    return go(hasDevice ? '/lock' : '/login');
  }

  if (pathname === '/lock' && !hasDevice) return go(hasSession ? '/pos' : '/login');

  if (pathname === '/login' && hasSession) return go('/dashboard');

  if (pathname === '/onboarding' && !req.cookies.has('pos_signup')) {
    return go(hasSession ? '/dashboard' : '/login');
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/pos/:path*',
    '/kitchen/:path*',
    '/lock',
    '/login',
    '/onboarding',
  ],
};
