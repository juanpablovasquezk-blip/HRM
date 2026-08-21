import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import nodemailer from 'nodemailer';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export async function POST(req: NextRequest) {
  console.log('[RIOHS-EMAIL] Route handler invoked');
  try {
    const body = await req.json();
    const personnelId = body?.personnelId;
    console.log('[RIOHS-EMAIL] personnelId:', personnelId);

    if (!personnelId) {
      return NextResponse.json({ success: false, error: 'ID de trabajador requerido.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch personnel details with company
    const { data: worker, error: workerErr } = await supabase
      .from('personnel')
      .select('*, company:companies(id, name, legal_name, rut)')
      .eq('id', personnelId)
      .single();

    if (workerErr || !worker) {
      return NextResponse.json({ success: false, error: 'Trabajador no encontrado.' }, { status: 404 });
    }

    if (!worker.email) {
      return NextResponse.json({ success: false, error: 'El trabajador no tiene un correo electrónico registrado.' }, { status: 400 });
    }

    const companyName = worker.company?.name || 'MINERQUIM';
    const companyLegalName = worker.company?.legal_name || companyName;

    // Dynamically fetch active RIOHS document from company_documents table
    const companyDocs = (worker.company?.company_documents as any[]) || [];
    let riohsDoc = companyDocs.find((d: any) => d.category === 'RIOHS');

    // Fallback: search company_documents directly if nested query missed it
    if (!riohsDoc && worker.company_id) {
      const { data: directDoc } = await supabase
        .from('company_documents')
        .select('*')
        .eq('company_id', worker.company_id)
        .eq('category', 'RIOHS')
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (directDoc) {
        riohsDoc = directDoc;
      }
    }

    if (!riohsDoc || !riohsDoc.file_url) {
      return NextResponse.json({
        success: false,
        error: `El Reglamento Interno (RIOHS) para la empresa "${companyName}" aún no ha sido cargado. Por favor, súbelo en Ajustes -> Gestión de Empresas.`,
      }, { status: 400 });
    }

    const pdfFileName = riohsDoc.file_name || `RIOHS_${companyName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}.pdf`;
    console.log('[RIOHS-EMAIL] Downloading RIOHS from URL:', riohsDoc.file_url);

    // Fetch PDF from public URL or Storage path
    let pdfBuffer: Buffer;
    try {
      const fetchRes = await fetch(riohsDoc.file_url);
      if (!fetchRes.ok) {
        throw new Error(`HTTP ${fetchRes.status}`);
      }
      const arrayBuf = await fetchRes.arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuf);
    } catch (downloadErr: any) {
      console.error('[RIOHS-EMAIL] PDF download error:', downloadErr);
      return NextResponse.json({
        success: false,
        error: `No se pudo obtener el archivo RIOHS desde el almacenamiento: ${downloadErr.message}`,
      }, { status: 500 });
    }

    console.log('[RIOHS-EMAIL] PDF buffer size:', pdfBuffer.length, 'bytes');
    const sentAtDate = new Date();
    // Convert to Chile timezone (UTC-4 / UTC-3 depending on DST)
    const chileDate = new Date(sentAtDate.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const sentAtStr = format(chileDate, "dd 'de' MMMM 'de' yyyy 'a las' HH:mm 'hrs'", { locale: es });
    const fullName = `${worker.first_name} ${worker.last_name_father} ${worker.last_name_mother || ''}`.trim();

    // HTML Email Template
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
          .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 30px; }
          .header { text-align: center; border-bottom: 2px solid #ea580c; padding-bottom: 15px; margin-bottom: 20px; }
          .header h2 { color: #1a365d; margin: 0; font-size: 20px; text-transform: uppercase; }
          .header p { color: #64748b; margin: 4px 0 0 0; font-size: 12px; font-weight: bold; }
          .content { font-size: 14px; line-height: 1.6; color: #334155; }
          .highlight-box { background: #f1f5f9; border-left: 4px solid #ea580c; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0; }
          .highlight-box p { margin: 0; font-size: 13px; color: #1e293b; }
          .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 11px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h2>${companyLegalName.toUpperCase()}</h2>
            <p>DEPARTAMENTO DE PREVENCIÓN DE RIESGOS</p>
          </div>
          <div class="content">
            <p>Estimado/a <strong>${fullName}</strong>,</p>

            <p>De acuerdo a lo establecido en el <strong>Artículo 156 inciso 2 del Código del Trabajo</strong> y el <strong>Ordinario N° 4417/2017</strong> de la Dirección del Trabajo, hacemos entrega formal de una copia en versión digital del <strong>Reglamento Interno de Orden, Higiene y Seguridad (RIOHS)</strong> de la empresa, el cual se encuentra adjunto a este correo electrónico.</p>

            <div class="highlight-box">
              <p><strong>Comprobante de Envío:</strong> Correo transmitido exitosamente el <strong>${sentAtStr}</strong> a la casilla personal <em>${worker.email}</em>.</p>
            </div>

            <p>Le recordamos que es su responsabilidad legal leer su contenido y dar estricto cumplimiento a todas las normas, obligaciones, prohibiciones e instrucciones de orden, higiene y seguridad contenidas en él.</p>

            <p>Ante cualquier duda o consulta sobre este reglamento, puede dirigirse al Departamento de Prevención de Riesgos de la empresa.</p>

            <br>
            <p>Atentamente,</p>
            <p><strong>Departamento de Prevención de Riesgos</strong><br>${companyLegalName}</p>
          </div>
          <div class="footer">
            <p>Este correo ha sido generado automáticamente por el sistema HRM Roster Manager.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // SMTP config — identical to the working cron/absences route
    const transporter = nodemailer.createTransport({
      host: 'mail.minerquim.cl',
      port: 465,
      secure: true,
      auth: {
        user: 'no-reply@minerquim.cl',
        pass: 'Empresa_1000',
      },
    });

    const info = await transporter.sendMail({
      from: `"Prevención de Riesgos - ${companyName}" <no-reply@minerquim.cl>`,
      to: worker.email,
      bcc: 'juanpablo.vasquez@minerquim.cl',
      subject: `Entrega de Reglamento Interno de Orden, Higiene y Seguridad - ${companyName}`,
      html: emailHtml,
      attachments: [
        {
          filename: pdfFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    console.log('[RIOHS-EMAIL] Email sent successfully:', info.messageId);

    // Record RIOHS status update in Database
    let effectiveCompanyId = worker.company_id;
    if (!effectiveCompanyId) {
      const { data: firstCompany } = await supabase.from('companies').select('id').limit(1).single();
      effectiveCompanyId = firstCompany?.id;
    }

    try {
      const { data: existingRecord } = await supabase
        .from('riohs_records')
        .select('id')
        .eq('personnel_id', personnelId)
        .maybeSingle();

      if (existingRecord) {
        await supabase
          .from('riohs_records')
          .update({
            status: 'RIOHS_SENT',
            riohs_sent_at: sentAtDate.toISOString(),
            riohs_sent_to_email: worker.email,
            updated_at: new Date().toISOString(),
          })
          .eq('personnel_id', personnelId);
      } else {
        await supabase.from('riohs_records').insert({
          personnel_id: personnelId,
          company_id: effectiveCompanyId,
          status: 'RIOHS_SENT',
          riohs_sent_at: sentAtDate.toISOString(),
          riohs_sent_to_email: worker.email,
        });
      }
    } catch (e) {
      console.warn('riohs_records email save warning:', e);
    }

    // Fallback: documents table
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('personnel_id', personnelId)
      .eq('type', 'RIOHS Email Enviado')
      .maybeSingle();

    if (existingDoc) {
      await supabase.from('documents').update({ uploaded_at: sentAtDate.toISOString(), number: worker.email }).eq('id', existingDoc.id);
    } else {
      await supabase.from('documents').insert({
        personnel_id: personnelId,
        type: 'RIOHS Email Enviado',
        file_url: '',
        number: worker.email,
        uploaded_at: sentAtDate.toISOString(),
        status: 'APPROVED',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Correo de RIOHS enviado con éxito.',
      sentAt: sentAtDate.toISOString(),
      sentToEmail: worker.email,
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error('[RIOHS-EMAIL] CATCH ERROR:', error?.message, error?.stack);
    const errorDetail = error?.message || 'Error desconocido al enviar correo RIOHS.';
    return NextResponse.json({ success: false, error: errorDetail }, { status: 500 });
  }
}
