import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  // 1. Authorization check (skip if CRON_SECRET not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  const supabase = createAdminClient();

  try {
    // 2. Fetch configured email recipients from settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['email_recipients']);

    if (settingsError) throw settingsError;

    const emailRecipientsRaw = settingsData?.find(s => s.key === 'email_recipients')?.value || '';
    const emailRecipients = emailRecipientsRaw
      .split(',')
      .map((email: string) => email.trim())
      .filter((email: string) => email.length > 0 && email.includes('@'));

    if (emailRecipients.length === 0) {
      console.log('No valid email recipients configured. Skipping email.');
      return NextResponse.json({ success: true, message: 'No recipients configured' });
    }

    // 3. Determine target date: use ?date= query param for testing, otherwise yesterday in Chile
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    let targetDateStr: string;
    
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      targetDateStr = dateParam;
    } else {
      const now = new Date();
      const chileNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      chileNow.setDate(chileNow.getDate() - 1);
      targetDateStr = chileNow.toISOString().split('T')[0];
    }

    // 4. Fetch absent assignments (excluding extra shifts)
    const { data: absences, error: queryError } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        date,
        attendance_status,
        attendance_comment,
        attendance_updated_by,
        personnel:personnel!inner(
          first_name,
          last_name_father,
          company:companies(name)
        ),
        shift:shifts(name, start_time, end_time),
        area:areas(name),
        position:positions(name)
      `)
      .eq('date', targetDateStr)
      .eq('attendance_status', 'absent')
      .eq('is_extra', false);

    if (queryError) throw queryError;

    if (!absences || absences.length === 0) {
      console.log(`No absences reported for ${targetDateStr}. Skipping email.`);
      return NextResponse.json({ success: true, message: `No absences for ${targetDateStr}` });
    }

    // 5. Fetch names of supervisors who updated the attendance
    const supervisorIds = Array.from(new Set(
      absences.map(a => a.attendance_updated_by).filter(Boolean)
    )) as string[];

    const supervisorMap = new Map<string, string>();
    if (supervisorIds.length > 0) {
      const { data: supervisors, error: supError } = await supabase
        .from('personnel')
        .select('id, first_name, last_name_father')
        .in('id', supervisorIds);
      
      if (!supError && supervisors) {
        supervisors.forEach(s => {
          supervisorMap.set(s.id, `${s.first_name} ${s.last_name_father}`.trim() || 'Desconocido');
        });
      }
    }

    // 6. Build the email HTML
    const formattedDate = new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      dateStyle: 'long'
    }).format(new Date(targetDateStr + 'T12:00:00'));

    const tableRows = absences.map(a => {
      const p = a.personnel as any;
      const sh = a.shift as any;
      const ar = a.area as any;
      const pos = a.position as any;

      const employeeName = p ? `${p.first_name} ${p.last_name_father}` : 'Desconocido';
      const companyName = p?.company ? p.company.name : 'N/A';
      const areaName = ar ? ar.name : 'N/A';
      const positionName = pos ? pos.name : 'N/A';
      const shiftName = sh ? `${sh.name} (${sh.start_time.substring(0, 5)} - ${sh.end_time.substring(0, 5)})` : 'N/A';
      
      const supervisorName = a.attendance_updated_by ? (supervisorMap.get(a.attendance_updated_by) || 'Desconocido') : 'No registrado';
      const comment = a.attendance_comment || 'sin motivo';

      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px; font-weight: bold; color: #1e293b;">${employeeName}</td>
          <td style="padding: 12px; color: #475569;">${companyName}</td>
          <td style="padding: 12px; color: #475569;">${areaName} / ${positionName}</td>
          <td style="padding: 12px; color: #0f766e; font-weight: 500;">${shiftName}</td>
          <td style="padding: 12px; color: #475569;">${supervisorName}</td>
          <td style="padding: 12px; color: #b91c1c; font-style: italic; background-color: #fef2f2;">${comment}</td>
        </tr>
      `;
    }).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reporte de Ausencias</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 20px; color: #334155;">
        <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">Reporte Diario de Ausencias</h1>
            <p style="color: #ccfbf1; margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">${formattedDate}</p>
          </div>
          
          <!-- Body -->
          <div style="padding: 32px 24px;">
            <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #475569;">
              Se reportaron las siguientes inasistencias el día <strong>${formattedDate}</strong>:
            </p>
            
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f1f5f9; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 12px; font-weight: 800; text-transform: uppercase; color: #475569;">Colaborador</th>
                    <th style="padding: 12px; font-weight: 800; text-transform: uppercase; color: #475569;">Empresa</th>
                    <th style="padding: 12px; font-weight: 800; text-transform: uppercase; color: #475569;">Área / Cargo</th>
                    <th style="padding: 12px; font-weight: 800; text-transform: uppercase; color: #475569;">Turno</th>
                    <th style="padding: 12px; font-weight: 800; text-transform: uppercase; color: #475569;">Supervisor</th>
                    <th style="padding: 12px; font-weight: 800; text-transform: uppercase; color: #475569; background-color: #fee2e2; color: #991b1b;">Observación</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
            <p style="margin: 0;">Este es un correo automático generado por HRM Roster Manager.</p>
            <p style="margin: 4px 0 0 0;">Minerquim Logística Aeropuerto &copy; ${new Date().getFullYear()}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // 7. Send the email via SMTP (Nodemailer)
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
      from: '"HRM Roster Manager" <no-reply@minerquim.cl>',
      to: emailRecipients,
      subject: `[Ausencias] Reporte de Inasistencias - ${targetDateStr}`,
      html: emailHtml,
    });

    console.log('Absences alert email sent successfully:', info.messageId);

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
      recipients: emailRecipients.length,
      absences: absences.length,
      messageId: info.messageId
    });

  } catch (error: any) {
    console.error('Absences cron email alert job failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}
