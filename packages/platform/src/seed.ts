import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { initDb, queryOne, execute } from './db.js';

async function seed() {
  await initDb();

  // Create admin user
  const adminId = uuid();
  const adminPass = bcrypt.hashSync('admin123', 10);
  const adminEmail = 'admin@dbcanvas.dev';

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (!existing) {
    await execute('INSERT INTO users (id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [adminId, adminEmail, 'Admin', adminPass, 'admin']);

    const licenseKey = `DBC-ENT-${uuid().substring(0, 8).toUpperCase()}`;
    await execute('INSERT INTO licenses (id, user_id, license_key, tier, seats) VALUES ($1, $2, $3, $4, $5)',
      [uuid(), adminId, licenseKey, 'enterprise', -1]);

    console.log(`Admin created: ${adminEmail} / admin123`);
    console.log(`License key: ${licenseKey}`);
  } else {
    console.log('Admin already exists');
  }

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
