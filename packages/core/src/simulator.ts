import { DbClient, getProcedureCode, getTableColumns } from './database.js';
import { getLocalDb, ensureShadowTable, captureShadowData } from './discovery.js';
import { createChildLogger } from './logger.js';

const log = createChildLogger('simulator');

export interface SpParam {
  name: string;
  type: string;
  provided: boolean;
  value?: unknown;
}

export interface CapturedTable {
  name: string;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, unknown>[];
  filterApplied: string | null;
}

export interface CaptureResult {
  spName: string;
  capturedAt: string;
  inputParams: Record<string, unknown>;
  allParams: SpParam[];
  missingParams: string[];
  tables: CapturedTable[];
  totalRows: number;
  warnings: string[];
}

export interface SimulationResult {
  spName: string;
  simulatedAt: string;
  queries: Array<{
    index: number;
    sql: string;
    rowCount: number;
    columns: string[];
    rows: Record<string, unknown>[];
    error?: string;
  }>;
  success: boolean;
}

export interface CompareResult {
  spName: string;
  differences: Array<{
    queryIndex: number;
    originalSql: string;
    modifiedSql: string;
    originalRowCount: number;
    modifiedRowCount: number;
    columnsAdded: string[];
    columnsRemoved: string[];
    rowDifferences: number;
  }>;
  summary: string;
}

/**
 * Extract all declared @parameters from SP code with their types.
 */
function extractSpParams(spCode: string): Array<{ name: string; type: string }> {
  const params: Array<{ name: string; type: string }> = [];
  // Match CREATE PROCEDURE ... @param TYPE patterns
  const headerMatch = spCode.match(/CREATE\s+PROC(?:EDURE)?\s+[\s\S]*?\bAS\b/i);
  if (!headerMatch) return params;

  const header = headerMatch[0];
  const paramRegex = /(@\w+)\s+([\w()]+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)/gi;
  let match;
  while ((match = paramRegex.exec(header)) !== null) {
    params.push({ name: match[1], type: match[2] });
  }
  return params;
}

/**
 * Extract table names referenced in SP code (FROM, JOIN, UPDATE, INSERT INTO).
 */
function extractReferencedTables(spCode: string): string[] {
  const tables = new Set<string>();
  const patterns = [
    /(?:FROM|JOIN)\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?/gi,
    /(?:INSERT\s+INTO|UPDATE)\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?/gi,
  ];
  const blacklist = new Set([
    'SELECT', 'WHERE', 'SET', 'BEGIN', 'END', 'DECLARE', 'NULL', 'INTO',
    'VALUES', 'TABLE', 'FROM', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'GROUP', 'ORDER', 'HAVING', 'CASE', 'WHEN', 'THEN', 'ELSE',
  ]);

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(spCode)) !== null) {
      const table = match[1];
      if (table && !table.startsWith('@') && !table.startsWith('#') && !blacklist.has(table.toUpperCase())) {
        tables.add(table);
      }
    }
  }
  return [...tables];
}

/**
 * Try to build a WHERE clause from SP code for a given table using provided params.
 * Looks for patterns like: WHERE table.column = @param or WHERE column = @param
 */
function buildFilterForTable(spCode: string, tableName: string, params: Record<string, unknown>): Record<string, unknown> {
  const filters: Record<string, unknown> = {};

  // Find WHERE clauses that reference this table
  const whereRegex = new RegExp(
    `(?:FROM|JOIN)\\s+(?:\\[?dbo\\]?\\.)?\\[?${tableName}\\]?[\\s\\S]*?WHERE\\s+([\\s\\S]*?)(?:ORDER BY|GROUP BY|HAVING|INSERT|UPDATE|DELETE|EXEC|BEGIN|END|;|$)`,
    'gi'
  );

  let match;
  while ((match = whereRegex.exec(spCode)) !== null) {
    const whereClause = match[1];
    // Extract column = @param patterns
    const condRegex = /(?:\w+\.)?\[?(\w+)\]?\s*=\s*(@\w+)/gi;
    let condMatch;
    while ((condMatch = condRegex.exec(whereClause)) !== null) {
      const column = condMatch[1];
      const paramName = condMatch[2];
      // Check if we have this param
      const value = params[paramName] || params[paramName.substring(1)]; // Try with and without @
      if (value !== undefined) {
        filters[column] = value;
      }
    }
  }

  return filters;
}

/**
 * CAPTURE: Analyze SP, extract its tables, capture data with available params.
 * Smart enough to capture what it can and report what's missing.
 */
export async function captureSpData(
  db: DbClient,
  spName: string,
  params: Record<string, unknown>,
  projectPath: string,
): Promise<CaptureResult> {
  const code = await getProcedureCode(db, spName);
  if (!code || code === 'Not found') {
    throw new Error(`Stored procedure '${spName}' not found`);
  }

  // 1. Extract all SP parameters
  const declaredParams = extractSpParams(code);
  const normalizedParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const k = key.startsWith('@') ? key : `@${key}`;
    normalizedParams[k] = value;
    normalizedParams[key.replace(/^@/, '')] = value;
  }

  const allParams: SpParam[] = declaredParams.map(p => ({
    name: p.name,
    type: p.type,
    provided: normalizedParams[p.name] !== undefined || normalizedParams[p.name.substring(1)] !== undefined,
    value: normalizedParams[p.name] || normalizedParams[p.name.substring(1)],
  }));

  const missingParams = allParams.filter(p => !p.provided).map(p => `${p.name} (${p.type})`);

  // 2. Extract referenced tables
  const tables = extractReferencedTables(code);
  if (tables.length === 0) {
    throw new Error(`No table references found in '${spName}'.`);
  }

  // 3. Capture data from each table
  const local = await getLocalDb(projectPath);
  const capturedTables: CapturedTable[] = [];
  const warnings: string[] = [];
  let totalRows = 0;

  if (missingParams.length > 0) {
    warnings.push(`Missing parameters (not provided): ${missingParams.join(', ')}. Data captured without these filters.`);
  }

  // Ensure sim tables exist
  await ensureSimTables(local);

  for (const tableName of tables) {
    try {
      // Build filter from SP's WHERE clauses + provided params
      const filter = buildFilterForTable(code, tableName, normalizedParams);
      const filterDesc = Object.keys(filter).length > 0
        ? Object.entries(filter).map(([k, v]) => `${k}=${v}`).join(' AND ')
        : null;

      // Capture data with filter (or all if no filter, limited to 100 rows)
      let query = db(tableName).select('*').limit(100);
      for (const [col, val] of Object.entries(filter)) {
        if (val !== undefined && val !== null) {
          query = query.where(col, val);
        }
      }

      const rawRows = await query;
      const rows = rawRows.map((r: any) => {
        const obj: Record<string, unknown> = {};
        for (const k of Object.keys(r)) obj[k] = r[k];
        return obj;
      });

      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      capturedTables.push({
        name: tableName,
        rowCount: rows.length,
        columns,
        sampleRows: rows.slice(0, 5),
        filterApplied: filterDesc,
      });
      totalRows += rows.length;

      // Store in shadow table
      try {
        await ensureShadowTable(db, tableName, projectPath);
        const localDb = await getLocalDb(projectPath);
        await localDb(`shadow_${tableName}`).del();
        if (rows.length > 0) {
          // Insert in batches to avoid SQLite variable limits
          const batchSize = 50;
          for (let i = 0; i < rows.length; i += batchSize) {
            await localDb(`shadow_${tableName}`).insert(rows.slice(i, i + batchSize));
          }
        }
      } catch (shadowErr: any) {
        warnings.push(`Could not cache ${tableName} locally: ${shadowErr.message}`);
      }

      log.info({ spName, tableName, rows: rows.length, filter: filterDesc }, 'Captured table data');
    } catch (err: any) {
      warnings.push(`Failed to capture ${tableName}: ${err.message}`);
      log.warn({ spName, tableName, error: err.message }, 'Failed to capture table');
    }
  }

  // Store capture metadata
  const captureRecord = {
    sp_name: spName,
    params_json: JSON.stringify(params),
    tables_json: JSON.stringify(capturedTables.map(t => t.name)),
    total_rows: totalRows,
    missing_params: JSON.stringify(missingParams),
    warnings_json: JSON.stringify(warnings),
  };

  await local('sim_captures').insert(captureRecord);

  return {
    spName,
    capturedAt: new Date().toISOString(),
    inputParams: params,
    allParams,
    missingParams,
    tables: capturedTables,
    totalRows,
    warnings,
  };
}

/**
 * SIMULATE: Run modified SP code against locally captured data.
 */
export async function simulateSp(
  modifiedCode: string,
  originalSpName: string,
  params: Record<string, unknown>,
  projectPath: string,
): Promise<SimulationResult> {
  const local = await getLocalDb(projectPath);

  // Extract SELECT queries from modified code with param substitution
  const selectQueries = extractSelectQueries(modifiedCode, params);
  const results: SimulationResult['queries'] = [];

  for (let i = 0; i < selectQueries.length; i++) {
    const sql = selectQueries[i];
    try {
      // Find which shadow table to query
      const tables = extractReferencedTables(sql);
      let rows: Record<string, unknown>[] = [];

      for (const table of tables) {
        const shadowName = `shadow_${table}`;
        if (await local.schema.hasTable(shadowName)) {
          const data = await local(shadowName).select('*').limit(100);
          rows = data.map((r: any) => {
            const obj: Record<string, unknown> = {};
            for (const k of Object.keys(r)) obj[k] = r[k];
            return obj;
          });
          break; // Use first matching table
        }
      }

      // Apply WHERE filtering from the query
      const filtered = applySimpleFilter(rows, sql);

      results.push({
        index: i,
        sql,
        rowCount: filtered.length,
        columns: filtered.length > 0 ? Object.keys(filtered[0]) : [],
        rows: filtered.slice(0, 100),
      });
    } catch (err: any) {
      results.push({ index: i, sql, rowCount: 0, columns: [], rows: [], error: err.message });
    }
  }

  return {
    spName: originalSpName,
    simulatedAt: new Date().toISOString(),
    queries: results,
    success: results.every(r => !r.error),
  };
}

/**
 * COMPARE: Diff between original capture and simulation results.
 */
export async function compareResults(
  originalSpName: string,
  simulationResult: SimulationResult,
  projectPath: string,
): Promise<CompareResult> {
  const local = await getLocalDb(projectPath);
  await ensureSimTables(local);

  const capture = await local('sim_captures')
    .where('sp_name', originalSpName)
    .orderBy('id', 'desc')
    .first();

  const differences: CompareResult['differences'] = [];

  if (capture) {
    const capturedTables: string[] = JSON.parse(capture.tables_json || '[]');
    for (let i = 0; i < simulationResult.queries.length; i++) {
      const q = simulationResult.queries[i];
      const referencedTables = extractReferencedTables(q.sql);
      const originalTable = referencedTables.find(t => capturedTables.includes(t));

      let originalRowCount = 0;
      let origCols: string[] = [];
      if (originalTable) {
        const shadowName = `shadow_${originalTable}`;
        if (await local.schema.hasTable(shadowName)) {
          const count = await local(shadowName).count('* as c').first();
          originalRowCount = Number(count?.c || 0);
          const sample = await local(shadowName).first();
          if (sample) origCols = Object.keys(sample);
        }
      }

      differences.push({
        queryIndex: i,
        originalSql: `(data from ${originalTable || 'unknown'})`,
        modifiedSql: q.sql.substring(0, 120),
        originalRowCount,
        modifiedRowCount: q.rowCount,
        columnsAdded: q.columns.filter(c => !origCols.includes(c)),
        columnsRemoved: origCols.filter(c => !q.columns.includes(c)),
        rowDifferences: Math.abs(originalRowCount - q.rowCount),
      });
    }
  }

  const changed = differences.filter(d => d.rowDifferences > 0 || d.columnsAdded.length > 0 || d.columnsRemoved.length > 0);
  const summary = changed.length === 0
    ? 'No differences detected.'
    : `${changed.length} difference(s): ${changed.map(d => `Q${d.queryIndex}: ${d.originalRowCount} → ${d.modifiedRowCount} rows`).join('; ')}`;

  return { spName: originalSpName, differences, summary };
}

/**
 * Get latest capture for an SP.
 */
export async function getLatestCapture(spName: string, projectPath: string): Promise<CaptureResult | null> {
  const local = await getLocalDb(projectPath);
  await ensureSimTables(local);

  const capture = await local('sim_captures')
    .where('sp_name', spName)
    .orderBy('id', 'desc')
    .first();

  if (!capture) return null;

  const capturedTables: string[] = JSON.parse(capture.tables_json || '[]');
  const tables: CapturedTable[] = [];

  for (const tableName of capturedTables) {
    const shadowName = `shadow_${tableName}`;
    if (await local.schema.hasTable(shadowName)) {
      const rows = await local(shadowName).select('*').limit(5);
      const count = await local(shadowName).count('* as c').first();
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      tables.push({
        name: tableName,
        rowCount: Number(count?.c || 0),
        columns,
        sampleRows: rows.slice(0, 5),
        filterApplied: null,
      });
    }
  }

  return {
    spName,
    capturedAt: capture.captured_at || new Date().toISOString(),
    inputParams: JSON.parse(capture.params_json || '{}'),
    allParams: [],
    missingParams: JSON.parse(capture.missing_params || '[]'),
    tables,
    totalRows: capture.total_rows || 0,
    warnings: JSON.parse(capture.warnings_json || '[]'),
  };
}

// ==================== Helpers ====================

function extractSelectQueries(spCode: string, params: Record<string, unknown>): string[] {
  const queries: string[] = [];
  const selectRegex = /\bSELECT\b[\s\S]*?\bFROM\b[\s\S]*?(?=\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bEXEC\b|\bSET\b|\bIF\b|\bBEGIN\b|\bEND\b|\bRETURN\b|\bDECLARE\b|;|$)/gi;

  let match;
  while ((match = selectRegex.exec(spCode)) !== null) {
    let sql = match[0].trim();
    sql = sql.replace(/\s*(INSERT|UPDATE|DELETE|EXEC|SET|IF|BEGIN|END|RETURN|DECLARE)\s*$/i, '').trim();
    if (!sql) continue;
    sql = substituteParams(sql, params);
    const upper = sql.toUpperCase();
    if (!upper.includes('TOP') && !upper.includes('LIMIT')) {
      sql = sql.replace(/SELECT/i, 'SELECT TOP 100');
    }
    queries.push(sql);
  }
  return queries;
}

function substituteParams(sql: string, params: Record<string, unknown>): string {
  let result = sql;
  for (const [key, value] of Object.entries(params)) {
    const paramName = key.startsWith('@') ? key : `@${key}`;
    const escaped = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'`
                  : typeof value === 'number' ? String(value)
                  : value === null ? 'NULL'
                  : `'${String(value)}'`;
    result = result.replace(new RegExp(paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), escaped);
  }
  return result;
}

function applySimpleFilter(rows: Record<string, unknown>[], sql: string): Record<string, unknown>[] {
  if (rows.length === 0) return rows;
  const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:ORDER BY|GROUP BY|HAVING|$)/i);
  if (!whereMatch) return rows;

  const conditions = whereMatch[1].split(/\bAND\b/i).map(c => c.trim()).filter(c => c);
  return rows.filter(row => {
    return conditions.every(cond => {
      const eqMatch = cond.match(/\[?(\w+)\]?\s*=\s*(?:'([^']*)'|(\d+(?:\.\d+)?))/);
      if (!eqMatch) return true;
      const col = eqMatch[1];
      const val = eqMatch[2] !== undefined ? eqMatch[2] : Number(eqMatch[3]);
      if (!(col in row)) return true;
      return String(row[col]) === String(val);
    });
  });
}

async function ensureSimTables(local: any) {
  if (!(await local.schema.hasTable('sim_captures'))) {
    await local.schema.createTable('sim_captures', (table: any) => {
      table.increments('id').primary();
      table.string('sp_name');
      table.text('params_json');
      table.text('tables_json');
      table.integer('total_rows');
      table.text('missing_params');
      table.text('warnings_json');
      table.timestamp('captured_at').defaultTo(local.fn.now());
    });
  }
}
