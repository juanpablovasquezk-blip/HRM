import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes (handled separately)
     * - public assets
     * - PWA / TWA technical files (manifest.json, sw.js, .well-known/assetlinks.json)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|manifest\\.json$|sw\\.js$|\\.well-known/assetlinks\\.json$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
