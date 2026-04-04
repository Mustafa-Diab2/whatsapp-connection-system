import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Get the path
    const path = request.nextUrl.pathname;
    const searchParams = request.nextUrl.searchParams.toString();

    // 🕊️ FOOLPROOF BYPASS - These must NEVER be restricted
    const isPublicFile = path === '/sw.js' || 
                         path === '/manifest.json' || 
                         path === '/favicon.ico' || 
                         path === '/offline.html' || 
                         path.startsWith('/icons/') || 
                         path.startsWith('/_next/') || 
                         path.startsWith('/api/');

    if (isPublicFile) {
        return NextResponse.next();
    }

    const isPublicPath = path === '/login' || path === '/register';
    const token = request.cookies.get('token')?.value;

    if (!isPublicPath && !token) {
        const url = new URL('/login', request.url);
        url.searchParams.set('callback', path + (searchParams ? '?' + searchParams : ''));
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
         * - sw.js (PWA service worker)
         * - manifest.json (PWA manifest)
         * - icons/ (PWA icons)
         * - offline.html (PWA offline page)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|offline.html|icons|.+[.].+).*)',
    ],
}
