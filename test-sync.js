
import { createDbClient, discoverConnectionString, syncDiscovery } from './packages/core/build/index.js';
import path from 'path';

async function testSync() {
  const projectPath = 'D:\\BURO-CRM\\Buro CRM\\Development';
  console.log('Testing sync for:', projectPath);
  
  const config = discoverConnectionString(projectPath);
  if (!config || !config.connectionString) {
    console.error('No connection string found');
    process.exit(1);
  }
  
  console.log('Config found from:', config.source);
  
  const db = await createDbClient(config.connectionString);
  console.log('DB connected');
  
  try {
    const result = await syncDiscovery(db, projectPath, (p) => {
      console.log(`Progress: ${p.phase} - ${p.done}/${p.total} ${p.current || ''}`);
    });
    console.log('Sync result:', result);
  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    await db.destroy();
  }
}

testSync().catch(console.error);
