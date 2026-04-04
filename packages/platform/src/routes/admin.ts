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

/** List all users with full license details */
router.get('/users', async (_req: Request, res: Response) => {
  const users = await query(`
    SELECT u.id, u.email, u.name, u.role, u.created_at,
      l.tier, l.status as license_status, l.license_key, l.expires_at,
      l.stripe_subscription_id,
      CASE
        WHEN l.license_key LIKE 'DBC-TRIAL%' THEN 'trial'
        WHEN l.stripe_subscription_id IS NOT NULL THEN 'paid'
        ELSE 'free'
      END as license_type,
      CASE
        WHEN l.expires_at IS NOT NULL AND l.expires_at > NOW() THEN
          EXTRACT(DAY FROM l.expires_at - NOW())::int
        ELSE NULL
      END as days_remaining,
      (SELECT COUNT(*) FROM license_activations la WHERE la.license_id = l.id) as active_machines
    FROM users u
    LEFT JOIN licenses l ON u.id = l.user_id AND l.status = 'active'
    ORDER BY u.created_at DESC
  `);
  res.json(users);
});

/** Get user details with activations */
router.get('/users/:id', async (req: Request, res: Response) => {
  const userId = req.params.id;
  const user = await queryOne(`
    SELECT u.*, l.license_key, l.tier, l.status as license_status, l.expires_at,
      l.stripe_subscription_id, l.id as license_id, l.created_at as license_created
    FROM users u
    LEFT JOIN licenses l ON u.id = l.user_id AND l.status = 'active'
    WHERE u.id = $1
  `, [userId]);

  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const activations = user.license_id ? await query(
    'SELECT machine_id, hostname, activated_at, last_seen FROM license_activations WHERE license_id = $1 ORDER BY last_seen DESC',
    [user.license_id]
  ) : [];

  const usageCount = (await queryOne(
    'SELECT COUNT(*) as c FROM usage_events ue JOIN licenses l ON ue.license_id = l.id WHERE l.user_id = $1',
    [userId]
  ))?.c || 0;

  const payments = await query(
    'SELECT id, amount, currency, tier, status, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  res.json({ ...user, activations, usage_count: usageCount, payments });
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

/** Admin: Grant/revoke tier to a user (no payment required) */
router.post('/grant', async (req: Request, res: Response) => {
  const { userId, tier } = req.body;
  if (!userId || !tier) { res.status(400).json({ error: 'userId and tier required' }); return; }

  const validTiers = ['free', 'pro', 'team', 'enterprise'];
  if (!validTiers.includes(tier)) { res.status(400).json({ error: 'Invalid tier' }); return; }

  // Check if user exists
  const user = await queryOne('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  // Get existing license
  const license = await queryOne("SELECT id, license_key FROM licenses WHERE user_id = $1 AND status = 'active'", [userId]);

  if (tier === 'free') {
    // Downgrade: expire the current license
    if (license) {
      await execute("UPDATE licenses SET tier = 'free', expires_at = NULL, updated_at = NOW() WHERE id = $1", [license.id]);
    }
    res.json({ success: true, message: `User downgraded to FREE` });
  } else {
    // Upgrade: update existing or create new license
    if (license) {
      await execute("UPDATE licenses SET tier = $1, status = 'active', expires_at = NULL, updated_at = NOW() WHERE id = $2", [tier, license.id]);
      res.json({ success: true, message: `User upgraded to ${tier.toUpperCase()}`, licenseKey: license.license_key });
    } else {
      const { v4: uuid } = await import('uuid');
      const licenseKey = `DBC-${tier.toUpperCase()}-${uuid().substring(0, 8).toUpperCase()}`;
      await execute(
        'INSERT INTO licenses (id, user_id, license_key, tier, status) VALUES ($1, $2, $3, $4, $5)',
        [uuid(), userId, licenseKey, tier, 'active']
      );
      res.json({ success: true, message: `User granted ${tier.toUpperCase()}`, licenseKey });
    }
  }
});

export default router;
