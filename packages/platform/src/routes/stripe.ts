import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { v4 as uuid } from 'uuid';
import { queryOne, execute } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { TIERS } from '../tiers.js';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured. Set it in environment variables.');
    _stripe = new Stripe(key, { apiVersion: '2025-03-31.basil' as any });
  }
  return _stripe;
}

const router = Router();

/** Create a Stripe Checkout session for upgrading */
router.post('/checkout', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { tier } = req.body;
    const tierConfig = TIERS[tier];
    if (!tierConfig || !tierConfig.stripePriceId) {
      res.status(400).json({ error: `Invalid tier: ${tier}` });
      return;
    }

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.user!.id]);
    const license = await queryOne('SELECT * FROM licenses WHERE user_id = $1 AND status = $2', [req.user!.id, 'active']);

    // Get or create Stripe customer
    let customerId = license?.stripe_customer_id;
    if (!customerId) {
      const customer = await getStripe().customers.create({ email: user.email, name: user.name, metadata: { dbcanvas_user_id: user.id } });
      customerId = customer.id;
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: tierConfig.stripePriceId, quantity: 1 }],
      success_url: `${process.env.PLATFORM_URL || 'http://localhost:4000'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PLATFORM_URL || 'http://localhost:4000'}/checkout/cancel`,
      metadata: {
        dbcanvas_user_id: req.user!.id,
        dbcanvas_tier: tier,
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Stripe webhook — handles payment events */
router.post('/webhook', async (req: Request, res: Response) => {
  let event: Stripe.Event;

  try {
    if (WEBHOOK_SECRET) {
      const sig = req.headers['stripe-signature'] as string;
      event = getStripe().webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
    } else {
      event = req.body as Stripe.Event;
    }
  } catch (err: any) {
    res.status(400).json({ error: `Webhook error: ${err.message}` });
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.dbcanvas_user_id;
      const tier = session.metadata?.dbcanvas_tier || 'pro';

      if (userId) {
        // Upgrade license
        const license = await queryOne('SELECT * FROM licenses WHERE user_id = $1 AND status = $2', [userId, 'active']);
        if (license) {
          await execute('UPDATE licenses SET tier = $1, stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = NOW() WHERE id = $4',
            [tier, session.customer, session.subscription, license.id]);
        } else {
          const licenseKey = `DBC-${tier.toUpperCase()}-${uuid().substring(0, 8).toUpperCase()}`;
          await execute('INSERT INTO licenses (id, user_id, license_key, tier, stripe_customer_id, stripe_subscription_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [uuid(), userId, licenseKey, tier, session.customer, session.subscription]);
        }

        // Record payment
        await execute('INSERT INTO payments (id, user_id, stripe_payment_id, amount, tier, status) VALUES ($1, $2, $3, $4, $5, $6)',
          [uuid(), userId, session.payment_intent || session.id, session.amount_total || 0, tier, 'completed']);
      }
      break;
    }

    case 'customer.subscription.deleted':
    case 'customer.subscription.paused': {
      const sub = event.data.object as Stripe.Subscription;
      // Downgrade to free
      await execute("UPDATE licenses SET tier = 'free', status = 'cancelled', updated_at = NOW() WHERE stripe_subscription_id = $1",
        [sub.id]);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await execute("UPDATE licenses SET status = 'suspended', updated_at = NOW() WHERE stripe_customer_id = $1",
        [invoice.customer]);
      break;
    }
  }

  res.json({ received: true });
});

/** Get customer portal link */
router.post('/portal', authMiddleware, async (req: Request, res: Response) => {
  try {
    const license = await queryOne('SELECT stripe_customer_id FROM licenses WHERE user_id = $1 AND status = $2', [req.user!.id, 'active']);

    if (!license?.stripe_customer_id) {
      res.status(400).json({ error: 'No active subscription' });
      return;
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: license.stripe_customer_id,
      return_url: `${process.env.PLATFORM_URL || 'http://localhost:4000'}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
