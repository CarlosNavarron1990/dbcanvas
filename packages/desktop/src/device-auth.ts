import { shell, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PLATFORM_API = process.env.DBCANVAS_PLATFORM_URL || 'https://dbcanvasplatform-production.up.railway.app';
const SESSION_PATH = path.join(os.homedir(), '.dbcanvas_session.json');

interface Session {
  token: string;
  user: { id: string; email: string; name: string };
  license: { key: string; tier: string; expiresAt?: string } | null;
}

/** Load saved session from disk */
export function loadSession(): Session | null {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    }
  } catch {}
  return null;
}

/** Save session to disk */
function saveSession(session: Session) {
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
}

/** Clear session */
function clearSession() {
  try { fs.unlinkSync(SESSION_PATH); } catch {}
}

/** Start the device auth flow */
async function startDeviceAuth(): Promise<{ deviceCode: string; userCode: string; verificationUrl: string }> {
  const res = await fetch(`${PLATFORM_API}/api/auth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json() as any;
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUrl: data.verification_url,
  };
}

/** Poll for authorization */
async function pollDeviceAuth(deviceCode: string): Promise<Session | null> {
  const res = await fetch(`${PLATFORM_API}/api/auth/device/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_code: deviceCode }),
  });

  if (res.status === 202) return null; // Still pending
  if (res.status === 410) throw new Error('expired'); // Code expired
  if (!res.ok) throw new Error('poll_failed');

  const data = await res.json() as any;
  if (data.status === 'authorized') {
    const session: Session = {
      token: data.token,
      user: data.user,
      license: data.license,
    };
    saveSession(session);
    return session;
  }

  return null;
}

/** Register IPC handlers for device auth */
export function registerDeviceAuthHandlers() {
  ipcMain.handle('dbcanvas:auth-get-session', async () => {
    return loadSession();
  });

  ipcMain.handle('dbcanvas:auth-start-login', async () => {
    const { deviceCode, userCode, verificationUrl } = await startDeviceAuth();
    // Open browser for user to authorize
    shell.openExternal(`${verificationUrl}?code=${userCode}`);
    return { deviceCode, userCode, verificationUrl };
  });

  ipcMain.handle('dbcanvas:auth-poll', async (_event, deviceCode: string) => {
    try {
      return await pollDeviceAuth(deviceCode);
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('dbcanvas:auth-logout', async () => {
    clearSession();
    return { success: true };
  });
}
