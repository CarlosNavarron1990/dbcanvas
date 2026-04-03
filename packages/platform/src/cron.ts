import { getDb } from './db.js';

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Daily license maintenance job.
 * - Expires overdue licenses (trial ended, subscription lapsed)
 * - Logs upcoming expirations (7 days warning)
 */
export function runLicenseMaintenance() {
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Expire overdue active licenses
  const expired = db.prepare(`
    UPDATE licenses SET tier = 'free', status = 'expired', updated_at = datetime('now')
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?
  `).run(now);

  console.log(`[cron] Expired ${expired.changes} overdue licenses`);

  // 2. Find licenses expiring in 7 days (for email reminders)
  const expiringSoon = db.prepare(`
    SELECT l.id, l.license_key, l.tier, l.expires_at, u.email, u.name
    FROM licenses l
    JOIN users u ON l.user_id = u.id
    WHERE l.status = 'active'
      AND l.expires_at IS NOT NULL
      AND l.expires_at > ?
      AND l.expires_at < datetime(?, '+7 days')
  `).all(now, now) as any[];

  if (expiringSoon.length > 0) {
    console.log(`[cron] ${expiringSoon.length} licenses expiring in 7 days:`);
    for (const lic of expiringSoon) {
      console.log(`  - ${lic.email} (${lic.tier}) expires ${lic.expires_at}`);
      // TODO: Send email reminder when email service is configured
    }
  }

  // 3. Clean up old usage events (>90 days)
  const cleaned = db.prepare(`
    DELETE FROM usage_events WHERE timestamp < datetime('now', '-90 days')
  `).run();

  if (cleaned.changes > 0) {
    console.log(`[cron] Cleaned ${cleaned.changes} old usage events`);
  }

  return {
    expired: expired.changes,
    expiringSoon: expiringSoon.length,
    cleanedEvents: cleaned.changes,
  };
}

/** Start the cron interval (runs every 24 hours) */
export function startCron() {
  // Run once immediately on startup
  try {
    const result = runLicenseMaintenance();
    console.log(`[cron] Initial run complete:`, result);
  } catch (e) {
    console.error('[cron] Initial run failed:', e);
  }

  // Then every 24 hours
  setInterval(() => {
    try {
      runLicenseMaintenance();
    } catch (e) {
      console.error('[cron] Scheduled run failed:', e);
    }
  }, ONE_DAY).unref();
}
