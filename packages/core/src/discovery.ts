import path from 'path';
import fs from 'fs';
import { DbClient, getTableForeignKeys, getProcedureDependencies, getTableColumns, getProcedureCode } from './database.js';
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

/** Helper to map database type descriptors to DBCanvas node IDs */
function getNodeIdFromType(name: string, typeDesc?: string): string {
  const cleanName = name.replace(/[\[\]]/g, '');
  const upperName = cleanName.toUpperCase();
  const parts = upperName.split('.');
  const baseName = parts[parts.length - 1];

  // 1. High priority: Guess from name prefixes
  if (baseName.startsWith('SP_') || baseName.startsWith('USP_')) return `sp:${name}`;
  if (baseName.startsWith('VW_')) return `view:${name}`;

  // 2. Low priority: Use database type metadata
  const type = typeDesc?.toUpperCase() || '';
  if (type.includes('PROCEDURE') || type === 'P') return `sp:${name}`;
  if (type.includes('VIEW') || type === 'V') return `view:${name}`;
  if (type.includes('FUNCTION') || type === 'FN' || type === 'TF' || type === 'IF') return `sp:${name}`;

  return `table:${name}`;
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

export interface SyncProgress {
  phase: 'tables' | 'views' | 'fks' | 'deps' | 'schemas' | 'sp-code' | 'done';
  done: number;
  total: number;
  current?: string;
}

export async function syncDiscovery(
  remoteDb: DbClient,
  projectPathOverride?: string,
  onProgress?: (p: SyncProgress) => void
): Promise<{ nodes: number; edges: number; schemasCached: number; spCodeCached: number }> {
  const store = getLocalDb(projectPathOverride);
  const dbDir = resolveDbcanvasDir(projectPathOverride);
  const procDir = path.join(dbDir, 'procedures');
  if (!fs.existsSync(procDir)) fs.mkdirSync(procDir, { recursive: true });

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
  onProgress?.({ phase: 'tables', done: tableRows.length, total: tableRows.length });

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
  onProgress?.({ phase: 'views', done: viewRows.length, total: viewRows.length });

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
  onProgress?.({ phase: 'fks', done: fks.length, total: fks.length });

  // 4. SP Dependencies (also discovers SPs themselves)
  const deps = await getProcedureDependencies(remoteDb);
  for (const dep of deps) {
    const sourceId = `sp:${dep.referencing_name}`;
    const targetId = getNodeIdFromType(dep.referenced_name, dep.referenced_type);

    store.upsertNode({ id: sourceId, name: dep.referencing_name, type: 'PROCEDURE' });
    if (targetId.startsWith('sp:')) {
      store.upsertNode({ id: targetId, name: dep.referenced_name, type: 'PROCEDURE' });
    } else if (targetId.startsWith('view:')) {
      store.upsertNode({ id: targetId, name: dep.referenced_name, type: 'VIEW' });
    } else {
      store.upsertNode({ id: targetId, name: dep.referenced_name, type: 'TABLE' });
    }

    store.upsertEdge({
      source: sourceId,
      target: targetId,
      type: 'USAGE',
    });
  }
  onProgress?.({ phase: 'deps', done: deps.length, total: deps.length });

  // 5. Table schemas — cache column definitions for all tables+views
  const tablesAndViews = [
    ...tableRows.map((r: any) => ({ name: r.name, type: 'TABLE' as const })),
    ...viewRows.map((r: any) => ({ name: r.name, type: 'VIEW' as const })),
  ];
  const schemas = store.getAllSchemas();
  let schemasCached = 0;
  const totalSchemas = tablesAndViews.length;
  for (let i = 0; i < tablesAndViews.length; i++) {
    const { name } = tablesAndViews[i];
    if (schemas[name]) continue; // skip already cached (incremental)
    try {
      const columns = await getTableColumns(remoteDb, name);
      schemas[name] = columns;
      schemasCached++;
    } catch (e) {
      log.warn({ table: name, err: (e as Error).message }, 'failed to fetch schema');
    }
    // Flush every 50 tables so partial progress isn't lost if interrupted
    if ((i + 1) % 50 === 0) store.setAllSchemas(schemas);
    onProgress?.({ phase: 'schemas', done: i + 1, total: totalSchemas, current: name });
  }
  store.setAllSchemas(schemas);

  // 6. SP code — fetch source for all discovered procedures, save as .md
  const spNodes = store.getNodes('PROCEDURE');
  let spCodeCached = 0;
  const totalSps = spNodes.length;
  for (let i = 0; i < spNodes.length; i++) {
    const sp = spNodes[i];
    // Filename: replace dots with underscores (schema-qualified names)
    const fileName = sp.name.replace(/\./g, '_');
    const mdPath = path.join(procDir, `${fileName}.md`);
    const altPath = path.join(procDir, `${sp.name}.md`);
    if (fs.existsSync(mdPath) || fs.existsSync(altPath)) continue; // skip already cached
    try {
      const code = await getProcedureCode(remoteDb, sp.name);
      if (code && code !== 'Not found') {
        const md = `# ${sp.name}\n\n\`\`\`sql\n${code}\n\`\`\`\n`;
        fs.writeFileSync(mdPath, md);
        spCodeCached++;
      }
    } catch (e) {
      log.warn({ sp: sp.name, err: (e as Error).message }, 'failed to fetch SP code');
    }
    onProgress?.({ phase: 'sp-code', done: i + 1, total: totalSps, current: sp.name });
  }

  onProgress?.({ phase: 'done', done: 0, total: 0 });
  log.info({ nodes: store.nodeCount(), edges: store.edgeCount(), schemasCached, spCodeCached }, 'sync complete');
  return { nodes: store.nodeCount(), edges: store.edgeCount(), schemasCached, spCodeCached };
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
      const targetId = getNodeIdFromType(dep.referenced_name, dep.referenced_type);
      
      if (targetId.startsWith('sp:')) {
        store.upsertNode({ id: targetId, name: dep.referenced_name, type: 'PROCEDURE' });
      } else if (targetId.startsWith('view:')) {
        store.upsertNode({ id: targetId, name: dep.referenced_name, type: 'VIEW' });
      } else {
        store.upsertNode({ id: targetId, name: dep.referenced_name, type: 'TABLE' });
        await ensureShadowTable(remoteDb, dep.referenced_name, projectPathOverride).catch(() => { });
      }

      store.upsertEdge({ source: `sp:${name}`, target: targetId, type: 'USAGE' });
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
