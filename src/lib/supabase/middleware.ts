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

  const isAuthPage = pathname.startsWith('/login') || pathname.endsWith('/login');
  const isPublicPage = pathname === '/';

  if (!user && !isAuthPage && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user) {
    let role = user.user_metadata?.role;
    const managementPaths = [
      '/dashboard', '/personnel', '/transport', '/shifts', 
      '/leaves', '/reports', '/documents', '/settings'
    ];
    const isManagementPath = managementPaths.some(p => pathname.startsWith(p));
    const authorizedRoles = ['ADMIN', 'HR', 'SUPERVISOR', 'AIRPORT_ASSISTANT'];

    // If attempting to access management OR role is missing, double check with DB
    if (isManagementPath || !role) {
      const { createClient: createAdmin } = await import('@supabase/supabase-js');
      const adminSupabase = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Try ID first, fallback to Email
      let { data: dbUser } = await adminSupabase.from('users').select('role').eq('id', user.id).single();
      
      if (!dbUser && user.email) {
        const { data: emailUser } = await adminSupabase.from('users').select('role').eq('email', user.email).single();
        dbUser = emailUser;
      }

      if (dbUser?.role) role = dbUser.role;
    }
    
    if (!role) role = 'USER';

    if (isAuthPage || isPublicPage) {
      const url = request.nextUrl.clone();
      if (role === 'ADMIN' || role === 'HR') {
        url.pathname = '/dashboard';
      } else if (role === 'SUPERVISOR' || role === 'AIRPORT_ASSISTANT') {
        url.pathname = '/role-selection';
      } else {
        url.pathname = '/worker';
      }
      return NextResponse.redirect(url);
    }

    // Define restricted paths per role
    const adminOnlyPaths = ['/personnel', '/documents', '/settings', '/dashboard', '/shifts/roster'];
    const isAdminOnlyPath = adminOnlyPaths.some(p => pathname.startsWith(p));

    // Role Selection & Management Path Protection
    if (pathname.startsWith('/role-selection') || isManagementPath) {
      // 1. Basic auth check
      if (!authorizedRoles.includes(role)) {
        const url = request.nextUrl.clone();
        url.pathname = '/worker';
        return NextResponse.redirect(url);
      }

      // 2. Granular role protection
      if (isAdminOnlyPath && role !== 'ADMIN' && role !== 'HR') {
        const url = request.nextUrl.clone();
        // Redirect non-admins to their specific dashboard or worker view
        url.pathname = role === 'SUPERVISOR' ? '/supervisor' : '/worker';
        return NextResponse.redirect(url);
      }
    }

    // Supervisor path protection
    if (pathname.startsWith('/supervisor') && role !== 'SUPERVISOR' && role !== 'ADMIN') {
      const url = request.nextUrl.clone();
      url.pathname = '/worker';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
