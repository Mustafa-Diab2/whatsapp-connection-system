import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Get the path
    const path = request.nextUrl.pathname;

    const isPublicPath = path === '/login' || path === '/register';

    // Get the token from cookies
    const token = request.cookies.get('token')?.value;

    // If it's a private path and there's no token, redirect to login with callback URL
    if (!isPublicPath && !token) {
        const url = new URL('/login', request.url);
        url.searchParams.set('callback', path);
        return NextResponse.redirect(url);
    }

    // If it's an auth page and there's a token, redirect to connection page (unless it's the connect page itself)
    if (isPublicPath && token) {
        return NextResponse.redirect(new URL('/whatsapp-connect', request.url));
    }

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
