# DBCanvas — Licensing & Billing

## Tiers

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Basic MCP tools, 1 database connection |
| Pro | $19/month | All 14 MCP tools, unlimited databases, data lineage, SP simulator, priority support |
| Team | $49/month | Pro features + team management, shared annotations, multi-user |

## Trial

- 14-day Pro trial for new users
- No credit card required
- Auto-downgrades to Free after expiration

## Payment Provider

**PayPal Subscriptions API** (currently Sandbox mode)

- Stripe is not available in Peru → PayPal is the only option
- Sandbox credentials configured in Railway env vars
- Plans created via PayPal API (Product + 2 Plans: Pro monthly, Team monthly)

### PayPal Flow

1. User clicks "Subscribe to Pro" on account page
2. Redirect to PayPal checkout
3. PayPal webhook notifies Railway API on subscription events
4. Platform creates/updates license in PostgreSQL

## Admin Panel

- Accessible at `/admin` on the platform
- Can view all users with their license status
- **Grant Pro/Team without payment** — admin can assign tiers to users directly
- Useful for beta testers, partners, or promotional access

## License Storage

```sql
-- PostgreSQL (Railway)
CREATE TABLE licenses (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  license_key VARCHAR(255),
  tier VARCHAR(50),        -- 'free', 'pro', 'team'
  status VARCHAR(50),      -- 'active', 'expired', 'cancelled'
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Desktop License Check

- On login (device auth), the platform returns license info alongside the JWT token
- Session includes: `{ token, user: {id, email, name}, license: {key, tier, expiresAt} }`
- Displayed in Settings > Account tab
- Currently no client-side feature gating (all features available) — to be implemented

## Migration to Production

When ready to charge real money:
1. Create PayPal Production app at developer.paypal.com
2. Create Production plans (Pro $19, Team $49)
3. Update Railway env vars with production credentials
4. Test end-to-end with real PayPal account
5. Update webhook URL to production endpoint
