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
  const isPublicPage = pathname === '/' || pathname.startsWith('/api/') || pathname.startsWith('/onboarding') || pathname.startsWith('/actualizar-ficha');

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
    const authorizedRoles = ['ADMIN', 'HR', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'ASSISTANT'];

    // OPTIMIZATION: Only double check with DB if role is missing from metadata
    // We trust metadata for performance. Role updates should refresh the session.
    if (!role) {
      const { createClient: createAdmin } = await import('@supabase/supabase-js');
      const adminSupabase = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // 1. Check User Table
      let { data: dbUser } = await adminSupabase.from('users').select('role').eq('id', user.id).single();
      if (dbUser?.role) role = dbUser.role;

      // 2. Check Personnel Table (Automatic by Position UUID)
      if (!role && user.email) {
        const { data: personnel } = await adminSupabase
          .from('personnel')
          .select('main_position')
          .eq('email', user.email.trim().toLowerCase())
          .maybeSingle();
        
        if (personnel) {
          const ASSISTANT_UUID = '62575116-4546-44a7-bb06-d0e3a8ad4df9';
          const AIRPORT_ASSISTANT_UUID = '9a266902-5fce-425f-bca5-6c46787de302';
          const SUPERVISOR_UUID = '17153543-abd7-43d1-9d0d-93b2353967d0';

          if (personnel.main_position === ASSISTANT_UUID) role = 'ASSISTANT';
          else if (personnel.main_position === SUPERVISOR_UUID) role = 'SUPERVISOR';
          else if (personnel.main_position === AIRPORT_ASSISTANT_UUID) role = 'AIRPORT_ASSISTANT';
        }
      }
    }
    
    if (!role) role = 'USER';

    if (isAuthPage || isPublicPage) {
      const url = request.nextUrl.clone();
      if (role === 'ADMIN' || role === 'HR') {
        url.pathname = '/dashboard';
      } else if (role === 'SUPERVISOR' || role === 'ASSISTANT') {
        url.pathname = '/role-selection';
      } else if (role === 'AIRPORT_ASSISTANT') {
        url.pathname = '/worker';
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
      const isMarcela = user.email?.toUpperCase().includes('MARCELA');
      
      // 1. Basic auth check
      if (!authorizedRoles.includes(role) && !isMarcela) {
        const url = request.nextUrl.clone();
        url.pathname = '/worker';
        return NextResponse.redirect(url);
      }

      // 2. Granular role protection
      if (isAdminOnlyPath && role !== 'ADMIN' && role !== 'HR' && !isMarcela) {
        const url = request.nextUrl.clone();
        // Redirect non-admins to their specific dashboard or worker view
        url.pathname = (role === 'SUPERVISOR') ? '/supervisor' : 
                       (role === 'AIRPORT_ASSISTANT' || role === 'ADMIN' || role === 'HR') ? '/dashboard' : 
                       '/worker';
        return NextResponse.redirect(url);
      }
    }

    // Supervisor path protection
    if (pathname.startsWith('/supervisor')) {
      const isMarcela = user.email?.toUpperCase().includes('MARCELA');
      if (role !== 'SUPERVISOR' && role !== 'ADMIN' && role !== 'AIRPORT_ASSISTANT' && !isMarcela) {
        const url = request.nextUrl.clone();
        url.pathname = '/worker';
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
