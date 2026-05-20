import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminClient = createAdminClient();
    const supabase = await createClient();

    // 1. Get personnel record
    const { data: personnel, error: personnelError } = await supabase
      .from('personnel')
      .select('user_id, rut, first_name, last_name_father, is_active')
      .eq('email', 'ctobar@minerquim.cl')
      .maybeSingle();

    if (personnelError) {
      throw new Error(`Error personnel: ${personnelError.message}`);
    }
    if (!personnel) {
      throw new Error('No se encontró a Carlos Tobar en personnel.');
    }

    const cleanRut = personnel.rut.replace(/[.-]/g, '').toUpperCase();

    // 2. Get auth user details via admin API
    const { data: { user: authUser }, error: authError } = await adminClient.auth.admin.getUserById(
      personnel.user_id || '8df2d2a6-e267-4430-b14a-b591cc2cb991'
    );

    if (authError) {
      throw new Error(`Error Auth GetUser: ${authError.message}`);
    }
    if (!authUser) {
      throw new Error('No se encontró el usuario en Supabase Auth.');
    }

    return NextResponse.json({
      success: true,
      personnelRecord: {
        first_name: personnel.first_name,
        last_name_father: personnel.last_name_father,
        rut: personnel.rut,
        cleanRut: cleanRut,
        is_active: personnel.is_active,
        user_id: personnel.user_id
      },
      authUser: {
        id: authUser.id,
        email: authUser.email,
        email_confirmed_at: authUser.email_confirmed_at,
        last_sign_in_at: authUser.last_sign_in_at,
        banned_until: authUser.banned_until,
        user_metadata: authUser.user_metadata,
        app_metadata: authUser.app_metadata
      }
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      stack: err.stack
    }, { status: 500 });
  }
}
