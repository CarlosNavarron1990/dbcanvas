import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware, adminMiddleware);

/** Dashboard stats */
router.get('/stats', async (_req: Request, res: Response) => {
  const totalUsers = (await queryOne('SELECT COUNT(*) as c FROM users'))!.c;
  const totalLicenses = (await queryOne('SELECT COUNT(*) as c FROM licenses'))!.c;
  const activePro = (await queryOne("SELECT COUNT(*) as c FROM licenses WHERE tier = 'pro' AND status = 'active'"))!.c;
  const activeTeam = (await queryOne("SELECT COUNT(*) as c FROM licenses WHERE tier = 'team' AND status = 'active'"))!.c;
  const activeEnterprise = (await queryOne("SELECT COUNT(*) as c FROM licenses WHERE tier = 'enterprise' AND status = 'active'"))!.c;

  const revenue = await queryOne("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'");
  const revenueThisMonth = await queryOne(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE status = 'completed' AND created_at >= DATE_TRUNC('month', NOW())
  `);

  const usageToday = (await queryOne(`
    SELECT COUNT(*) as c FROM usage_events WHERE timestamp >= DATE_TRUNC('day', NOW())
  `))!.c;

  const topTools = await query(`
    SELECT tool_name, COUNT(*) as count FROM usage_events
    WHERE timestamp >= NOW() - INTERVAL '30 days'
    GROUP BY tool_name ORDER BY count DESC LIMIT 10
  `);

  res.json({
    users: { total: totalUsers },
    licenses: { total: totalLicenses, pro: activePro, team: activeTeam, enterprise: activeEnterprise },
    revenue: { total: revenue!.total / 100, thisMonth: revenueThisMonth!.total / 100 },
    usage: { today: usageToday, topTools },
  });
});

/** List all users */
router.get('/users', async (_req: Request, res: Response) => {
  const users = await query(`
    SELECT u.id, u.email, u.name, u.role, u.created_at,
      l.tier, l.status as license_status, l.license_key
    FROM users u
    LEFT JOIN licenses l ON u.id = l.user_id AND l.status = 'active'
    ORDER BY u.created_at DESC
  `);
  res.json(users);
});

/** List all payments */
router.get('/payments', async (_req: Request, res: Response) => {
  const payments = await query(`
    SELECT p.*, u.email FROM payments p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC LIMIT 100
  `);
  res.json(payments);
});

/** Usage analytics */
router.get('/usage', async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;

  const daily = await query(`
    SELECT DATE(timestamp) as day, COUNT(*) as count
    FROM usage_events
    WHERE timestamp >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE(timestamp)
    ORDER BY day
  `);

  const byTool = await query(`
    SELECT tool_name, COUNT(*) as count
    FROM usage_events
    WHERE timestamp >= NOW() - INTERVAL '${days} days'
    GROUP BY tool_name ORDER BY count DESC
  `);

  const byLicense = await query(`
    SELECT l.tier, COUNT(*) as count
    FROM usage_events ue
    LEFT JOIN licenses l ON ue.license_id = l.id
    WHERE ue.timestamp >= NOW() - INTERVAL '${days} days'
    GROUP BY l.tier
  `);

  res.json({ daily, byTool, byLicense });
});

/** Conversion funnel metrics */
router.get('/conversion', async (_req: Request, res: Response) => {
  const totalRegistered = (await queryOne('SELECT COUNT(*) as c FROM users'))!.c;
  const withTrial = (await queryOne("SELECT COUNT(*) as c FROM licenses WHERE license_key LIKE 'DBC-TRIAL%'"))!.c;
  const paidPro = (await queryOne("SELECT COUNT(*) as c FROM licenses WHERE tier = 'pro' AND status = 'active' AND stripe_subscription_id IS NOT NULL"))!.c;
  const paidTeam = (await queryOne("SELECT COUNT(*) as c FROM licenses WHERE tier = 'team' AND status = 'active' AND stripe_subscription_id IS NOT NULL"))!.c;
  const cancelled = (await queryOne("SELECT COUNT(*) as c FROM licenses WHERE status = 'cancelled'"))!.c;
  const expired = (await queryOne("SELECT COUNT(*) as c FROM licenses WHERE status = 'expired'"))!.c;

  const totalPaid = paidPro + paidTeam;
  const trialToPayRate = withTrial > 0 ? ((totalPaid / withTrial) * 100).toFixed(1) : '0.0';
  const churnRate = (totalPaid + cancelled) > 0 ? ((cancelled / (totalPaid + cancelled)) * 100).toFixed(1) : '0.0';

  // MRR (Monthly Recurring Revenue)
  const mrr = (paidPro * 19) + (paidTeam * 49);

  // LTV estimate (avg subscription length * avg revenue)
  const avgRevenuePerUser = totalPaid > 0 ? mrr / totalPaid : 0;
  const estimatedLtv = avgRevenuePerUser * 12; // Assume 12-month average lifetime

  // Registrations last 7 / 30 days
  const regsLast7 = (await queryOne("SELECT COUNT(*) as c FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"))!.c;
  const regsLast30 = (await queryOne("SELECT COUNT(*) as c FROM users WHERE created_at >= NOW() - INTERVAL '30 days'"))!.c;

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
