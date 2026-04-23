import knex from 'knex';
import { syncDiscovery } from '../packages/core/build/discovery.js';
import { getStore } from '../packages/core/build/local-store.js';

const connectionString = "Server=10.90.1.16;Database=SavarExpressBD_Test;User Id=savaradmin;Password=Savar2020.;Encrypt=false;";

const parts = connectionString.split(';');
const config = {
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 30000,
        requestTimeout: 60000,
    }
};
parts.forEach(part => {
    const eqIndex = part.indexOf('=');
    if (eqIndex < 0) return;
    const key = part.substring(0, eqIndex).trim().toLowerCase();
    const value = part.substring(eqIndex + 1).trim();
    if (key === 'server') config.server = value;
    if (key === 'database') config.database = value;
    if (key === 'user id') config.user = value;
    if (key === 'password') config.password = value;
});

const db = knex({
    client: 'mssql',
    connection: config
});

async function run() {
  try {
    const result = await syncDiscovery(db, "/Users/xmn/Documents/Trabajo/Savar/Govari/sisGoVari");
    console.log('Sync result:', result);
  } catch (e) {
    console.error(e);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

run();
