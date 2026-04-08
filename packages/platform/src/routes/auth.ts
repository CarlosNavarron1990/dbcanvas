import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { queryOne, execute } from '../db.js';
import { generateToken } from '../middleware/auth.js';
import { sendJson, sendError } from '../utils.js';

const router = Router();
function env(key: string): string { return process.env[key] || ''; }

// ==================== Email/Password ====================

router.post('/register', async (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  if (!email || !password) { sendError(res, 400, 'Email and password required'); return; }
  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) { sendError(res, 409, 'Email already registered'); return; }
  const result = await createUserWithTrial(email, name || '', bcrypt.hashSync(password, 10));
  sendJson(res, result, 201);
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) { sendError(res, 400, 'Email and password required'); return; }
  const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) { sendError(res, 401, 'Invalid credentials'); return; }
  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  const license = await queryOne("SELECT license_key, tier, status, expires_at FROM licenses WHERE user_id = $1 AND status = 'active'", [user.id]);
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
    const result = await findOrCreateOAuthUser(email, ghUser.name || ghUser.login);
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
    console.log('[auth] Exchanging Google auth code for token...');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: env('PLATFORM_URL') + '/api/auth/google/callback', grant_type: 'authorization_code' }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      console.error('[auth] Google token exchange failed:', tokenData);
      throw new Error('Google token exchange failed');
    }
    
    console.log('[auth] Fetching Google user info...');
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const gUser = await userRes.json() as any;
    if (!gUser.email) {
      console.error('[auth] Google user info missing email:', gUser);
      throw new Error('Could not get email from Google');
    }
    
    console.log('[auth] Finding or creating user in database:', gUser.email);
    const result = await findOrCreateOAuthUser(gUser.email, gUser.name || '');
    
    console.log('[auth] Google login successful, redirecting to frontend...');
    res.redirect(`${env('FRONTEND_URL') || 'https://dbcanvas-web.vercel.app'}/auth/callback?token=${result.token}&provider=google`);
  } catch (err: any) { sendError(res, 500, err.message); }
});

// ==================== Helpers ====================

async function findOrCreateOAuthUser(email: string, name: string) {
  let user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
  if (!user) return createUserWithTrial(email, name, bcrypt.hashSync(uuid(), 10));
  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  const license = await queryOne("SELECT license_key, tier, status, expires_at FROM licenses WHERE user_id = $1 AND status = 'active'", [user.id]);
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role }, license };
}

async function createUserWithTrial(email: string, name: string, passwordHash: string) {
  const id = uuid();
  await execute('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [id, email, name, passwordHash]);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const licenseKey = `DBC-TRIAL-${uuid().substring(0, 8).toUpperCase()}`;
  await execute('INSERT INTO licenses (id, user_id, license_key, tier, expires_at) VALUES ($1, $2, $3, $4, $5)', [uuid(), id, licenseKey, 'pro', expiresAt]);
  const token = generateToken({ id, email, role: 'user' });
  return { token, user: { id, email, name }, license: { key: licenseKey, tier: 'pro', trialEnds: expiresAt } };
}

export default router;
