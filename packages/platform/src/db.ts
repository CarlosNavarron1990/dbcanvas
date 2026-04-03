import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'platform.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function initSchema(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      license_key TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'pro', 'team', 'enterprise')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled', 'suspended')),
      seats INTEGER DEFAULT 1,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS license_activations (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL REFERENCES licenses(id),
      machine_id TEXT NOT NULL,
      hostname TEXT,
      activated_at TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now')),
      UNIQUE(license_id, machine_id)
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id TEXT REFERENCES licenses(id),
      tool_name TEXT NOT NULL,
      project_path TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      stripe_payment_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd',
      status TEXT DEFAULT 'pending',
      tier TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
    CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id);
    CREATE INDEX IF NOT EXISTS idx_activations_license ON license_activations(license_id);
    CREATE INDEX IF NOT EXISTS idx_usage_license ON usage_events(license_id);
    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_events(timestamp);
  `);
}
