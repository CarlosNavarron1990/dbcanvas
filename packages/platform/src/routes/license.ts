import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { isToolAllowed, getRequiredTier, getToolsForTier, TIERS } from '../tiers.js';

const router = Router();

/** Validate a license key (called by MCP server on every tool invocation) */
router.post('/validate', (req: Request, res: Response) => {
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

  const db = getDb();
  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ? AND status = ?').get(licenseKey, 'active') as any;

  if (!license) {
    res.json({ valid: false, error: 'Invalid or expired license key', tier: 'free', toolAllowed: isToolAllowed(toolName, 'free') });
    return;
  }

  // Check expiration
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    db.prepare('UPDATE licenses SET status = ? WHERE id = ?').run('expired', license.id);
    res.json({ valid: false, error: 'License expired', tier: 'free', toolAllowed: isToolAllowed(toolName, 'free') });
    return;
  }

  // Check seats
  if (machineId) {
    const activations = db.prepare('SELECT COUNT(*) as count FROM license_activations WHERE license_id = ?').get(license.id) as any;
    const maxSeats = TIERS[license.tier]?.seats || 1;

    if (maxSeats > 0 && activations.count >= maxSeats) {
      const existing = db.prepare('SELECT id FROM license_activations WHERE license_id = ? AND machine_id = ?').get(license.id, machineId);
      if (!existing) {
        res.json({ valid: false, error: `Seat limit reached (${maxSeats}). Deactivate another machine first.`, tier: license.tier, toolAllowed: false });
        return;
      }
    }

    // Upsert activation
    db.prepare(`
      INSERT INTO license_activations (id, license_id, machine_id, hostname, last_seen)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(license_id, machine_id) DO UPDATE SET last_seen = datetime('now')
    `).run(uuid(), license.id, machineId, req.body.hostname || '');
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
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const db = getDb();
  const license = db.prepare('SELECT * FROM licenses WHERE user_id = ? AND status = ?').get(req.user!.id, 'active') as any;
  const activations = license
    ? db.prepare('SELECT machine_id, hostname, last_seen FROM license_activations WHERE license_id = ?').all(license.id)
    : [];

  res.json({ license: license || null, activations, tools: getToolsForTier(license?.tier || 'free') });
});

/** Admin: list all licenses */
router.get('/all', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  const db = getDb();
  const licenses = db.prepare(`
    SELECT l.*, u.email, u.name,
      (SELECT COUNT(*) FROM license_activations WHERE license_id = l.id) as active_machines
    FROM licenses l
    JOIN users u ON l.user_id = u.id
    ORDER BY l.created_at DESC
  `).all();

  res.json(licenses);
});

/** Admin: update a license tier */
router.patch('/:id', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const { tier, status, seats, expires_at } = req.body;
  const db = getDb();

  const updates: string[] = [];
  const values: any[] = [];

  if (tier) { updates.push('tier = ?'); values.push(tier); }
  if (status) { updates.push('status = ?'); values.push(status); }
  if (seats !== undefined) { updates.push('seats = ?'); values.push(seats); }
  if (expires_at) { updates.push('expires_at = ?'); values.push(expires_at); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);

  db.prepare(`UPDATE licenses SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

/** Admin: create manual license (for enterprise) */
router.post('/create', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const { userId, tier, seats, expiresAt } = req.body;
  const db = getDb();

  const id = uuid();
  const prefix = tier === 'enterprise' ? 'ENT' : tier === 'team' ? 'TEAM' : 'PRO';
  const licenseKey = `DBC-${prefix}-${uuid().substring(0, 8).toUpperCase()}`;

  db.prepare('INSERT INTO licenses (id, user_id, license_key, tier, seats, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, licenseKey, tier, seats || TIERS[tier]?.seats || 1, expiresAt || null);

  res.status(201).json({ id, licenseKey, tier });
});

export default router;
