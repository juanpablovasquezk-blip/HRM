import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Deprecate old login pages
  if (pathname === '/worker/login' || pathname === '/supervisor/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthPage = pathname.startsWith('/login') || pathname.endsWith('/login');
  const isPublicPage = pathname === '/';

  if (!user && !isAuthPage && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user) {
    const role = user.user_metadata?.role || 'USER';

    // If on login or root, redirect to the appropriate home
    if (isAuthPage || isPublicPage) {
      const url = request.nextUrl.clone();
      if (role === 'ADMIN' || role === 'HR') {
        url.pathname = '/dashboard';
      } else if (role === 'SUPERVISOR') {
        url.pathname = '/role-selection'; // Choice for supervisors
      } else {
        url.pathname = '/worker';
      }
      return NextResponse.redirect(url);
    }

    // Role Selection access
    if (pathname.startsWith('/role-selection') && role !== 'SUPERVISOR' && role !== 'ADMIN') {
      const url = request.nextUrl.clone();
      url.pathname = role === 'ADMIN' || role === 'HR' ? '/dashboard' : '/worker';
      return NextResponse.redirect(url);
    }

    // Path Protection
    if (pathname.startsWith('/dashboard') && role !== 'ADMIN' && role !== 'HR') {
      const url = request.nextUrl.clone();
      url.pathname = role === 'SUPERVISOR' ? '/supervisor' : '/worker';
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith('/supervisor') && role !== 'SUPERVISOR' && role !== 'ADMIN') {
      const url = request.nextUrl.clone();
      url.pathname = '/worker';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
