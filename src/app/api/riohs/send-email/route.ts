import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export async function POST(req: NextRequest) {
  try {
    const { personnelId } = await req.json();

    if (!personnelId) {
      return NextResponse.json({ success: false, error: 'ID de trabajador requerido.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch personnel details with company
    const { data: worker, error: workerErr } = await supabase
      .from('personnel')
      .select('*, company:companies(id, name)')
      .eq('id', personnelId)
      .single();

    if (workerErr || !worker) {
      return NextResponse.json({ success: false, error: 'Trabajador no encontrado.' }, { status: 404 });
    }

    if (!worker.email) {
      return NextResponse.json({ success: false, error: 'El trabajador no tiene un correo electrónico registrado.' }, { status: 400 });
    }

    const companyName = worker.company?.name || 'MINERQUIM';
    const isMinerquim = companyName.toUpperCase().includes('MINERQUIM') && !companyName.toUpperCase().includes('TRANSPORTES');
    const isTransportes = companyName.toUpperCase().includes('TRANSPORTES');

    let pdfRelativePath = '';
    let pdfFileName = '';

    if (isMinerquim) {
      pdfRelativePath = path.join('templates', 'PdR', 'Minerquim', 'RIOHS_MINERQUIM.pdf');
      pdfFileName = 'RIOHS_MINERQUIM.pdf';
    } else if (isTransportes) {
      pdfRelativePath = path.join('templates', 'PdR', 'Transportes', 'RIOHS_TRANSPORTES.pdf');
      pdfFileName = 'RIOHS_TRANSPORTES.pdf';
    } else {
      pdfRelativePath = path.join('templates', 'PdR', 'Minerquim', 'RIOHS_MINERQUIM.pdf');
      pdfFileName = 'RIOHS_MINERQUIM.pdf';
    }

    const absolutePdfPath = path.join(/*turbopackIgnore: true*/ process.cwd(), pdfRelativePath);

    if (!fs.existsSync(absolutePdfPath)) {
      return NextResponse.json({ 
        success: false, 
        error: `El archivo Reglamento Interno (${pdfFileName}) no se encuentra cargado en el servidor para la empresa ${companyName}.` 
      }, { status: 400 });
    }

    const pdfBuffer = fs.readFileSync(absolutePdfPath);
    const sentAtDate = new Date();
    const sentAtStr = format(sentAtDate, "dd 'de' MMMM 'de' yyyy 'a las' HH:mm 'hrs'", { locale: es });
    const fullName = `${worker.first_name} ${worker.last_name_father} ${worker.last_name_mother || ''}`.trim();

    // HTML Email Template
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
          .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 30px; shadow: 0 4px 6px rgba(0,0,0,0.05); }
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
            <h2>${companyName.toUpperCase()}</h2>
            <p>DEPARTAMENTO DE PREVENCIÓN DE RIESGOS</p>
          </div>
          <div class="content">
            <p>Estimado/a <strong>${fullName}</strong>,</p>

            <p>De acuerdo a lo establecido en el <strong>Artículo 156 inciso 2 del Código del Trabajo</strong> y el <strong>Ordinario N° 4417/2017</strong> de la Dirección del Trabajo, hacemos entrega formal y gratuita de una copia en versión digital del <strong>Reglamento Interno de Orden, Higiene y Seguridad (RIOHS)</strong> de la empresa, el cual se encuentra adjunto a este correo electrónico.</p>

            <div class="highlight-box">
              <p><strong>Comprobante de Envío:</strong> Correo transmitido exitosamente el <strong>${sentAtStr}</strong> a la casilla personal <em>${worker.email}</em>.</p>
            </div>

            <p>Le recordamos que es su responsabilidad legal leer su contenido y dar estricto cumplimiento a todas las normas, obligaciones, prohibiciones e instrucciones de orden, higiene y seguridad contenidas en él.</p>

            <p>Ante cualquier duda o consulta sobre este reglamento, puede dirigirse al Departamento de Prevención de Riesgos de la empresa.</p>

            <br>
            <p>Atentamente,</p>
            <p><strong>Departamento de Prevención de Riesgos</strong><br>${companyName}</p>
          </div>
          <div class="footer">
            <p>Este correo ha sido generado automáticamente por el sistema HRM Roster Manager de Grupo Minerquim.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Nodemailer transporter setup (using existing project SMTP credentials)
    const transporter = nodemailer.createTransport({
      host: 'mail.minerquim.cl',
      port: 465,
      secure: true,
      auth: {
        user: 'no-reply@minerquim.cl',
        pass: 'Empresa_1000',
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const info = await transporter.sendMail({
      from: '"Prevención de Riesgos - Grupo Minerquim" <no-reply@minerquim.cl>',
      to: worker.email,
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

    console.log('RIOHS email sent successfully:', info.messageId);

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
    console.error('Error sending RIOHS email:', error);
    return NextResponse.json({ success: false, error: error.message || 'Error al enviar correo RIOHS.' }, { status: 500 });
  }
}
