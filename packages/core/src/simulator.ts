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

function buildFilterForTable(spCode: string, tableName: string, params: Record<string, unknown>): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  const whereRegex = new RegExp(
    `(?:FROM|JOIN)\\s+(?:\\[?dbo\\]?\\.)?\\[?${tableName}\\]?[\\s\\S]*?WHERE\\s+([\\s\\S]*?)(?:ORDER BY|GROUP BY|HAVING|INSERT|UPDATE|DELETE|EXEC|BEGIN|END|;|$)`,
    'gi'
  );

  let match;
  while ((match = whereRegex.exec(spCode)) !== null) {
    const whereClause = match[1];
    const condRegex = /(?:\w+\.)?\[?(\w+)\]?\s*=\s*(@\w+)/gi;
    let condMatch;
    while ((condMatch = condRegex.exec(whereClause)) !== null) {
      const column = condMatch[1];
      const paramName = condMatch[2];
      const value = params[paramName] || params[paramName.substring(1)];
      if (value !== undefined) {
        filters[column] = value;
      }
    }
  }
  return filters;
}

/**
 * CAPTURE: Analyze SP, extract its tables, capture data with available params.
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

  const store = getLocalDb(projectPath);
  const capturedTables: CapturedTable[] = [];
  const warnings: string[] = [];
  let totalRows = 0;

  if (missingParams.length > 0) {
    warnings.push(`Missing parameters (not provided): ${missingParams.join(', ')}. Data captured without these filters.`);
  }

  for (const tableName of tables) {
    try {
      const filter = buildFilterForTable(code, tableName, normalizedParams);
      const filterDesc = Object.keys(filter).length > 0
        ? Object.entries(filter).map(([k, v]) => `${k}=${v}`).join(' AND ')
        : null;

      let query = db(tableName).select('*').limit(100);
      for (const [col, val] of Object.entries(filter)) {
        if (val !== undefined && val !== null) query = query.where(col, val);
      }

      const rawRows = await query;
      const rows = rawRows.map((r: any) => {
        const obj: Record<string, unknown> = {};
        for (const k of Object.keys(r)) obj[k] = r[k];
        return obj;
      });

      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      capturedTables.push({ name: tableName, rowCount: rows.length, columns, sampleRows: rows.slice(0, 5), filterApplied: filterDesc });
      totalRows += rows.length;

      // Store shadow data
      try {
        store.setShadowRows(tableName, rows);
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
  store.saveCapture({
    sp_name: spName,
    params_json: JSON.stringify(params),
    tables_json: JSON.stringify(capturedTables.map(t => t.name)),
    total_rows: totalRows,
    missing_params: JSON.stringify(missingParams),
    warnings_json: JSON.stringify(warnings),
  });

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
  const store = getLocalDb(projectPath);
  const selectQueries = extractSelectQueries(modifiedCode, params);
  const results: SimulationResult['queries'] = [];

  for (let i = 0; i < selectQueries.length; i++) {
    const sql = selectQueries[i];
    try {
      const tables = extractReferencedTables(sql);
      let rows: Record<string, unknown>[] = [];

      for (const table of tables) {
        if (store.hasShadowTable(table)) {
          rows = store.getShadowRows(table);
          break;
        }
      }

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
  const store = getLocalDb(projectPath);
  const capture = store.getLatestCapture(originalSpName);

  const differences: CompareResult['differences'] = [];

  if (capture) {
    const capturedTables: string[] = JSON.parse(capture.tables_json || '[]');
    for (let i = 0; i < simulationResult.queries.length; i++) {
      const q = simulationResult.queries[i];
      const referencedTables = extractReferencedTables(q.sql);
      const originalTable = referencedTables.find(t => capturedTables.includes(t));

      let originalRowCount = 0;
      let origCols: string[] = [];
      if (originalTable && store.hasShadowTable(originalTable)) {
        const shadowRows = store.getShadowRows(originalTable);
        originalRowCount = shadowRows.length;
        origCols = shadowRows.length > 0 ? Object.keys(shadowRows[0]) : [];
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
  const store = getLocalDb(projectPath);
  const capture = store.getLatestCapture(spName);
  if (!capture) return null;

  const capturedTables: string[] = JSON.parse(capture.tables_json || '[]');
  const tables: CapturedTable[] = capturedTables
    .filter(tableName => store.hasShadowTable(tableName))
    .map(tableName => {
      const rows = store.getShadowRows(tableName);
      return {
        name: tableName,
        rowCount: rows.length,
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        sampleRows: rows.slice(0, 5),
        filterApplied: null,
      };
    });

  return {
    spName,
    capturedAt: capture.captured_at,
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
