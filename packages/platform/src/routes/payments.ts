import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { TIERS } from '../tiers.js';

// Read at runtime (after dotenv loads)
function env(key: string, fallback = ''): string { return process.env[key] || fallback; }
const getPayPalApi = () => env('PAYPAL_API', 'https://api-m.sandbox.paypal.com');
const getPlatformUrl = () => env('PLATFORM_URL', 'http://localhost:5173');

const router = Router();

/** Get PayPal access token */
async function getPayPalToken(): Promise<string> {
  const clientId = env('PAYPAL_CLIENT_ID');
  const secret = env('PAYPAL_SECRET');
  if (!clientId || !secret) throw new Error('PayPal not configured. Set PAYPAL_CLIENT_ID and PAYPAL_SECRET.');
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${getPayPalApi()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json() as any;
  if (!data.access_token) throw new Error('PayPal auth failed');
  return data.access_token;
}

/** Get PayPal client ID for frontend SDK */
router.get('/config', (_req: Request, res: Response) => {
  res.json({ clientId: env('PAYPAL_CLIENT_ID'), plans: getPayPalPlans() });
});

function getPayPalPlans() {
  return {
    pro: { price: '19.00', name: 'DBCanvas Pro', planId: process.env.PAYPAL_PRO_PLAN_ID || '' },
    team: { price: '49.00', name: 'DBCanvas Team', planId: process.env.PAYPAL_TEAM_PLAN_ID || '' },
  };
}

/** Create a PayPal subscription */
router.post('/create-subscription', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { tier } = req.body;
    const plans = getPayPalPlans();
    const plan = plans[tier as keyof typeof plans];
    if (!plan || !plan.planId) {
      res.status(400).json({ error: `No PayPal plan configured for tier: ${tier}` });
      return;
    }

    const token = await getPayPalToken();
    const response = await fetch(`${getPayPalApi()}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': uuid(),
      },
      body: JSON.stringify({
        plan_id: plan.planId,
        application_context: {
          brand_name: 'DBCanvas',
          locale: 'en-US',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${getPlatformUrl()}/checkout/success?tier=${tier}`,
          cancel_url: `${getPlatformUrl()}/pricing`,
        },
        custom_id: req.user!.id, // Our user ID
      }),
    });

    const data = await response.json() as any;
    const approveLink = data.links?.find((l: any) => l.rel === 'approve')?.href;

    if (!approveLink) {
      res.status(500).json({ error: 'Failed to create PayPal subscription', details: data });
      return;
    }

    res.json({ url: approveLink, subscriptionId: data.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** PayPal webhook — handles subscription events */
router.post('/webhook', async (req: Request, res: Response) => {
  const event = req.body;
  const db = getDb();

  try {
    switch (event.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const sub = event.resource;
        const userId = sub.custom_id;
        const tier = sub.plan_id === process.env.PAYPAL_TEAM_PLAN_ID ? 'team' : 'pro';

        if (userId) {
          const license = db.prepare('SELECT * FROM licenses WHERE user_id = ? AND status = ?').get(userId, 'active') as any;
          if (license) {
            db.prepare("UPDATE licenses SET tier = ?, status = 'active', expires_at = NULL, updated_at = datetime('now') WHERE id = ?")
              .run(tier, license.id);
            // Store PayPal subscription ID in stripe_subscription_id field (reusing column)
            db.prepare("UPDATE licenses SET stripe_subscription_id = ? WHERE id = ?")
              .run(sub.id, license.id);
          } else {
            const licenseKey = `DBC-${tier.toUpperCase()}-${uuid().substring(0, 8).toUpperCase()}`;
            db.prepare('INSERT INTO licenses (id, user_id, license_key, tier, stripe_subscription_id) VALUES (?, ?, ?, ?, ?)')
              .run(uuid(), userId, licenseKey, tier, sub.id);
          }

          db.prepare('INSERT INTO payments (id, user_id, stripe_payment_id, amount, tier, status) VALUES (?, ?, ?, ?, ?, ?)')
            .run(uuid(), userId, sub.id, tier === 'team' ? 4900 : 1900, tier, 'completed');
        }
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        const sub = event.resource;
        db.prepare("UPDATE licenses SET tier = 'free', status = 'cancelled', updated_at = datetime('now') WHERE stripe_subscription_id = ?")
          .run(sub.id);
        break;
      }

      case 'PAYMENT.SALE.COMPLETED': {
        const sale = event.resource;
        const subId = sale.billing_agreement_id;
        if (subId) {
          const license = db.prepare('SELECT user_id, tier FROM licenses WHERE stripe_subscription_id = ?').get(subId) as any;
          if (license) {
            db.prepare('INSERT INTO payments (id, user_id, stripe_payment_id, amount, tier, status) VALUES (?, ?, ?, ?, ?, ?)')
              .run(uuid(), license.user_id, sale.id, Math.round(parseFloat(sale.amount.total) * 100), license.tier, 'completed');
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('[paypal-webhook] Error:', err);
  }

  res.json({ received: true });
});

/** Activate subscription after user approves (called from frontend) */
router.post('/activate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { subscriptionId, tier } = req.body;
    const db = getDb();

    // Verify subscription is active with PayPal
    const token = await getPayPalToken();
    const response = await fetch(`${getPayPalApi()}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const sub = await response.json() as any;

    if (sub.status === 'ACTIVE' || sub.status === 'APPROVED') {
      const license = db.prepare('SELECT * FROM licenses WHERE user_id = ? AND status = ?').get(req.user!.id, 'active') as any;
      if (license) {
        db.prepare("UPDATE licenses SET tier = ?, status = 'active', expires_at = NULL, stripe_subscription_id = ?, updated_at = datetime('now') WHERE id = ?")
          .run(tier, subscriptionId, license.id);
      }

      db.prepare('INSERT INTO payments (id, user_id, stripe_payment_id, amount, tier, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuid(), req.user!.id, subscriptionId, tier === 'team' ? 4900 : 1900, tier, 'completed');

      res.json({ success: true, tier });
    } else {
      res.status(400).json({ error: `Subscription status: ${sub.status}` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Cancel subscription */
router.post('/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const license = db.prepare('SELECT stripe_subscription_id FROM licenses WHERE user_id = ? AND status = ?').get(req.user!.id, 'active') as any;

    if (!license?.stripe_subscription_id) {
      res.status(400).json({ error: 'No active subscription' });
      return;
    }

    const token = await getPayPalToken();
    await fetch(`${getPayPalApi()}/v1/billing/subscriptions/${license.stripe_subscription_id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'User requested cancellation' }),
    });

    db.prepare("UPDATE licenses SET tier = 'free', status = 'cancelled', updated_at = datetime('now') WHERE user_id = ? AND status = 'active'")
      .run(req.user!.id);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
