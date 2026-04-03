import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

/** Record tool usage (called by MCP server) */
router.post('/track', (req: Request, res: Response) => {
  const { licenseKey, toolName, projectPath } = req.body;
  if (!toolName) { res.status(400).json({ error: 'toolName required' }); return; }

  const db = getDb();
  let licenseId = null;

  if (licenseKey) {
    const license = db.prepare('SELECT id FROM licenses WHERE license_key = ?').get(licenseKey) as any;
    licenseId = license?.id || null;
  }

  db.prepare('INSERT INTO usage_events (license_id, tool_name, project_path) VALUES (?, ?, ?)')
    .run(licenseId, toolName, projectPath || null);

  res.json({ tracked: true });
});

export default router;
