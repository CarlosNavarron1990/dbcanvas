import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/dbcanvas';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  
  const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
  
  pool = new pg.Pool({ 
    connectionString: DATABASE_URL, 
    max: 10,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });
  
  return pool;
}

export async function initDb() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      license_key TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free',
      status TEXT DEFAULT 'active',
      seats INTEGER DEFAULT 1,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS license_activations (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL REFERENCES licenses(id),
      machine_id TEXT NOT NULL,
      hostname TEXT,
      activated_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(license_id, machine_id)
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id SERIAL PRIMARY KEY,
      license_id TEXT REFERENCES licenses(id),
      tool_name TEXT NOT NULL,
      project_path TEXT,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      stripe_payment_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd',
      status TEXT DEFAULT 'pending',
      tier TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS device_codes (
      device_code TEXT PRIMARY KEY,
      user_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      user_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  // Create indexes (ignore if exist)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key)',
    'CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_activations_license ON license_activations(license_id)',
    'CREATE INDEX IF NOT EXISTS idx_usage_license ON usage_events(license_id)',
    'CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_events(timestamp)',
  ];
  for (const idx of indexes) {
    await p.query(idx);
  }

  console.log('[db] PostgreSQL schema initialized');
}

/** Helper: run a query and return rows */
export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const result = await getPool().query(sql, params);
  return result.rows;
}

/** Helper: run a query and return first row */
export async function queryOne(sql: string, params: any[] = []): Promise<any | null> {
  const result = await getPool().query(sql, params);
  return result.rows[0] || null;
}

/** Helper: run an insert/update/delete and return affected count */
export async function execute(sql: string, params: any[] = []): Promise<number> {
  const result = await getPool().query(sql, params);
  return result.rowCount || 0;
}
