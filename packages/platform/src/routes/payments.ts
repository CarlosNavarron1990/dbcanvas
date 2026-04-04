import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryOne, execute } from '../db.js';
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

  try {
    switch (event.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const sub = event.resource;
        const userId = sub.custom_id;
        const tier = sub.plan_id === process.env.PAYPAL_TEAM_PLAN_ID ? 'team' : 'pro';

        if (userId) {
          const license = await queryOne('SELECT * FROM licenses WHERE user_id = $1 AND status = $2', [userId, 'active']);
          if (license) {
            await execute("UPDATE licenses SET tier = $1, status = 'active', expires_at = NULL, updated_at = NOW() WHERE id = $2",
              [tier, license.id]);
            // Store PayPal subscription ID in stripe_subscription_id field (reusing column)
            await execute("UPDATE licenses SET stripe_subscription_id = $1 WHERE id = $2",
              [sub.id, license.id]);
          } else {
            const licenseKey = `DBC-${tier.toUpperCase()}-${uuid().substring(0, 8).toUpperCase()}`;
            await execute('INSERT INTO licenses (id, user_id, license_key, tier, stripe_subscription_id) VALUES ($1, $2, $3, $4, $5)',
              [uuid(), userId, licenseKey, tier, sub.id]);
          }

          await execute('INSERT INTO payments (id, user_id, stripe_payment_id, amount, tier, status) VALUES ($1, $2, $3, $4, $5, $6)',
            [uuid(), userId, sub.id, tier === 'team' ? 4900 : 1900, tier, 'completed']);
        }
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        const sub = event.resource;
        await execute("UPDATE licenses SET tier = 'free', status = 'cancelled', updated_at = NOW() WHERE stripe_subscription_id = $1",
          [sub.id]);
        break;
      }

      case 'PAYMENT.SALE.COMPLETED': {
        const sale = event.resource;
        const subId = sale.billing_agreement_id;
        if (subId) {
          const license = await queryOne('SELECT user_id, tier FROM licenses WHERE stripe_subscription_id = $1', [subId]);
          if (license) {
            await execute('INSERT INTO payments (id, user_id, stripe_payment_id, amount, tier, status) VALUES ($1, $2, $3, $4, $5, $6)',
              [uuid(), license.user_id, sale.id, Math.round(parseFloat(sale.amount.total) * 100), license.tier, 'completed']);
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

    // Verify subscription is active with PayPal
    const token = await getPayPalToken();
    const response = await fetch(`${getPayPalApi()}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const sub = await response.json() as any;

    if (sub.status === 'ACTIVE' || sub.status === 'APPROVED') {
      const license = await queryOne('SELECT * FROM licenses WHERE user_id = $1 AND status = $2', [req.user!.id, 'active']);
      if (license) {
        await execute("UPDATE licenses SET tier = $1, status = 'active', expires_at = NULL, stripe_subscription_id = $2, updated_at = NOW() WHERE id = $3",
          [tier, subscriptionId, license.id]);
      }

      await execute('INSERT INTO payments (id, user_id, stripe_payment_id, amount, tier, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [uuid(), req.user!.id, subscriptionId, tier === 'team' ? 4900 : 1900, tier, 'completed']);

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
    const license = await queryOne('SELECT stripe_subscription_id FROM licenses WHERE user_id = $1 AND status = $2', [req.user!.id, 'active']);

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

    await execute("UPDATE licenses SET tier = 'free', status = 'cancelled', updated_at = NOW() WHERE user_id = $1 AND status = 'active'",
      [req.user!.id]);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
