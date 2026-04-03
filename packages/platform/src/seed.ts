import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';

const db = getDb();

// Create admin user
const adminId = uuid();
const adminPass = bcrypt.hashSync('admin123', 10);
const adminEmail = 'admin@dbcanvas.dev';

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!existing) {
  db.prepare('INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(adminId, adminEmail, 'Admin', adminPass, 'admin');

  const licenseKey = `DBC-ENT-${uuid().substring(0, 8).toUpperCase()}`;
  db.prepare('INSERT INTO licenses (id, user_id, license_key, tier, seats) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), adminId, licenseKey, 'enterprise', -1);

  console.log(`Admin created: ${adminEmail} / admin123`);
  console.log(`License key: ${licenseKey}`);
} else {
  console.log('Admin already exists');
}
