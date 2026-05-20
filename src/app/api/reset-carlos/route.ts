import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminClient = createAdminClient();
    const supabase = await createClient();

    const userId = '8df2d2a6-e267-4430-b14a-b591cc2cb991'; // Carlos Tobar's auth user ID
    const correctEmail = 'ctobar@minerquim.cl';
    const cleanRut = '102730836';

    console.log(`Correcting email to ${correctEmail} and password to ${cleanRut} for user ${userId}...`);

    // 1. Update email and password in Supabase Auth using admin client
    const { data: authUser, error: authError } = await adminClient.auth.admin.updateUserById(
      userId,
      { 
        email: correctEmail,
        password: cleanRut,
        email_confirm: true // Ensure email is marked as confirmed
      }
    );

    if (authError) {
      throw new Error(`Error en Supabase Auth al actualizar: ${authError.message}`);
    }

    // 2. Double check and update public.users just in case
    const { error: profileError } = await supabase
      .from('users')
      .update({ email: correctEmail })
      .eq('id', userId);

    // 3. Double check and update personnel just in case
    const { error: personnelError } = await supabase
      .from('personnel')
      .update({ email: correctEmail })
      .eq('user_id', userId);

    return NextResponse.json({
      success: true,
      message: `El correo de Carlos Tobar en Supabase Auth ha sido corregido a: ${correctEmail} y su contraseña restablecida al RUT: ${cleanRut}`,
      updatedUser: {
        id: authUser.user?.id,
        email: authUser.user?.email,
        email_confirmed_at: authUser.user?.email_confirmed_at
      },
      profileError: profileError ? profileError.message : null,
      personnelError: personnelError ? personnelError.message : null
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      stack: err.stack
    }, { status: 500 });
  }
}
