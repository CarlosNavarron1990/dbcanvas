import { query, execute } from './db.js';

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Daily license maintenance job.
 * - Expires overdue licenses (trial ended, subscription lapsed)
 * - Logs upcoming expirations (7 days warning)
 */
export async function runLicenseMaintenance() {
  const now = new Date().toISOString();

  // 1. Expire overdue active licenses
  const expiredCount = await execute(`
    UPDATE licenses SET tier = 'free', status = 'expired', updated_at = NOW()
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < $1
  `, [now]);

  console.log(`[cron] Expired ${expiredCount} overdue licenses`);

  // 2. Find licenses expiring in 7 days (for email reminders)
  const expiringSoon = await query(`
    SELECT l.id, l.license_key, l.tier, l.expires_at, u.email, u.name
    FROM licenses l
    JOIN users u ON l.user_id = u.id
    WHERE l.status = 'active'
      AND l.expires_at IS NOT NULL
      AND l.expires_at > $1
      AND l.expires_at < $1::timestamptz + INTERVAL '7 days'
  `, [now]);

  if (expiringSoon.length > 0) {
    console.log(`[cron] ${expiringSoon.length} licenses expiring in 7 days:`);
    for (const lic of expiringSoon) {
      console.log(`  - ${lic.email} (${lic.tier}) expires ${lic.expires_at}`);
      // TODO: Send email reminder when email service is configured
    }
  }

  // 3. Clean up old usage events (>90 days)
  const cleanedCount = await execute(`
    DELETE FROM usage_events WHERE timestamp < NOW() - INTERVAL '90 days'
  `);

  if (cleanedCount > 0) {
    console.log(`[cron] Cleaned ${cleanedCount} old usage events`);
  }

  return {
    expired: expiredCount,
    expiringSoon: expiringSoon.length,
    cleanedEvents: cleanedCount,
  };
}

/** Start the cron interval (runs every 24 hours) */
export function startCron() {
  // Run once immediately on startup
  runLicenseMaintenance()
    .then(result => console.log(`[cron] Initial run complete:`, result))
    .catch(e => console.error('[cron] Initial run failed:', e));

  // Then every 24 hours
  setInterval(() => {
    runLicenseMaintenance().catch(e => console.error('[cron] Scheduled run failed:', e));
  }, ONE_DAY).unref();
}
