import { Router, Request, Response } from 'express';
import { queryOne, execute } from '../db.js';

const router = Router();

/** Record tool usage (called by MCP server) */
router.post('/track', async (req: Request, res: Response) => {
  const { licenseKey, toolName, projectPath } = req.body;
  if (!toolName) { res.status(400).json({ error: 'toolName required' }); return; }

  let licenseId = null;

  if (licenseKey) {
    const license = await queryOne('SELECT id FROM licenses WHERE license_key = $1', [licenseKey]);
    licenseId = license?.id || null;
  }

  await execute('INSERT INTO usage_events (license_id, tool_name, project_path) VALUES ($1, $2, $3)',
    [licenseId, toolName, projectPath || null]);

  res.json({ tracked: true });
});

export default router;
