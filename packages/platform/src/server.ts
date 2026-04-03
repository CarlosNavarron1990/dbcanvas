import fs from 'fs';
import { fileURLToPath as furl } from 'url';
import { dirname as dn, join as pjoin } from 'path';

// Load .env only for local dev — Railway injects env vars directly
const envPath = pjoin(dn(furl(import.meta.url)), '..', '.env');
if (fs.existsSync(envPath)) {
  const dotenv = await import('dotenv');
  dotenv.config({ path: envPath });
}

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import licenseRoutes from './routes/license.js';
import stripeRoutes from './routes/stripe.js';
import adminRoutes from './routes/admin.js';
import usageRoutes from './routes/usage.js';
import paymentRoutes from './routes/payments.js';
import { startCron } from './cron.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || process.env.PLATFORM_PORT || '4000');

const app = express();

// Stripe webhook needs raw body
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
});

// Serve admin panel static files
const adminDist = path.join(__dirname, '..', 'admin', 'dist');
app.use(express.static(adminDist));
app.use((_req, res) => {
  res.sendFile(path.join(adminDist, 'index.html'));
});

const HOST = process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`DBCanvas Platform running at http://${HOST}:${PORT}`);
  startCron();
});
