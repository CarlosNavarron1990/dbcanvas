import path from 'path';
import fs from 'fs';
import { DbClient, getTableForeignKeys, getProcedureDependencies, getTableColumns } from './database.js';
import { discoverConnectionString } from './config.js';
import { createChildLogger } from './logger.js';
import { getStore, closeAllStores, LocalStore } from './local-store.js';

const log = createChildLogger('discovery');

export interface DiscoveryNode {
  id: string;
  name: string;
  type: 'TABLE' | 'PROCEDURE' | 'VIEW';
  details?: string;
}

export interface DiscoveryEdge {
  source: string;
  target: string;
  type: 'FK' | 'USAGE';
  label?: string;
}

/** Close all cached local DB connections (no-op for JSON store, kept for API compat) */
export async function closeAllLocalDbs(): Promise<void> {
  closeAllStores();
}

function resolveDbcanvasDir(projectPathOverride?: string): string {
  const config = discoverConnectionString(projectPathOverride);

  let root: string;
  if (config?.solutionRoot && config.solutionRoot !== '/') {
    root = config.solutionRoot;
  } else if (projectPathOverride) {
    root = projectPathOverride;
  } else {
    const cwd = process.cwd();
    // Windows: avoid C:\ as root
    const isRoot = cwd === '/' || /^[A-Za-z]:[\\\/]?$/.test(cwd);
    root = isRoot ? (process.env.HOME || process.env.USERPROFILE || cwd) : cwd;
  }

  const dbDir = path.join(root, '.dbcanvas');

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });

    // Auto-inject to .gitignore for security
    const gitignorePath = path.join(root, '.gitignore');
    try {
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
        if (!gitignore.includes('.dbcanvas/')) {
          fs.appendFileSync(gitignorePath, '\n# DBCanvas local storage\n.dbcanvas/\n');
        }
      } else {
        fs.writeFileSync(gitignorePath, '# DBCanvas local storage\n.dbcanvas/\n');
      }
    } catch { /* gitignore update is best-effort */ }
  }

  return dbDir;
}

export function getLocalDb(projectPathOverride?: string): LocalStore {
  const dbDir = resolveDbcanvasDir(projectPathOverride);
  log.info({ dbDir }, 'Using discovery store');
  return getStore(dbDir);
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export async function syncDiscovery(remoteDb: DbClient, projectPathOverride?: string): Promise<{ nodes: number; edges: number }> {
  const store = getLocalDb(projectPathOverride);

  // 1. Tables
  const tables = await remoteDb.raw(
    remoteDb.client.config.client === 'mssql'
      ? 'SELECT name FROM sys.tables'
      : "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const tableRows = remoteDb.client.config.client === 'pg' ? tables.rows : tables;
  for (const row of tableRows) {
    store.upsertNode({ id: `table:${row.name}`, name: row.name, type: 'TABLE' });
  }

  // 2. Views
  const views = await remoteDb.raw(
    remoteDb.client.config.client === 'mssql'
      ? 'SELECT name FROM sys.views'
      : "SELECT table_name as name FROM information_schema.views WHERE table_schema = 'public'"
  );
  const viewRows = remoteDb.client.config.client === 'pg' ? views.rows : views;
  for (const row of viewRows) {
    store.upsertNode({ id: `view:${row.name}`, name: row.name, type: 'VIEW' });
  }

  // 3. Foreign Keys
  const fks = await getTableForeignKeys(remoteDb);
  for (const fk of fks) {
    store.upsertEdge({
      source: `table:${fk.parent_table}`,
      target: `table:${fk.referenced_table}`,
      type: 'FK',
      label: fk.constraint_name,
    });
  }

  // 4. SP Dependencies
  const deps = await getProcedureDependencies(remoteDb);
  for (const dep of deps) {
    store.upsertNode({ id: `sp:${dep.referencing_name}`, name: dep.referencing_name, type: 'PROCEDURE' });
    store.upsertEdge({
      source: `sp:${dep.referencing_name}`,
      target: `table:${dep.referenced_name}`,
      type: 'USAGE',
    });
  }

  return { nodes: store.nodeCount(), edges: store.edgeCount() };
}

// ─── Graph ────────────────────────────────────────────────────────────────────

export interface GraphQueryOptions {
  type?: 'TABLE' | 'PROCEDURE' | 'VIEW';
  limit?: number;
  offset?: number;
}

export async function getDiscoveryGraph(projectPathOverride?: string, options?: GraphQueryOptions) {
  const store = getLocalDb(projectPathOverride);

  // Always scan .dbcanvas/procedures/*.md for locally anchored SPs
  const config = discoverConnectionString(projectPathOverride);
  const root = config?.solutionRoot || projectPathOverride || process.cwd();
  const procDir = path.join(root, '.dbcanvas', 'procedures');

  if (fs.existsSync(procDir)) {
    try {
      for (const file of fs.readdirSync(procDir)) {
        if (!file.endsWith('.md')) continue;
        const fileName = path.basename(file, '.md');
        const normalizedName = fileName.replace('_', '.');
        const idNormalized = `sp:${normalizedName}`;
        store.upsertNode({ id: idNormalized, name: normalizedName, type: 'PROCEDURE' });
      }
    } catch (e) {
      log.error({ error: e }, 'Failed to scan procedures directory');
    }
  }

  let dbNodes = store.getNodes(options?.type);
  const totalCount = store.nodeCount();

  // Pagination
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? dbNodes.length;
  dbNodes = dbNodes.slice(offset, offset + limit);

  const nodeIds = dbNodes.map(n => n.id);
  const edges = store.getEdges(options?.type || options?.limit ? nodeIds : undefined);

  return {
    nodes: dbNodes.map(n => ({ id: n.id, name: n.name, type: n.type })),
    links: edges,
    total: totalCount,
  };
}

// ─── Lazy Discovery ───────────────────────────────────────────────────────────

export async function discoverObject(
  remoteDb: DbClient,
  name: string,
  type: 'TABLE' | 'PROCEDURE' | 'VIEW',
  projectPathOverride?: string
): Promise<void> {
  const store = getLocalDb(projectPathOverride);

  if (type === 'PROCEDURE') {
    store.upsertNode({ id: `sp:${name}`, name, type: 'PROCEDURE' });

    const spDeps = await getProcedureDependencies(remoteDb, name);
    for (const dep of spDeps) {
      store.upsertNode({ id: `table:${dep.referenced_name}`, name: dep.referenced_name, type: 'TABLE' });
      store.upsertEdge({ source: `sp:${name}`, target: `table:${dep.referenced_name}`, type: 'USAGE' });
      await ensureShadowTable(remoteDb, dep.referenced_name, projectPathOverride).catch(() => { });
    }
  } else if (type === 'TABLE') {
    store.upsertNode({ id: `table:${name}`, name, type: 'TABLE' });
    await ensureShadowTable(remoteDb, name, projectPathOverride).catch(() => { });
  }
}

// ─── Shadow tables ────────────────────────────────────────────────────────────

export async function ensureShadowTable(
  remoteDb: DbClient,
  tableName: string,
  projectPathOverride?: string
): Promise<void> {
  const store = getLocalDb(projectPathOverride);
  if (!store.hasShadowTable(tableName)) {
    // Initialize with empty rows (schema is inferred from data on first capture)
    store.setShadowRows(tableName, []);
  }
}

export async function captureShadowData(
  remoteDb: DbClient,
  tableName: string,
  params: any = {},
  limit?: number,
  projectPathOverride?: string
): Promise<number> {
  const store = getLocalDb(projectPathOverride);

  // Count rows
  let countQuery = remoteDb(tableName).count('* as count');
  if (params && Object.keys(params).length > 0) {
    for (const [key, value] of Object.entries(params)) {
      if (value) countQuery = countQuery.where(key, value);
    }
  }
  const countResult = await countQuery;
  const totalRows = Number(countResult[0]?.count || countResult[0]?.[''] || 0);

  if (totalRows > 1000 && !limit) {
    throw new Error(`LIMIT_REQUIRED: Found ${totalRows} rows matching parameters in ${tableName}. Please re-run the tool specifying an explicit 'limit' parameter.`);
  }

  const finalLimit = limit || totalRows;

  let query = remoteDb(tableName).select('*').limit(finalLimit);
  if (params && Object.keys(params).length > 0) {
    for (const [key, value] of Object.entries(params)) {
      if (value) query = query.where(key, value);
    }
  }

  const data = await query;
  const rows = data.map((r: any) => {
    const obj: Record<string, unknown> = {};
    for (const k of Object.keys(r)) obj[k] = r[k];
    return obj;
  });

  store.setShadowRows(tableName, rows);
  return rows.length;
}

export async function getShadowData(tableName: string, projectPathOverride?: string): Promise<Record<string, unknown>[]> {
  const store = getLocalDb(projectPathOverride);
  return store.getShadowRows(tableName);
}
