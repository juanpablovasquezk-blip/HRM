import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminClient = createAdminClient();
    const supabase = await createClient();

    // 1. Find Carlos Tobar's user_id in the database to be absolutely sure
    const { data: personnel, error: personnelError } = await supabase
      .from('personnel')
      .select('user_id, rut')
      .eq('email', 'ctobar@minerquim.cl')
      .maybeSingle();

    if (personnelError) {
      throw new Error(`Error buscando personal: ${personnelError.message}`);
    }
    if (!personnel) {
      throw new Error('No se encontró a Carlos Tobar en la tabla de personal.');
    }
    if (!personnel.user_id) {
      throw new Error('Carlos Tobar no tiene un usuario de autenticación vinculado.');
    }

    const cleanRut = personnel.rut.replace(/[.-]/g, '').toUpperCase(); // '102730836'

    // 2. Update password in Supabase Auth on production
    const { data: authData, error: authError } = await adminClient.auth.admin.updateUserById(
      personnel.user_id,
      { password: cleanRut }
    );

    if (authError) {
      throw new Error(`Error en Supabase Auth: ${authError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Contraseña para ctobar@minerquim.cl restablecida con éxito al RUT limpio: ${cleanRut}`,
      userId: personnel.user_id
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      stack: err.stack
    }, { status: 500 });
  }
}
