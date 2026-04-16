import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import {
  getDiscoveryGraph, syncDiscovery, getShadowData, captureShadowData,
  createDbClient, discoverConnectionString, getRegisteredProjects,
  getProcedureCode, getTableColumns,
} from '@dbcanvas/core';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeParam(name: string | string[]): string {
  const raw = Array.isArray(name) ? name[0] : name;
  if (!raw) throw new Error('Missing parameter');
  const clean = raw.replace(/[\/\\]/g, '').replace(/\.\./g, '');
  if (!clean || clean !== raw) throw new Error(`Invalid parameter: ${raw}`);
  return clean;
}

/** Express 5 res.json() can mangle Knex objects. Use this instead. */
function sendJson(res: Response, data: unknown) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function sendError(res: Response, status: number, message: string) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

export function startServer(port: number = 3000) {
  const app = express();
  app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://'] }));
  app.use(express.json());

  // ==================== API ROUTES ====================

  app.get('/api/projects', (_req: Request, res: Response) => {
    sendJson(res, getRegisteredProjects());
  });

  app.get('/api/status', (req: Request, res: Response) => {
    const projectPath = req.query.projectPath as string;
    const config = discoverConnectionString(projectPath);
    const root = config?.solutionRoot || projectPath || process.cwd();
    sendJson(res, {
      solutionRoot: root,
      configSource: config?.source || 'None',
      databasePath: path.join(root, '.dbcanvas', 'discovery.db'),
    });
  });

  app.get('/api/graph', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string;
      const config = discoverConnectionString(projectPath);
      const graph = await getDiscoveryGraph(config?.solutionRoot || projectPath);
      sendJson(res, graph);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  });

  app.get('/api/procedure/:name', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string;
      const config = discoverConnectionString(projectPath);
      if (!config?.connectionString) throw new Error('No DB config found for path: ' + projectPath);
      const db = await createDbClient(config.connectionString);
      const code = await getProcedureCode(db, sanitizeParam(req.params.name));
      await db.destroy();
      sendJson(res, { code });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  });

  app.get('/api/procedure/:name/md', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string;
      const config = discoverConnectionString(projectPath);
      const root = config?.solutionRoot || projectPath || process.cwd();
      const procDir = path.join(root, '.dbcanvas', 'procedures');
      const name = sanitizeParam(req.params.name);
      
      const fs = await import('fs');
      
      // Pattern 1: Literal
      const mdPath = path.join(procDir, `${name}.md`);
      if (fs.existsSync(mdPath)) {
        return sendJson(res, { content: fs.readFileSync(mdPath, 'utf8') });
      }

      // Pattern 2: Dot to Underscore
      const underscoreName = name.replace('.', '_');
      const mdPathUnderscore = path.join(procDir, `${underscoreName}.md`);
      if (fs.existsSync(mdPathUnderscore)) {
        return sendJson(res, { content: fs.readFileSync(mdPathUnderscore, 'utf8') });
      }

      sendError(res, 404, 'Markdown file not found locally');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  });

  app.get('/api/table/:name/schema', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string;
      const config = discoverConnectionString(projectPath);
      if (!config?.connectionString) throw new Error('No DB config');
      const db = await createDbClient(config.connectionString);
      const columns = await getTableColumns(db, sanitizeParam(req.params.name));
      await db.destroy();
      sendJson(res, columns);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  });

  app.post('/api/sync', async (req: Request, res: Response) => {
    try {
      const projectPath = req.body.projectPath as string;
      const config = discoverConnectionString(projectPath);
      if (!config?.connectionString) throw new Error('No database connection discovered for: ' + projectPath);
      const db = await createDbClient(config.connectionString);
      const result = await syncDiscovery(db, config.solutionRoot);
      await db.destroy();
      clients.forEach(c => c.res.write(`data: ${JSON.stringify({ type: 'SYNC', name: 'complete' })}\n\n`));
      sendJson(res, result);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  });

  app.post('/api/shadow/capture', async (req: Request, res: Response) => {
    try {
      const { tableName, params, projectPath } = req.body;
      const config = discoverConnectionString(projectPath);
      if (!config?.connectionString) throw new Error('No DB config');
      const db = await createDbClient(config.connectionString);
      const count = await captureShadowData(db, tableName, params, undefined, config.solutionRoot);
      await db.destroy();
      sendJson(res, { success: true, count });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  });

  app.get('/api/shadow/:table', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string;
      const config = discoverConnectionString(projectPath);
      const data = await getShadowData(sanitizeParam(req.params.table), config?.solutionRoot || projectPath);
      sendJson(res, data);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  });

  app.get('/api/project/connection', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string;
      const config = discoverConnectionString(projectPath);
      const root = config?.solutionRoot || projectPath || process.cwd();
      const fs = await import('fs');
      const connPath = path.join(root, '.dbcanvas', 'connection.json');
      if (fs.existsSync(connPath)) {
        res.json(JSON.parse(fs.readFileSync(connPath, 'utf8')));
      } else {
        res.json(null);
      }
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  });

  app.post('/api/project/connection', async (req: Request, res: Response) => {
    try {
      const { projectPath, connectionData } = req.body;
      const config = discoverConnectionString(projectPath);
      const root = config?.solutionRoot || projectPath || process.cwd();
      
      const fs = await import('fs');
      const dbcanvasDir = path.join(root, '.dbcanvas');
      if (!fs.existsSync(dbcanvasDir)) {
        fs.mkdirSync(dbcanvasDir, { recursive: true });
      }

      fs.writeFileSync(path.join(dbcanvasDir, 'connection.json'), JSON.stringify(connectionData, null, 2));

      // Test connection
      const { testConnection } = await import('@dbcanvas/core');
      const testResult = await testConnection(JSON.stringify(connectionData));
      
      sendJson(res, { success: true, testResult });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  });

  // SSE Notification Bridge
  const clients: { id: number; res: Response }[] = [];

  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const client = { id: Date.now(), res };
    clients.push(client);
    req.on('close', () => {
      const idx = clients.findIndex(c => c.id === client.id);
      if (idx >= 0) clients.splice(idx, 1);
    });
  });

  app.post('/api/notify', (req: Request, res: Response) => {
    const message = JSON.stringify(req.body);
    clients.forEach(c => c.res.write(`data: ${message}\n\n`));
    res.sendStatus(200);
  });

  // ==================== STATIC (after API) ====================
  const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
  app.use(express.static(dashboardDist));
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });

  return app.listen(port, '127.0.0.1', () => {
    console.log(`DBCanvas server running at http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] === __filename || process.argv[1]?.endsWith('server.js')) {
  startServer(Number(process.env.PORT) || 3000);
}
