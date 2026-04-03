import knex, { Knex } from 'knex';
import path from 'path';
import fs from 'fs';
import { DbClient, getTableForeignKeys, getProcedureDependencies, getTableColumns } from './database.js';
import { discoverConnectionString } from './config.js';
import { createChildLogger } from './logger.js';

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

let localDbInstances: Record<string, Knex> = {};

/** Close all cached local DB connections */
export async function closeAllLocalDbs(): Promise<void> {
  for (const [key, db] of Object.entries(localDbInstances)) {
    try { await db.destroy(); } catch {}
    delete localDbInstances[key];
  }
}

export async function getLocalDb(projectPathOverride?: string): Promise<Knex> {
  const config = discoverConnectionString(projectPathOverride);
  let dbDir: string;
  
  if (config && config.solutionRoot && config.solutionRoot !== '/') {
    dbDir = path.join(config.solutionRoot, '.dbcanvas');
  } else if (projectPathOverride) {
    dbDir = path.join(projectPathOverride, '.dbcanvas');
  } else {
    // Fallback to project root via common markers if cwd is root
    const cwd = process.cwd();
    dbDir = path.join(cwd === '/' ? (process.env.HOME || '/tmp') : cwd, '.dbcanvas');
  }

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    
    // Auto-inject to .gitignore for security
    const gitignorePath = path.join(path.dirname(dbDir), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      if (!gitignore.includes('.dbcanvas/')) {
        fs.appendFileSync(gitignorePath, '\n# Omni/Nexus DB Storage\n.dbcanvas/\n');
      }
    } else {
      fs.writeFileSync(gitignorePath, '# Omni/Nexus DB Storage\n.dbcanvas/\n');
    }
  }

  const dbPath = path.join(dbDir, 'discovery.db');
  
  if (localDbInstances[dbPath]) return localDbInstances[dbPath];

  log.info({ dbPath }, 'Using discovery database');

  const localDb = knex({
    client: 'sqlite3',
    connection: {
      filename: dbPath,
    },
    useNullAsDefault: true,
  });

  // Initialize schema
  if (!(await localDb.schema.hasTable('nodes'))) {
    await localDb.schema.createTable('nodes', (table) => {
      table.string('id').primary();
      table.string('name');
      table.string('type');
      table.text('details');
      table.timestamp('updated_at').defaultTo(localDb!.fn.now());
    });
  }

  if (!(await localDb.schema.hasTable('edges'))) {
    await localDb.schema.createTable('edges', (table) => {
      table.string('source');
      table.string('target');
      table.string('type');
      table.string('label');
      table.unique(['source', 'target', 'type']);
    });
  }

  return localDb;
}

export async function syncDiscovery(remoteDb: DbClient, projectPathOverride?: string): Promise<{ nodes: number; edges: number }> {
  const db = await getLocalDb(projectPathOverride);
  
  // 1. Get Tables
  const tables = await remoteDb.raw(
    remoteDb.client.config.client === 'mssql' 
      ? "SELECT name FROM sys.tables" 
      : "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  
  const tableRows = remoteDb.client.config.client === 'pg' ? tables.rows : tables;

  for (const row of tableRows) {
    await db('nodes').insert({
      id: `table:${row.name}`,
      name: row.name,
      type: 'TABLE',
    }).onConflict('id').merge();
  }

  // 1b. Get Views
  const views = await remoteDb.raw(
    remoteDb.client.config.client === 'mssql'
      ? "SELECT name FROM sys.views"
      : "SELECT table_name as name FROM information_schema.views WHERE table_schema = 'public'"
  );
  const viewRows = remoteDb.client.config.client === 'pg' ? views.rows : views;
  for (const row of viewRows) {
    await db('nodes').insert({
      id: `view:${row.name}`,
      name: row.name,
      type: 'VIEW',
    }).onConflict('id').merge();
  }

  // 2. Get Foreign Keys
  const fks = await getTableForeignKeys(remoteDb);
  for (const fk of fks) {
    await db('edges').insert({
      source: `table:${fk.parent_table}`,
      target: `table:${fk.referenced_table}`,
      type: 'FK',
      label: fk.constraint_name,
    }).onConflict(['source', 'target', 'type']).ignore();
  }

  // 3. Get SP Dependencies (MSSQL focus)
  const deps = await getProcedureDependencies(remoteDb);
  for (const dep of deps) {
    // Add SP Node
    await db('nodes').insert({
      id: `sp:${dep.referencing_name}`,
      name: dep.referencing_name,
      type: 'PROCEDURE',
    }).onConflict('id').merge();

    // Add Usage Edge
    await db('edges').insert({
      source: `sp:${dep.referencing_name}`,
      target: `table:${dep.referenced_name}`,
      type: 'USAGE',
    }).onConflict(['source', 'target', 'type']).ignore();
  }

  const nodeCount = await db('nodes').count('id as count').first();
  const edgeCount = await db('edges').count('* as count').first();

  return { 
    nodes: Number(nodeCount?.count || 0), 
    edges: Number(edgeCount?.count || 0) 
  };
}

export interface GraphQueryOptions {
  type?: 'TABLE' | 'PROCEDURE' | 'VIEW';
  limit?: number;
  offset?: number;
}

export async function getDiscoveryGraph(projectPathOverride?: string, options?: GraphQueryOptions) {
  const db = await getLocalDb(projectPathOverride);

  let nodesQuery = db('nodes').select('*');
  if (options?.type) {
    nodesQuery = nodesQuery.where('type', options.type);
  }
  if (options?.offset) {
    nodesQuery = nodesQuery.offset(options.offset);
  }
  if (options?.limit) {
    nodesQuery = nodesQuery.limit(options.limit);
  }

  const nodes = await nodesQuery;

  // Get edges only for the nodes in the result set
  let edges;
  if (options?.type || options?.limit) {
    const nodeIds = nodes.map((n: any) => n.id);
    edges = await db('edges').select('*')
      .whereIn('source', nodeIds)
      .orWhereIn('target', nodeIds);
  } else {
    edges = await db('edges').select('*');
  }

  const totalNodes = await db('nodes').count('id as count').first();

  return {
    nodes: nodes.map((n: any) => ({ id: n.id, name: n.name, type: n.type })),
    links: edges.map((e: any) => ({ source: e.source, target: e.target, type: e.type, label: e.label })),
    total: Number(totalNodes?.count || 0),
  };
}

/**
 * Lazy Discovery: Discovers a single object and its immediate dependencies
 */
export async function discoverObject(remoteDb: DbClient, name: string, type: 'TABLE' | 'PROCEDURE' | 'VIEW', projectPathOverride?: string): Promise<void> {
  const db = await getLocalDb(projectPathOverride);

  if (type === 'PROCEDURE') {
    // 1. Add SP Node
    await db('nodes').insert({
      id: `sp:${name}`,
      name: name,
      type: 'PROCEDURE',
    }).onConflict('id').merge();

    // 2. Discover Dependencies
    const spDeps = await getProcedureDependencies(remoteDb, name);

    for (const dep of spDeps) {
      // Add Referenced Table Node
      await db('nodes').insert({
        id: `table:${dep.referenced_name}`,
        name: dep.referenced_name,
        type: 'TABLE',
      }).onConflict('id').merge();

      // Add Edge
      await db('edges').insert({
        source: `sp:${name}`,
        target: `table:${dep.referenced_name}`,
        type: 'USAGE',
      }).onConflict(['source', 'target', 'type']).ignore();

      // Ensure shadow structure for the table
      await ensureShadowTable(remoteDb, dep.referenced_name, projectPathOverride).catch(() => {});
    }
  } else if (type === 'TABLE') {
    // 1. Add Table Node
    await db('nodes').insert({
      id: `table:${name}`,
      name: name,
      type: 'TABLE',
    }).onConflict('id').merge();

    // 2. Ensure shadow structure
    await ensureShadowTable(remoteDb, name, projectPathOverride).catch(() => {});
  }
}

/**
 * Shadow Table Logic: Clones a remote table structure to local SQLite
 */
export async function ensureShadowTable(remoteDb: DbClient, tableName: string, projectPathOverride?: string): Promise<void> {
  const local = await getLocalDb(projectPathOverride);
  
  // 1. Get remote columns
  const columns = await getTableColumns(remoteDb, tableName);
  
  // 2. Map types and create table if not exists
  if (!(await local.schema.hasTable(`shadow_${tableName}`))) {
    await local.schema.createTable(`shadow_${tableName}`, (table) => {
      for (const col of columns) {
        // Simple type mapping (MSSQL/PG -> SQLite)
        const type = col.type.toLowerCase();
        if (type.includes('int')) {
          table.integer(col.name);
        } else if (type.includes('char') || type.includes('text')) {
          table.text(col.name);
        } else if (type.includes('date') || type.includes('time')) {
          table.string(col.name); // SQLite doesn't have native datetime, string is safest
        } else if (type.includes('float') || type.includes('decimal') || type.includes('numeric')) {
          table.float(col.name);
        } else {
          table.text(col.name);
        }
      }
      table.timestamp('shadow_updated_at').defaultTo(local.fn.now());
    });
    log.info({ tableName }, 'Created shadow table');
  }
}

/**
 * Data Capture logic: Pulls rows from remote to local shadow table
 */
export async function captureShadowData(remoteDb: DbClient, tableName: string, params: any = {}, limit?: number, projectPathOverride?: string): Promise<number> {
  const local = await getLocalDb(projectPathOverride);
  await ensureShadowTable(remoteDb, tableName, projectPathOverride);

  // 1. Check Row Count
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
  
  // 2. Fetch Data
  let query = remoteDb(tableName).select('*').limit(finalLimit);

  if (params && Object.keys(params).length > 0) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        query = query.where(key, value);
      }
    }
  }
  
  const data = await query;
  
  // Clear and Repopulate
  await local(`shadow_${tableName}`).del();
  if (data.length > 0) {
    await local(`shadow_${tableName}`).insert(data);
  }
  
  return data.length;
}

export async function getShadowData(tableName: string, projectPathOverride?: string) {
  const local = await getLocalDb(projectPathOverride);
  if (!(await local.schema.hasTable(`shadow_${tableName}`))) {
    return [];
  }
  return local(`shadow_${tableName}`).select('*');
}
