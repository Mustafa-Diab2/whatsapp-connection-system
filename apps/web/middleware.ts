import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Get the path
    const path = request.nextUrl.pathname;

    // Define public paths that don't need authentication
    const isPublicPath = path === '/login' || path === '/register';

    // Get the token from cookies (Authentication relies on cookies for middleware usually)
    // Since we rely on localStorage in client, middleware can't fully protect standard JWT in localStorage
    // BUT: We can fix the crash first.

    // For now, to allow the app to load without crashing, we will pass through.
    // The client-side check in AppShell will still handle redirects but we made it safer.
    // If we want real middleware protection, we must store token in Cookies upon login.

    // Let's keep it simple: Just allow headers adjustment if needed or simple redirects.

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}
