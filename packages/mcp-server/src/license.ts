import * as http from 'http';
import * as os from 'os';

const PLATFORM_URL = process.env.DBCANVAS_PLATFORM_URL || 'http://127.0.0.1:4000';
const LICENSE_KEY = process.env.DBCANVAS_LICENSE_KEY || '';

interface LicenseValidation {
  valid: boolean;
  tier: string;
  toolAllowed: boolean;
  requiredTier?: string;
  error?: string;
}

// Cache validations for 5 minutes to avoid hitting the server on every tool call
const cache = new Map<string, { result: LicenseValidation; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Validate if the current license allows a specific tool.
 * Falls back to free tier if platform server is unreachable.
 */
export async function validateToolAccess(toolName: string): Promise<LicenseValidation> {
  const cacheKey = `${LICENSE_KEY}:${toolName}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.result;
  }

  // If no license key and no platform URL, allow everything (dev mode)
  if (!LICENSE_KEY && !process.env.DBCANVAS_PLATFORM_URL) {
    return { valid: true, tier: 'enterprise', toolAllowed: true };
  }

  try {
    const result = await callPlatform('/api/license/validate', {
      licenseKey: LICENSE_KEY,
      toolName,
      machineId: getMachineId(),
      hostname: os.hostname(),
    });

    cache.set(cacheKey, { result, expires: Date.now() + CACHE_TTL });

    // Track usage in background (don't await)
    callPlatform('/api/usage/track', { licenseKey: LICENSE_KEY, toolName }).catch(() => {});

    return result;
  } catch {
    // Platform unreachable — fallback to free tier (graceful degradation)
    const fallback: LicenseValidation = {
      valid: true,
      tier: LICENSE_KEY ? 'pro' : 'free', // If they have a key, give benefit of doubt
      toolAllowed: true,
    };
    cache.set(cacheKey, { result: fallback, expires: Date.now() + CACHE_TTL });
    return fallback;
  }
}

function getMachineId(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const info of iface) {
      if (!info.internal && info.mac !== '00:00:00:00:00:00') {
        return info.mac;
      }
    }
  }
  return os.hostname();
}

function callPlatform(path: string, body: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PLATFORM_URL);
    const data = JSON.stringify(body);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 3000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid response')); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}
