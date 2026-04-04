import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne, execute } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

/** Get full account profile */
router.get('/profile', async (req: Request, res: Response) => {
  const user = await queryOne('SELECT id, email, name, role, created_at FROM users WHERE id = $1', [req.user!.id]);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

/** Update profile (name) */
router.patch('/profile', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (name !== undefined) {
    await execute('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name, req.user!.id]);
  }
  res.json({ success: true });
});

/** Change password */
router.post('/change-password', async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) { res.status(400).json({ error: 'Both passwords required' }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }

  const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  await execute('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [bcrypt.hashSync(newPassword, 10), req.user!.id]);
  res.json({ success: true });
});

/** Get billing info (license + payments) */
router.get('/billing', async (req: Request, res: Response) => {
  const license = await queryOne(`
    SELECT license_key, tier, status, expires_at, stripe_subscription_id, created_at,
      CASE WHEN license_key LIKE 'DBC-TRIAL%' THEN true ELSE false END as is_trial,
      CASE WHEN expires_at IS NOT NULL AND expires_at > NOW()
        THEN EXTRACT(DAY FROM expires_at - NOW())::int ELSE NULL END as days_remaining
    FROM licenses WHERE user_id = $1 AND status = 'active'
  `, [req.user!.id]);

  const payments = await query(
    'SELECT id, amount, currency, tier, status, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [req.user!.id]
  );

  res.json({ license: license || null, payments });
});

/** Get license details + activations */
router.get('/license', async (req: Request, res: Response) => {
  const license = await queryOne(`
    SELECT l.*,
      CASE WHEN l.license_key LIKE 'DBC-TRIAL%' THEN true ELSE false END as is_trial,
      CASE WHEN l.expires_at IS NOT NULL AND l.expires_at > NOW()
        THEN EXTRACT(DAY FROM l.expires_at - NOW())::int ELSE NULL END as days_remaining
    FROM licenses l WHERE l.user_id = $1 AND l.status = 'active'
  `, [req.user!.id]);

  const activations = license ? await query(
    'SELECT machine_id, hostname, activated_at, last_seen FROM license_activations WHERE license_id = $1 ORDER BY last_seen DESC',
    [license.id]
  ) : [];

  res.json({ license: license || null, activations });
});

/** Get usage stats */
router.get('/usage', async (req: Request, res: Response) => {
  const license = await queryOne("SELECT id FROM licenses WHERE user_id = $1 AND status = 'active'", [req.user!.id]);

  const totalCalls = license ? (await queryOne(
    'SELECT COUNT(*) as c FROM usage_events WHERE license_id = $1', [license.id]
  ))?.c || 0 : 0;

  const recentTools = license ? await query(`
    SELECT tool_name, COUNT(*) as count FROM usage_events
    WHERE license_id = $1 AND timestamp >= NOW() - INTERVAL '30 days'
    GROUP BY tool_name ORDER BY count DESC
  `, [license.id]) : [];

  res.json({ totalCalls, recentTools });
});

export default router;
