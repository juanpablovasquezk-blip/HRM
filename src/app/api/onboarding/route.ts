import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET: Validate onboarding token and return company information
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token es requerido' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // Fetch token details and join with company
    const { data: tokenData, error: tokenError } = await supabase
      .from('onboarding_tokens')
      .select('*, company:companies(id, name)')
      .eq('token', token)
      .gt('expires_at', now)
      .is('used_at', null)
      .maybeSingle();

    if (tokenError) {
      console.error('[API-ONBOARDING] Token query error:', tokenError);
      return NextResponse.json({ success: false, error: 'Error al validar el token' }, { status: 500 });
    }

    if (!tokenData) {
      return NextResponse.json({ success: false, error: 'Enlace de invitación inválido o expirado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      company: tokenData.company,
      expires_at: tokenData.expires_at
    });
  } catch (err: any) {
    console.error('[API-ONBOARDING] Unexpected GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Submit new personnel data for onboarding
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, personalData } = body;

    if (!token || !personalData) {
      return NextResponse.json({ success: false, error: 'Datos incompletos' }, { status: 400 });
    }

    const { 
      first_name, 
      last_name_father, 
      last_name_mother, 
      rut, 
      birth_date, 
      email, 
      phone, 
      afp, 
      health_system, 
      isapre,
      gender,
      bank_account_type,
      bank_name,
      bank_account_number
    } = personalData;

    if (!first_name || !last_name_father || !last_name_mother || !rut || !birth_date || !email || !phone || !afp || !health_system || !gender || !bank_account_type || !bank_name || !bank_account_number) {
      return NextResponse.json({ success: false, error: 'Por favor, completa todos los campos requeridos.' }, { status: 400 });
    }

    if (health_system === 'ISAPRE' && !isapre) {
      return NextResponse.json({ success: false, error: 'Por favor, especifica cuál es tu Isapre.' }, { status: 400 });
    }




    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // 1. Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from('onboarding_tokens')
      .select('*')
      .eq('token', token)
      .gt('expires_at', now)
      .is('used_at', null)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return NextResponse.json({ success: false, error: 'Enlace de invitación inválido o expirado' }, { status: 400 });
    }

    // Helper to format string to uppercase, handling null/undefined
    const toUpper = (val: any) => {
      if (typeof val === 'string') return val.trim().toUpperCase();
      return val || null;
    };

    // Clean and validate RUT
    const cleanRut = toUpper(personalData.rut)?.replace(/\s+/g, '');
    if (!cleanRut) {
      return NextResponse.json({ success: false, error: 'RUT es requerido' }, { status: 400 });
    }

    // Check if RUT already exists
    const { data: existingPerson } = await supabase
      .from('personnel')
      .select('id')
      .eq('rut', cleanRut)
      .maybeSingle();

    if (existingPerson) {
      return NextResponse.json({ success: false, error: `Ya existe un registro o postulación con el RUT ${cleanRut}` }, { status: 400 });
    }

    // Clean email (always lowercase for standard compatibility)
    const cleanEmail = personalData.email ? personalData.email.trim().toLowerCase() : null;

    // Address JSON
    const addressJson = {
      street: toUpper(personalData.address_street) || '',
      city: toUpper(personalData.address_city) || '',
      region: toUpper(personalData.address_region) || '',
      comuna: toUpper(personalData.address_comuna) || '',
    };

    // Construct personnel insert payload
    const personnelPayload = {
      company_id: tokenData.company_id,
      first_name: toUpper(personalData.first_name),
      last_name_father: toUpper(personalData.last_name_father),
      last_name_mother: toUpper(personalData.last_name_mother) || '',
      rut: cleanRut,
      email: cleanEmail,
      birth_date: personalData.birth_date,
      phone: toUpper(personalData.phone) || '',
      address: addressJson,
      driver_licenses: personalData.driver_licenses || [],
      
      // Emergency Contact
      emergency_contact_name: toUpper(personalData.emergency_contact_name),
      emergency_contact_relationship: toUpper(personalData.emergency_contact_relationship),
      emergency_contact_phone: toUpper(personalData.emergency_contact_phone),

      // Clothing Sizes
      clothing_tshirt_size: toUpper(personalData.clothing_tshirt_size),
      clothing_polar_size: toUpper(personalData.clothing_polar_size),
      clothing_pants_size_letter: toUpper(personalData.clothing_pants_size_letter),
      clothing_pants_size_number: toUpper(personalData.clothing_pants_size_number),
      clothing_shoe_size: toUpper(personalData.clothing_shoe_size),
      clothing_parka_size: toUpper(personalData.clothing_parka_size),
      clothing_overall_size: toUpper(personalData.clothing_overall_size),

      // Onboarding status and active state
      onboarding_status: 'pending',
      is_active: false, // Admin must approve to set active

      // Social security fields
      afp: toUpper(personalData.afp),
      health_system: toUpper(personalData.health_system),
      isapre: personalData.health_system === 'ISAPRE' ? toUpper(personalData.isapre) : null,

      // Gender & Bank Details
      gender: toUpper(personalData.gender),
      bank_account_type: toUpper(personalData.bank_account_type),
      bank_name: toUpper(personalData.bank_name),
      bank_account_number: toUpper(personalData.bank_account_number)
    };



    // Insert new personnel
    const { error: insertError } = await supabase
      .from('personnel')
      .insert(personnelPayload);

    if (insertError) {
      console.error('[API-ONBOARDING] Insert error:', insertError);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    // Mark token as used if it's one-time (optional, here we set used_at)
    await supabase
      .from('onboarding_tokens')
      .update({ used_at: now })
      .eq('id', tokenData.id);

    return NextResponse.json({ success: true, message: 'Datos personales enviados correctamente. Quedan pendientes de aprobación.' });
  } catch (err: any) {
    console.error('[API-ONBOARDING] Unexpected POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
