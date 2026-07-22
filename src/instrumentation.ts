import cron from 'node-cron';

export function register() {
  // Only run cron jobs on the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Schedule: 08:00 Chile time (America/Santiago)
    // node-cron supports timezone option
    cron.schedule('0 8 * * *', async () => {
      console.log('[CRON] Running daily absences email job...');
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const cronSecret = process.env.CRON_SECRET || '';

        const response = await fetch(`${baseUrl}/api/cron/absences`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cronSecret}`,
          },
        });

        const result = await response.json();
        console.log('[CRON] Absences email result:', result);
      } catch (error) {
        console.error('[CRON] Absences email job failed:', error);
      }
    }, {
      timezone: 'America/Santiago',
    });

    console.log('[CRON] Scheduled absences email job at 08:00 Chile time');

    // Schedule: 08:00 UTC for document expiration checks (existing vercel.json cron)
    cron.schedule('0 8 * * *', async () => {
      console.log('[CRON] Running document expiration check...');
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const cronSecret = process.env.CRON_SECRET || '';

        const response = await fetch(`${baseUrl}/api/cron/documents`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cronSecret}`,
          },
        });

        const result = await response.json();
        console.log('[CRON] Document expiration result:', result);
      } catch (error) {
        console.error('[CRON] Document expiration job failed:', error);
      }
    }, {
      timezone: 'UTC',
    });

    console.log('[CRON] Scheduled document expiration check at 08:00 UTC');
  }
}
