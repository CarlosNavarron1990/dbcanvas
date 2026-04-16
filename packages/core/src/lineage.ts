import { DbClient, getProcedureCode, getProcedureDependencies } from './database.js';
import { getLocalDb } from './discovery.js';
import { createChildLogger } from './logger.js';

const log = createChildLogger('lineage');

export interface LineageNode {
  id: string;
  name: string;
  type: 'TABLE' | 'COLUMN' | 'PROCEDURE';
  table?: string;
}

export interface LineageEdge {
  source: string;
  target: string;
  type: 'READS' | 'WRITES' | 'TRANSFORMS';
  via?: string; // SP name that performs the transformation
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
  field: string;
}

/**
 * Trace the lineage of a specific field across stored procedures and tables.
 * Analyzes SP code to find SELECT, INSERT, UPDATE references to the field.
 */
export async function traceFieldLineage(
  db: DbClient,
  fieldName: string,
  tableName?: string,
  projectPath?: string,
): Promise<LineageGraph> {
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const visited = new Set<string>();

  // 1. Find all SPs that reference this field or table
  const dialect = db.client.config.client;
  if (dialect !== 'mssql') {
    return { nodes: [], edges: [], field: fieldName };
  }

  // Get all SP dependencies
  const allDeps = await getProcedureDependencies(db);

  // If tableName provided, focus on SPs that touch that table
  const relevantSPs = tableName
    ? allDeps.filter(d => d.referenced_name === tableName).map(d => d.referencing_name)
    : allDeps.map(d => d.referencing_name);

  const uniqueSPs = [...new Set(relevantSPs)];

  for (const spName of uniqueSPs) {
    try {
      const code = await getProcedureCode(db, spName);
      if (!code || code === 'Not found') continue;

      // Check if the field appears in this SP's code
      const fieldRegex = new RegExp(`\\b${escapeRegex(fieldName)}\\b`, 'i');
      if (!fieldRegex.test(code)) continue;

      const spNodeId = `sp:${spName}`;
      if (!visited.has(spNodeId)) {
        visited.add(spNodeId);
        nodes.push({ id: spNodeId, name: spName, type: 'PROCEDURE' });
      }

      // Analyze what the SP does with this field
      const analysis = analyzeFieldUsage(code, fieldName);

      for (const read of analysis.reads) {
        const tableNodeId = `table:${read}`;
        const colNodeId = `col:${read}.${fieldName}`;

        if (!visited.has(tableNodeId)) {
          visited.add(tableNodeId);
          nodes.push({ id: tableNodeId, name: read, type: 'TABLE' });
        }
        if (!visited.has(colNodeId)) {
          visited.add(colNodeId);
          nodes.push({ id: colNodeId, name: `${read}.${fieldName}`, type: 'COLUMN', table: read });
        }

        edges.push({ source: colNodeId, target: spNodeId, type: 'READS', via: spName });
      }

      for (const write of analysis.writes) {
        const tableNodeId = `table:${write}`;
        const colNodeId = `col:${write}.${fieldName}`;

        if (!visited.has(tableNodeId)) {
          visited.add(tableNodeId);
          nodes.push({ id: tableNodeId, name: write, type: 'TABLE' });
        }
        if (!visited.has(colNodeId)) {
          visited.add(colNodeId);
          nodes.push({ id: colNodeId, name: `${write}.${fieldName}`, type: 'COLUMN', table: write });
        }

        edges.push({ source: spNodeId, target: colNodeId, type: 'WRITES', via: spName });
      }
    } catch (err) {
      log.warn({ spName, error: err }, 'Failed to analyze SP for lineage');
    }
  }

  // 2. Store lineage in local db
  if (projectPath) {
    await storeLineage(fieldName, nodes, edges, projectPath);
  }

  return { nodes, edges, field: fieldName };
}

/**
 * Analyze SQL code to determine how a specific field is used (read vs written).
 */
function analyzeFieldUsage(sql: string, fieldName: string): { reads: string[]; writes: string[] } {
  const reads = new Set<string>();
  const writes = new Set<string>();
  const escapedField = escapeRegex(fieldName);

  // SELECT ... field ... FROM table → READS
  const selectPattern = new RegExp(
    `SELECT\\s[\\s\\S]*?\\b${escapedField}\\b[\\s\\S]*?FROM\\s+(?:\\[?(\\w+)\\]?\\.)?\\[?(\\w+)\\]?`,
    'gi',
  );
  let match;
  while ((match = selectPattern.exec(sql)) !== null) {
    const table = match[2];
    if (table && !isSqlKeyword(table)) reads.add(table);
  }

  // INSERT INTO table ... field → WRITES
  const insertPattern = new RegExp(
    `INSERT\\s+INTO\\s+(?:\\[?(\\w+)\\]?\\.)?\\[?(\\w+)\\]?[\\s\\S]*?\\b${escapedField}\\b`,
    'gi',
  );
  while ((match = insertPattern.exec(sql)) !== null) {
    const table = match[2];
    if (table && !isSqlKeyword(table)) writes.add(table);
  }

  // UPDATE table SET field = ... → WRITES
  const updatePattern = new RegExp(
    `UPDATE\\s+(?:\\[?(\\w+)\\]?\\.)?\\[?(\\w+)\\]?\\s+SET[\\s\\S]*?\\b${escapedField}\\b`,
    'gi',
  );
  while ((match = updatePattern.exec(sql)) !== null) {
    const table = match[2];
    if (table && !isSqlKeyword(table)) writes.add(table);
  }

  return { reads: [...reads], writes: [...writes] };
}

async function storeLineage(
  fieldName: string,
  nodes: LineageNode[],
  edges: LineageEdge[],
  projectPath: string,
): Promise<void> {
  try {
    const store = getLocalDb(projectPath);
    // Store lineage as JSON files keyed by field name
    store.setShadowRows(`lineage_nodes_${fieldName}`, nodes as any);
    store.setShadowRows(`lineage_edges_${fieldName}`, edges as any);
  } catch (err) {
    log.warn({ fieldName, error: err }, 'Failed to store lineage');
  }
}

export async function getStoredLineage(fieldName: string, projectPath: string): Promise<LineageGraph | null> {
  try {
    const store = getLocalDb(projectPath);
    if (!store.hasShadowTable(`lineage_nodes_${fieldName}`)) return null;

    const nodes = store.getShadowRows(`lineage_nodes_${fieldName}`) as unknown as LineageNode[];
    const edges = store.getShadowRows(`lineage_edges_${fieldName}`) as unknown as LineageEdge[];

    if (nodes.length === 0) return null;
    return { field: fieldName, nodes, edges };
  } catch {
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSqlKeyword(word: string): boolean {
  const keywords = new Set([
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'LEFT', 'RIGHT',
    'INNER', 'OUTER', 'GROUP', 'ORDER', 'HAVING', 'SET', 'INTO', 'VALUES', 'TABLE',
    'CREATE', 'ALTER', 'DROP', 'BEGIN', 'END', 'DECLARE', 'EXEC', 'EXECUTE',
  ]);
  return keywords.has(word.toUpperCase());
}
