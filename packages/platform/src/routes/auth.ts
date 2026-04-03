import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

router.post('/register', (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(id, email, name || '', hash);

  // Create Pro trial license (14 days)
  const TRIAL_DAYS = 14;
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const licenseKey = `DBC-TRIAL-${uuid().substring(0, 8).toUpperCase()}`;
  const licenseId = uuid();
  db.prepare('INSERT INTO licenses (id, user_id, license_key, tier, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(licenseId, id, licenseKey, 'pro', expiresAt);

  const token = generateToken({ id, email, role: 'user' });
  res.status(201).json({
    token,
    user: { id, email, name },
    license: { key: licenseKey, tier: 'pro', trialEnds: expiresAt },
  });
});

router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  const license = db.prepare('SELECT license_key, tier, status FROM licenses WHERE user_id = ? AND status = ?').get(user.id, 'active') as any;

  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role }, license: license || null });
});

export default router;
