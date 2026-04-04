import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { getDb } from '../db.js';
import { authMiddleware, generateToken } from '../middleware/auth.js';

const router = Router();

/**
 * Device Authorization Flow (similar to GitHub/Figma):
 *
 * 1. Desktop app calls POST /code → gets a user_code + device_code
 * 2. App shows user_code and opens browser to /auth/device
 * 3. User enters user_code in browser (already logged in)
 * 4. User clicks "Authorize" → POST /authorize
 * 5. Desktop app polls POST /poll with device_code → gets token when authorized
 */

// Ensure device_codes table exists
function ensureTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_codes (
      device_code TEXT PRIMARY KEY,
      user_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'authorized', 'expired')),
      user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);
}

/** Step 1: Desktop app requests a device code */
router.post('/code', (_req: Request, res: Response) => {
  ensureTable();
  const db = getDb();

  // Clean expired codes
  db.prepare("DELETE FROM device_codes WHERE expires_at < datetime('now')").run();

  const deviceCode = uuid();
  // User-friendly 6-char code (easy to type)
  const userCode = crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "A3F2B1"
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  db.prepare('INSERT INTO device_codes (device_code, user_code, expires_at) VALUES (?, ?, ?)')
    .run(deviceCode, userCode, expiresAt);

  const verificationUrl = `${process.env.PLATFORM_URL || 'https://dbcanvas-web.vercel.app'}/auth/device`;

  res.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_url: verificationUrl,
    expires_in: 600, // seconds
    interval: 3, // poll every 3 seconds
  });
});

/** Step 3: User authorizes the device (from browser, must be logged in) */
router.post('/authorize', authMiddleware, (req: Request, res: Response) => {
  ensureTable();
  const { user_code } = req.body;
  if (!user_code) { res.status(400).json({ error: 'user_code required' }); return; }

  const db = getDb();
  const code = db.prepare("SELECT * FROM device_codes WHERE user_code = ? AND status = 'pending' AND expires_at > datetime('now')")
    .get(user_code.toUpperCase()) as any;

  if (!code) {
    res.status(404).json({ error: 'Invalid or expired code' });
    return;
  }

  db.prepare("UPDATE device_codes SET status = 'authorized', user_id = ? WHERE device_code = ?")
    .run(req.user!.id, code.device_code);

  res.json({ success: true, message: 'Device authorized' });
});

/** Step 5: Desktop app polls for authorization */
router.post('/poll', (req: Request, res: Response) => {
  ensureTable();
  const { device_code } = req.body;
  if (!device_code) { res.status(400).json({ error: 'device_code required' }); return; }

  const db = getDb();
  const code = db.prepare('SELECT * FROM device_codes WHERE device_code = ?').get(device_code) as any;

  if (!code) {
    res.status(404).json({ error: 'authorization_pending', message: 'Code not found' });
    return;
  }

  if (new Date(code.expires_at) < new Date()) {
    db.prepare("UPDATE device_codes SET status = 'expired' WHERE device_code = ?").run(device_code);
    res.status(410).json({ error: 'expired_token', message: 'Code expired. Request a new one.' });
    return;
  }

  if (code.status === 'pending') {
    res.status(202).json({ error: 'authorization_pending', message: 'Waiting for user to authorize...' });
    return;
  }

  if (code.status === 'authorized' && code.user_id) {
    // Get user info and license
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(code.user_id) as any;
    const license = db.prepare("SELECT * FROM licenses WHERE user_id = ? AND status = 'active'").get(code.user_id) as any;

    if (!user) {
      res.status(500).json({ error: 'server_error', message: 'User not found' });
      return;
    }

    // Generate token for desktop app
    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    // Clean up used code
    db.prepare('DELETE FROM device_codes WHERE device_code = ?').run(device_code);

    res.json({
      status: 'authorized',
      token,
      user: { id: user.id, email: user.email, name: user.name },
      license: license ? {
        key: license.license_key,
        tier: license.tier,
        expiresAt: license.expires_at,
      } : null,
    });
    return;
  }

  res.status(400).json({ error: 'unknown_status' });
});

export default router;
