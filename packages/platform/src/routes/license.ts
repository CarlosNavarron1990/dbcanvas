import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { query, queryOne, execute } from '../db.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { isToolAllowed, getRequiredTier, getToolsForTier, TIERS } from '../tiers.js';

const router = Router();

/** Validate a license key (called by MCP server on every tool invocation) */
router.post('/validate', async (req: Request, res: Response) => {
  const { licenseKey, toolName, machineId } = req.body;
  if (!licenseKey) {
    // No license = free tier
    const allowed = isToolAllowed(toolName, 'free');
    res.json({
      valid: true,
      tier: 'free',
      toolAllowed: allowed,
      requiredTier: allowed ? 'free' : getRequiredTier(toolName),
    });
    return;
  }

  const license = await queryOne('SELECT * FROM licenses WHERE license_key = $1 AND status = $2', [licenseKey, 'active']);

  if (!license) {
    res.json({ valid: false, error: 'Invalid or expired license key', tier: 'free', toolAllowed: isToolAllowed(toolName, 'free') });
    return;
  }

  // Check expiration
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    await execute('UPDATE licenses SET status = $1 WHERE id = $2', ['expired', license.id]);
    res.json({ valid: false, error: 'License expired', tier: 'free', toolAllowed: isToolAllowed(toolName, 'free') });
    return;
  }

  // Check seats
  if (machineId) {
    const activations = await queryOne('SELECT COUNT(*) as count FROM license_activations WHERE license_id = $1', [license.id]);
    const maxSeats = TIERS[license.tier]?.seats || 1;

    if (maxSeats > 0 && activations!.count >= maxSeats) {
      const existing = await queryOne('SELECT id FROM license_activations WHERE license_id = $1 AND machine_id = $2', [license.id, machineId]);
      if (!existing) {
        res.json({ valid: false, error: `Seat limit reached (${maxSeats}). Deactivate another machine first.`, tier: license.tier, toolAllowed: false });
        return;
      }
    }

    // Upsert activation
    await execute(`
      INSERT INTO license_activations (id, license_id, machine_id, hostname, last_seen)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT(license_id, machine_id) DO UPDATE SET last_seen = NOW()
    `, [uuid(), license.id, machineId, req.body.hostname || '']);
  }

  const allowed = isToolAllowed(toolName, license.tier);
  res.json({
    valid: true,
    tier: license.tier,
    toolAllowed: allowed,
    requiredTier: allowed ? license.tier : getRequiredTier(toolName),
    tools: getToolsForTier(license.tier),
  });
});

/** Get current user's license */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const license = await queryOne('SELECT * FROM licenses WHERE user_id = $1 AND status = $2', [req.user!.id, 'active']);
  const activations = license
    ? await query('SELECT machine_id, hostname, last_seen FROM license_activations WHERE license_id = $1', [license.id])
    : [];

  res.json({ license: license || null, activations, tools: getToolsForTier(license?.tier || 'free') });
});

/** Admin: list all licenses */
router.get('/all', authMiddleware, adminMiddleware, async (_req: Request, res: Response) => {
  const licenses = await query(`
    SELECT l.*, u.email, u.name,
      (SELECT COUNT(*) FROM license_activations WHERE license_id = l.id) as active_machines
    FROM licenses l
    JOIN users u ON l.user_id = u.id
    ORDER BY l.created_at DESC
  `);

  res.json(licenses);
});

/** Admin: update a license tier */
router.patch('/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { tier, status, seats, expires_at } = req.body;

  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (tier) { updates.push(`tier = $${paramIndex++}`); values.push(tier); }
  if (status) { updates.push(`status = $${paramIndex++}`); values.push(status); }
  if (seats !== undefined) { updates.push(`seats = $${paramIndex++}`); values.push(seats); }
  if (expires_at) { updates.push(`expires_at = $${paramIndex++}`); values.push(expires_at); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push('updated_at = NOW()');
  values.push(req.params.id);

  await execute(`UPDATE licenses SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
  res.json({ success: true });
});

/** Admin: create manual license (for enterprise) */
router.post('/create', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { userId, tier, seats, expiresAt } = req.body;

  const id = uuid();
  const prefix = tier === 'enterprise' ? 'ENT' : tier === 'team' ? 'TEAM' : 'PRO';
  const licenseKey = `DBC-${prefix}-${uuid().substring(0, 8).toUpperCase()}`;

  await execute('INSERT INTO licenses (id, user_id, license_key, tier, seats, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, userId, licenseKey, tier, seats || TIERS[tier]?.seats || 1, expiresAt || null]);

  res.status(201).json({ id, licenseKey, tier });
});

export default router;
