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
      bank_account_number,
      nationality,
      marital_status
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
      .select('id, onboarding_status')
      .eq('rut', cleanRut)
      .maybeSingle();

    if (existingPerson) {
      if (existingPerson.onboarding_status === 'rejected') {
        // Si la postulación fue rechazada previamente por el administrador,
        // eliminamos el registro antiguo para permitir una nueva postulación limpia.
        const { error: deleteError } = await supabase
          .from('personnel')
          .delete()
          .eq('id', existingPerson.id);

        if (deleteError) {
          console.error('[API-ONBOARDING] Error al eliminar postulación rechazada:', deleteError);
          return NextResponse.json({ success: false, error: 'Error al procesar el reintento de postulación' }, { status: 500 });
        }
      } else {
        return NextResponse.json({ success: false, error: `Ya existe un registro o postulación con el RUT ${cleanRut}` }, { status: 400 });
      }
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
      bank_account_number: toUpper(personalData.bank_account_number),

      // Contract fields
      nationality: toUpper(personalData.nationality) || 'CHILENA',
      marital_status: toUpper(personalData.marital_status),
    };



    // Insert new personnel and select its id
    const { data: newPerson, error: insertError } = await supabase
      .from('personnel')
      .insert(personnelPayload)
      .select('id')
      .single();

    if (insertError || !newPerson) {
      console.error('[API-ONBOARDING] Insert error:', insertError);
      return NextResponse.json({ success: false, error: insertError?.message || 'Error al guardar los datos de personal' }, { status: 500 });
    }

    const personnelId = newPerson.id;

    // Guardar los documentos en storage y base de datos
    if (body.documents) {
      const docs = body.documents;

      // Limpiar nombres para el sufijo (ej: JEREMY_REYES)
      const cleanFirstName = first_name.trim().split(' ')[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const cleanLastName = last_name_father.trim().split(' ')[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const fileSuffix = `${cleanFirstName}_${cleanLastName}`;

      // Consultar definiciones de documentos de la compañía para enlazar definition_id si existen
      const { data: defs } = await supabase
        .from('document_definitions')
        .select('id, name')
        .eq('company_id', tokenData.company_id)
        .eq('is_active', true);

      const findDefId = (keywords: string[]) => {
        if (!defs) return null;
        const match = defs.find(d => {
          const nameLower = d.name.toLowerCase();
          return keywords.some(k => nameLower.includes(k));
        });
        return match ? match.id : null;
      };

      const cedulaDefId = findDefId(['cedula', 'cédula', 'identidad']);
      const licenciaDefId = findDefId(['licencia', 'conducir']);
      const antecedentesDefId = findDefId(['antecedentes']);
      const hojaVidaDefId = findDefId(['hoja de vida', 'hoja', 'conductor']);
      const fotoDefId = findDefId(['perfil', 'foto', 'selfie']);

      const base64ToBuffer = (base64Str: string) => {
        const marker = ';base64,';
        const markerIndex = base64Str.indexOf(marker);
        if (markerIndex === -1) {
          return Buffer.from(base64Str, 'base64');
        }
        return Buffer.from(base64Str.substring(markerIndex + marker.length), 'base64');
      };

      const uploadAndRegister = async (
        base64Data: string,
        fileName: string,
        contentType: string,
        docType: string,
        definitionId: string | null,
        dates?: { issue_date?: string | null; expiration_date?: string | null }
      ) => {
        try {
          const buffer = base64ToBuffer(base64Data);

          // Subir archivo a Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, buffer, {
              contentType,
              upsert: true
            });

          if (uploadError) {
            console.error(`[API-ONBOARDING] Error al subir archivo a Storage (${docType}):`, uploadError);
            return;
          }

          // Obtener URL pública del archivo
          const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(fileName);

          // Insertar registro en la tabla documents
          const { error: docInsertError } = await supabase
            .from('documents')
            .insert({
              personnel_id: personnelId,
              type: docType,
              file_url: urlData.publicUrl,
              definition_id: definitionId,
              issue_date: dates?.issue_date || null,
              expiration_date: dates?.expiration_date || null,
              status: 'PENDING',
            });

          if (docInsertError) {
            console.error(`[API-ONBOARDING] Error al insertar fila en documents (${docType}):`, docInsertError);
          }
        } catch (err) {
          console.error(`[API-ONBOARDING] Error inesperado procesando documento (${docType}):`, err);
        }
      };

      // 1. Cédula de Identidad PDF
      if (docs.cedula_pdf_base64) {
        await uploadAndRegister(
          docs.cedula_pdf_base64,
          `${personnelId}/CI_${fileSuffix}.pdf`,
          'application/pdf',
          'CEDULA',
          cedulaDefId,
          { expiration_date: docs.cedula_expiration_date }
        );
      }

      // 2. Licencia de Conducir PDF
      if (docs.licencia_pdf_base64) {
        await uploadAndRegister(
          docs.licencia_pdf_base64,
          `${personnelId}/LIC_${fileSuffix}.pdf`,
          'application/pdf',
          'LICENCIA',
          licenciaDefId,
          { expiration_date: docs.licencia_expiration_date }
        );
      }

      // 3. Selfie Original (FOTO_JEREMY_REYES.jpg)
      if (docs.selfie_original_base64) {
        await uploadAndRegister(
          docs.selfie_original_base64,
          `${personnelId}/FOTO_${fileSuffix}.jpg`,
          'image/jpeg',
          'SELFIE_ORIGINAL',
          null
        );
      }

      // 4. Selfie con Banner (FOTO_NOMBRE_JEREMY_REYES.jpg)
      if (docs.selfie_labeled_base64) {
        await uploadAndRegister(
          docs.selfie_labeled_base64,
          `${personnelId}/FOTO_NOMBRE_${fileSuffix}.jpg`,
          'image/jpeg',
          'FOTO_PERFIL',
          fotoDefId
        );
      }

      // 5. Certificado de Antecedentes PDF
      if (docs.antecedentes_pdf_base64) {
        await uploadAndRegister(
          docs.antecedentes_pdf_base64,
          `${personnelId}/ANTECEDENTES_${fileSuffix}.pdf`,
          'application/pdf',
          'CERTIFICADO_ANTECEDENTES',
          antecedentesDefId,
          { issue_date: docs.antecedentes_issue_date }
        );
      }

      // 6. Hoja de Vida del Conductor PDF
      if (docs.hoja_vida_pdf_base64) {
        await uploadAndRegister(
          docs.hoja_vida_pdf_base64,
          `${personnelId}/HOJA_VIDA_${fileSuffix}.pdf`,
          'application/pdf',
          'HOJA_VIDA_CONDUCTOR',
          hojaVidaDefId,
          { issue_date: docs.hoja_vida_issue_date }
        );
      }
    }

    // Marcar token de onboarding como usado
    await supabase
      .from('onboarding_tokens')
      .update({ used_at: now })
      .eq('id', tokenData.id);

    return NextResponse.json({ success: true, message: 'Datos personales y documentos cargados con éxito. Quedan pendientes de aprobación.' });
  } catch (err: any) {
    console.error('[API-ONBOARDING] Unexpected POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
