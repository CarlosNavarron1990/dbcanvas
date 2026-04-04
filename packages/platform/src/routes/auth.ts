import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db.js';
import { generateToken } from '../middleware/auth.js';
import { sendJson, sendError } from '../utils.js';

const router = Router();
function env(key: string): string { return process.env[key] || ''; }

// ==================== Email/Password ====================

router.post('/register', (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  if (!email || !password) { sendError(res, 400, 'Email and password required'); return; }
  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) { sendError(res, 409, 'Email already registered'); return; }
  const result = createUserWithTrial(db, email, name || '', bcrypt.hashSync(password, 10));
  sendJson(res, result, 201);
});

router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) { sendError(res, 400, 'Email and password required'); return; }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) { sendError(res, 401, 'Invalid credentials'); return; }
  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  const license = db.prepare("SELECT license_key, tier, status, expires_at FROM licenses WHERE user_id = ? AND status = 'active'").get(user.id) as any;
  sendJson(res, { token, user: { id: user.id, email: user.email, name: user.name, role: user.role }, license: license || null });
});

// ==================== GitHub OAuth ====================

router.get('/github', (_req: Request, res: Response) => {
  const clientId = env('GITHUB_CLIENT_ID');
  if (!clientId) { sendError(res, 500, 'GitHub OAuth not configured'); return; }
  const redirectUri = encodeURIComponent(env('PLATFORM_URL') + '/api/auth/github/callback');
  res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&scope=user:email&redirect_uri=${redirectUri}`);
});

router.get('/github/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) { sendError(res, 400, 'Missing code'); return; }
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: env('GITHUB_CLIENT_ID'), client_secret: env('GITHUB_CLIENT_SECRET'), code }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error('GitHub token exchange failed');
    const userRes = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' } });
    const ghUser = await userRes.json() as any;
    let email = ghUser.email;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' } });
      const emails = await emailsRes.json() as any[];
      email = emails.find((e: any) => e.primary)?.email || emails[0]?.email;
    }
    if (!email) throw new Error('Could not get email from GitHub');
    const result = findOrCreateOAuthUser(email, ghUser.name || ghUser.login);
    res.redirect(`${env('FRONTEND_URL') || 'https://dbcanvas-web.vercel.app'}/auth/callback?token=${result.token}&provider=github`);
  } catch (err: any) { sendError(res, 500, err.message); }
});

// ==================== Google OAuth ====================

router.get('/google', (_req: Request, res: Response) => {
  const clientId = env('GOOGLE_CLIENT_ID');
  if (!clientId) { sendError(res, 500, 'Google OAuth not configured'); return; }
  const redirectUri = encodeURIComponent(env('PLATFORM_URL') + '/api/auth/google/callback');
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=email%20profile&access_type=offline`);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) { sendError(res, 400, 'Missing code'); return; }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: env('PLATFORM_URL') + '/api/auth/google/callback', grant_type: 'authorization_code' }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error('Google token exchange failed');
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const gUser = await userRes.json() as any;
    if (!gUser.email) throw new Error('Could not get email from Google');
    const result = findOrCreateOAuthUser(gUser.email, gUser.name || '');
    res.redirect(`${env('FRONTEND_URL') || 'https://dbcanvas-web.vercel.app'}/auth/callback?token=${result.token}&provider=google`);
  } catch (err: any) { sendError(res, 500, err.message); }
});

// ==================== Helpers ====================

function findOrCreateOAuthUser(email: string, name: string) {
  const db = getDb();
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user) return createUserWithTrial(db, email, name, bcrypt.hashSync(uuid(), 10));
  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  const license = db.prepare("SELECT license_key, tier, status, expires_at FROM licenses WHERE user_id = ? AND status = 'active'").get(user.id) as any;
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role }, license };
}

function createUserWithTrial(db: any, email: string, name: string, passwordHash: string) {
  const id = uuid();
  db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(id, email, name, passwordHash);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const licenseKey = `DBC-TRIAL-${uuid().substring(0, 8).toUpperCase()}`;
  db.prepare('INSERT INTO licenses (id, user_id, license_key, tier, expires_at) VALUES (?, ?, ?, ?, ?)').run(uuid(), id, licenseKey, 'pro', expiresAt);
  const token = generateToken({ id, email, role: 'user' });
  return { token, user: { id, email, name }, license: { key: licenseKey, tier: 'pro', trialEnds: expiresAt } };
}

export default router;
