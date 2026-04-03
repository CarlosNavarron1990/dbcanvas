import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware, adminMiddleware);

/** Dashboard stats */
router.get('/stats', (_req: Request, res: Response) => {
  const db = getDb();

  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  const totalLicenses = (db.prepare('SELECT COUNT(*) as c FROM licenses').get() as any).c;
  const activePro = (db.prepare("SELECT COUNT(*) as c FROM licenses WHERE tier = 'pro' AND status = 'active'").get() as any).c;
  const activeTeam = (db.prepare("SELECT COUNT(*) as c FROM licenses WHERE tier = 'team' AND status = 'active'").get() as any).c;
  const activeEnterprise = (db.prepare("SELECT COUNT(*) as c FROM licenses WHERE tier = 'enterprise' AND status = 'active'").get() as any).c;

  const revenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'").get() as any;
  const revenueThisMonth = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE status = 'completed' AND created_at >= datetime('now', 'start of month')
  `).get() as any;

  const usageToday = (db.prepare(`
    SELECT COUNT(*) as c FROM usage_events WHERE timestamp >= datetime('now', 'start of day')
  `).get() as any).c;

  const topTools = db.prepare(`
    SELECT tool_name, COUNT(*) as count FROM usage_events
    WHERE timestamp >= datetime('now', '-30 days')
    GROUP BY tool_name ORDER BY count DESC LIMIT 10
  `).all();

  res.json({
    users: { total: totalUsers },
    licenses: { total: totalLicenses, pro: activePro, team: activeTeam, enterprise: activeEnterprise },
    revenue: { total: revenue.total / 100, thisMonth: revenueThisMonth.total / 100 },
    usage: { today: usageToday, topTools },
  });
});

/** List all users */
router.get('/users', (_req: Request, res: Response) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.created_at,
      l.tier, l.status as license_status, l.license_key
    FROM users u
    LEFT JOIN licenses l ON u.id = l.user_id AND l.status = 'active'
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

/** List all payments */
router.get('/payments', (_req: Request, res: Response) => {
  const db = getDb();
  const payments = db.prepare(`
    SELECT p.*, u.email FROM payments p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC LIMIT 100
  `).all();
  res.json(payments);
});

/** Usage analytics */
router.get('/usage', (req: Request, res: Response) => {
  const db = getDb();
  const days = parseInt(req.query.days as string) || 30;

  const daily = db.prepare(`
    SELECT date(timestamp) as day, COUNT(*) as count
    FROM usage_events
    WHERE timestamp >= datetime('now', '-${days} days')
    GROUP BY date(timestamp)
    ORDER BY day
  `).all();

  const byTool = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM usage_events
    WHERE timestamp >= datetime('now', '-${days} days')
    GROUP BY tool_name ORDER BY count DESC
  `).all();

  const byLicense = db.prepare(`
    SELECT l.tier, COUNT(*) as count
    FROM usage_events ue
    LEFT JOIN licenses l ON ue.license_id = l.id
    WHERE ue.timestamp >= datetime('now', '-${days} days')
    GROUP BY l.tier
  `).all();

  res.json({ daily, byTool, byLicense });
});

/** Conversion funnel metrics */
router.get('/conversion', (_req: Request, res: Response) => {
  const db = getDb();

  const totalRegistered = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  const withTrial = (db.prepare("SELECT COUNT(*) as c FROM licenses WHERE license_key LIKE 'DBC-TRIAL%'").get() as any).c;
  const paidPro = (db.prepare("SELECT COUNT(*) as c FROM licenses WHERE tier = 'pro' AND status = 'active' AND stripe_subscription_id IS NOT NULL").get() as any).c;
  const paidTeam = (db.prepare("SELECT COUNT(*) as c FROM licenses WHERE tier = 'team' AND status = 'active' AND stripe_subscription_id IS NOT NULL").get() as any).c;
  const cancelled = (db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'cancelled'").get() as any).c;
  const expired = (db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'expired'").get() as any).c;

  const totalPaid = paidPro + paidTeam;
  const trialToPayRate = withTrial > 0 ? ((totalPaid / withTrial) * 100).toFixed(1) : '0.0';
  const churnRate = (totalPaid + cancelled) > 0 ? ((cancelled / (totalPaid + cancelled)) * 100).toFixed(1) : '0.0';

  // MRR (Monthly Recurring Revenue)
  const mrr = (paidPro * 19) + (paidTeam * 49);

  // LTV estimate (avg subscription length * avg revenue)
  const avgRevenuePerUser = totalPaid > 0 ? mrr / totalPaid : 0;
  const estimatedLtv = avgRevenuePerUser * 12; // Assume 12-month average lifetime

  // Registrations last 7 / 30 days
  const regsLast7 = (db.prepare("SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-7 days')").get() as any).c;
  const regsLast30 = (db.prepare("SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-30 days')").get() as any).c;

  res.json({
    funnel: {
      registered: totalRegistered,
      trial: withTrial,
      paidPro,
      paidTeam,
      totalPaid,
      cancelled,
      expired,
    },
    rates: {
      trialToPaid: `${trialToPayRate}%`,
      churn: `${churnRate}%`,
    },
    revenue: {
      mrr,
      estimatedLtv: Math.round(estimatedLtv),
    },
    growth: {
      regsLast7,
      regsLast30,
    },
  });
});

export default router;
