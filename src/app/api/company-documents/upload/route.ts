import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const companyId = formData.get('companyId') as string;
    const category = (formData.get('category') as string) || 'GENERAL';
    const title = formData.get('title') as string;
    const file = formData.get('file') as File;

    if (!companyId || !title || !file) {
      return NextResponse.json({ success: false, error: 'Compañía, título y archivo son requeridos.' }, { status: 400 });
    }

    console.log('[CompanyDocs API] Upload request:', { companyId, category, title, fileName: file.name, fileSize: file.size });

    const adminSupabase = createAdminClient();
    const fileExt = file.name.split('.').pop() || 'pdf';
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
    const storagePath = `company-documents/${companyId}/${category}_${sanitizedTitle}_${Date.now()}.${fileExt}`;

    // Convert to Buffer for reliable upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('[CompanyDocs API] Uploading to storage:', storagePath, 'size:', buffer.length);

    const { error: uploadErr } = await adminSupabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[CompanyDocs API] Storage upload error:', uploadErr);
      return NextResponse.json({ success: false, error: `Error subiendo archivo: ${uploadErr.message}` }, { status: 500 });
    }

    const { data: publicUrlData } = adminSupabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    const fileUrl = publicUrlData.publicUrl;
    console.log('[CompanyDocs API] Public URL:', fileUrl);

    // If RIOHS, delete previous RIOHS documents for this company
    if (category === 'RIOHS') {
      const { error: delErr } = await adminSupabase
        .from('company_documents')
        .delete()
        .eq('company_id', companyId)
        .eq('category', 'RIOHS');
      
      if (delErr) {
        console.warn('[CompanyDocs API] Warning deleting old RIOHS:', delErr);
      }
    }

    const { error: dbErr } = await adminSupabase
      .from('company_documents')
      .insert({
        company_id: companyId,
        category,
        title,
        file_url: fileUrl,
        file_name: file.name,
      });

    if (dbErr) {
      console.error('[CompanyDocs API] DB insert error:', dbErr);
      return NextResponse.json({ success: false, error: `Error guardando en BD: ${dbErr.message}` }, { status: 500 });
    }

    console.log('[CompanyDocs API] SUCCESS!');
    return NextResponse.json({ success: true, fileUrl });
  } catch (error: any) {
    console.error('[CompanyDocs API] Unexpected error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Error inesperado.' }, { status: 500 });
  }
}
