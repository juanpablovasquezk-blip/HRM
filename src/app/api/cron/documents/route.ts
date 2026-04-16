import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateExpiration } from '@/lib/documents/expiration-engine';
import { createNotificationService } from '@/lib/notifications';
import { differenceInDays } from 'date-fns';

export async function GET(request: Request) {
  // Simple auth check for chron job
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = createAdminClient();
  const notifier = createNotificationService();
  const todayDate = new Date();

  try {
    // 1. Fetch all documents mapping to active personnel
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*, personnel!inner(id, user_id, is_active)')
      .eq('personnel.is_active', true);

    if (error) throw error;
    if (!documents) return NextResponse.json({ success: true, processed: 0 });

    let alertsSent = 0;

    for (const doc of documents) {
      const p = doc.personnel as unknown as { id: string; user_id: string | null };
      if (!p.user_id) continue;

      const uploadDate = new Date(doc.uploaded_at || doc.created_at);
      const ticaDate = doc.tica_date ? new Date(doc.tica_date) : null;
      
      const { expiration_date } = calculateExpiration(uploadDate, ticaDate);
      const daysUntilExpiry = differenceInDays(expiration_date, todayDate);

      // Only notify if expired (<= 0) or expiring exactly on milestones (30, 15, 7, 3, 1)
      const notifyMilestones = [30, 15, 7, 3, 1, 0];
      const isExpired = daysUntilExpiry < 0; // Send daily if already expired

      if (notifyMilestones.includes(daysUntilExpiry) || isExpired) {
        await notifier.sendDocumentAlert(p.user_id, doc.type, daysUntilExpiry);
        alertsSent++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: documents.length, 
      alertsSent 
    });

  } catch (error) {
    console.error('Document expiration cron failed:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}
