import knex, { Knex } from 'knex';

export type DbClient = Knex;

const DEFAULT_QUERY_TIMEOUT = 30000; // 30 seconds
const DEFAULT_POOL_MIN = 0;
const DEFAULT_POOL_MAX = 5;

export async function createDbClient(connectionString: string, queryTimeout?: number): Promise<DbClient> {
  let clientType = 'sqlite3';
  let connection: any = connectionString;

  if (connectionString.startsWith('postgres') || connectionString.startsWith('postgresql')) {
    clientType = 'pg';
  } else if (/data source=|server=|database\.windows\.net/i.test(connectionString)) {
    clientType = 'mssql';
    if (connectionString.includes(';')) {
      const parts = connectionString.split(';');
      const config: any = { options: { encrypt: false, trustServerCertificate: true } };
      parts.forEach(part => {
        const eqIndex = part.indexOf('=');
        if (eqIndex < 0) return;
        const key = part.substring(0, eqIndex).trim().toLowerCase();
        const value = part.substring(eqIndex + 1).trim();
        if (!key || !value) return;
        if (key === 'data source' || key === 'server') config.server = value;
        if (key === 'initial catalog' || key === 'database') config.database = value;
        if (key === 'user id' || key === 'user') config.user = value;
        if (key === 'password' || key === 'pwd') config.password = value;
        if (key === 'encrypt') config.options.encrypt = value.toLowerCase() === 'true';
        if (key === 'port') config.port = parseInt(value, 10);
      });
      if (config.server) connection = config;
    }
  }

  const timeout = queryTimeout || DEFAULT_QUERY_TIMEOUT;

  return knex({
    client: clientType,
    connection: connection,
    useNullAsDefault: clientType === 'sqlite3',
    debug: false,
    log: {
      // Route all Knex internal logs to stderr, never stdout
      warn: (msg: any) => console.error('[knex:warn]', msg),
      error: (msg: any) => console.error('[knex:error]', msg),
      debug: (msg: any) => console.error('[knex:debug]', msg),
      deprecate: (msg: any) => console.error('[knex:deprecate]', msg),
    },
    pool: {
      min: DEFAULT_POOL_MIN,
      max: DEFAULT_POOL_MAX,
      acquireTimeoutMillis: timeout,
    },
    acquireConnectionTimeout: timeout,
  });
}

export async function getProcedureCode(db: DbClient, spName: string): Promise<string> {
  const dialect = db.client.config.client;

  if (dialect === 'pg') {
    const result = await db.raw(`
      SELECT routine_definition 
      FROM information_schema.routines 
      WHERE routine_name = ? AND routine_type = 'PROCEDURE'
    `, [spName]);
    return result.rows[0]?.routine_definition || 'Not found';
  } 
  
  if (dialect === 'mssql') {
    const result = await db.raw(`
      SELECT definition 
      FROM sys.sql_modules 
      WHERE object_id = OBJECT_ID(?)
    `, [spName]);
    return result[0]?.definition || 'Not found';
  }

  return 'Dialect not supported for SP inspection yet.';
}

export async function getTableColumns(db: DbClient, tableName: string): Promise<any[]> {
  const dialect = db.client.config.client;
  const query = `
    SELECT
      COLUMN_NAME as name,
      DATA_TYPE as type,
      IS_NULLABLE as nullable
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `;
  const result = await db.raw(query, [tableName]);
  const rows = dialect === 'pg' ? result.rows : (Array.isArray(result) ? result : []);
  // Ensure plain objects (strip tedious metadata)
  return rows.map((r: any) => ({ name: r.name, type: r.type, nullable: r.nullable }));
}

export async function executeSafeRead(db: DbClient, query: string): Promise<any> {
    validateReadOnlyQuery(query);
    const upperQuery = query.trim().toUpperCase();
    
    // Force LIMIT if not present (simplified)
    let safeQuery = query;
    if (!upperQuery.includes('LIMIT') && !upperQuery.includes('TOP')) {
        const dialect = db.client.config.client;
        if (dialect === 'pg' || dialect === 'sqlite3') {
            safeQuery = `${query} LIMIT 10`;
        } else if (dialect === 'mssql' && !upperQuery.includes('TOP')) {
            safeQuery = query.replace(/SELECT/i, 'SELECT TOP 10');
        }
    }

    // Note: { cancel: true } is NOT supported by tedious (MSSQL driver)
    const timeoutDialect = db.client.config.client;
    const result = await db.raw(safeQuery).timeout(DEFAULT_QUERY_TIMEOUT, { cancel: timeoutDialect !== 'mssql' });
    // Normalize: return plain array of row objects
    if (timeoutDialect === 'pg') return result.rows;
    if (Array.isArray(result)) return result;
    return result;
}
export async function testConnection(connectionString: string): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const db = await createDbClient(connectionString);
    await db.raw('SELECT 1 as test');
    await db.destroy();
    return { success: true, message: 'Connection established and verified.' };
  } catch (err: any) {
    let message = 'Connection failed.';
    const errorStr = err.message || '';
    
    if (errorStr.includes('ETIMEDOUT') || errorStr.includes('ECONNREFUSED')) {
      message = 'Network Error: Host is unreachable or port is closed.';
    } else if (errorStr.includes('Login failed') || errorStr.includes('authentication failed')) {
      message = 'Authentication Error: Invalid username or password.';
    } else if (errorStr.includes('database') && errorStr.includes('does not exist')) {
      message = 'Database Error: The specified database does not exist.';
    }
    
    return { success: false, message, details: errorStr };
  }
}

/** Sanitize SQL identifiers to prevent injection via database/table names */
function sanitizeSqlIdentifier(name: string): string {
  // Only allow alphanumeric, underscores, hyphens, and dots
  if (!/^[a-zA-Z0-9_.\-]+$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

/** Block dangerous SQL patterns beyond simple SELECT/WITH check */
function validateReadOnlyQuery(sql: string): void {
  const upper = sql.trim().toUpperCase();

  // Must start with SELECT or WITH
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    throw new Error('Only SELECT queries are allowed for safety.');
  }

  // Block dangerous keywords that could appear in CTEs or subqueries
  const dangerousPatterns = [
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w/i,
    /\bDELETE\s+FROM\b/i,
    /\bDROP\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE)\b/i,
    /\bTRUNCATE\s+TABLE\b/i,
    /\bALTER\s+(TABLE|DATABASE)\b/i,
    /\bCREATE\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE)\b/i,
    /\bEXEC(UTE)?\s/i,
    /\bGRANT\s/i,
    /\bREVOKE\s/i,
    /\bxp_/i,
    /\bsp_/i,
    /\bDBCC\s/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sql)) {
      throw new Error(`Query contains forbidden statement: ${pattern.source}`);
    }
  }
}

export async function findObjectAcrossDatabases(db: DbClient, objectName: string): Promise<any[]> {
  const dialect = db.client.config.client;
  const results: any[] = [];

  if (dialect === 'mssql') {
    // Get all databases
    const dbs = await db.raw('SELECT name FROM sys.databases WHERE state = 0 AND name NOT IN (\'master\', \'tempdb\', \'model\', \'msdb\')');
    
    for (const row of dbs) {
      const dbName = sanitizeSqlIdentifier(row.name);
      try {
        const found = await db.raw(`
          SELECT
            ? as database_name,
            s.name as schema_name,
            o.name as object_name,
            o.type_desc as object_type
          FROM [${dbName}].sys.objects o
          JOIN [${dbName}].sys.schemas s ON o.schema_id = s.schema_id
          WHERE o.name LIKE ?
        `, [dbName, `%${objectName}%`]);
        
        if (found && found.length > 0) {
          results.push(...found);
        }
      } catch (e) {
        // Skip DBs we can't access
      }
    }
  } else if (dialect === 'pg') {
    const dbs = await db.raw('SELECT datname FROM pg_database WHERE datistemplate = false AND datname != \'postgres\'');
    
    for (const row of dbs.rows) {
      const dbName = row.datname;
      // Note: Postgres cross-database queries are tricky with standard Knex without changing connection
      // For now, we search schemas in the CURRENT database as a compromise, or we'd need to create new clients
      const found = await db.raw(`
        SELECT 
          current_database() as database_name,
          table_schema as schema_name,
          table_name as object_name,
          'TABLE' as object_type
        FROM information_schema.tables 
        WHERE table_name LIKE ?
        UNION ALL
        SELECT 
          current_database() as database_name,
          routine_schema as schema_name,
          routine_name as object_name,
          'PROCEDURE' as object_type
        FROM information_schema.routines 
        WHERE routine_name LIKE ?
      `, [`%${objectName}%`, `%${objectName}%`]);
      
      if (found.rows && found.rows.length > 0) {
        results.push(...found.rows);
      }
    }
  }

  return results;
}

export async function getTableForeignKeys(db: DbClient, tableName?: string): Promise<any[]> {
  const dialect = db.client.config.client;

  if (dialect === 'mssql') {
    const query = `
      SELECT 
          fk.name AS constraint_name,
          tp.name AS parent_table,
          cp.name AS parent_column,
          tr.name AS referenced_table,
          cr.name AS referenced_column
      FROM sys.foreign_keys AS fk
      INNER JOIN sys.foreign_key_columns AS fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.tables AS tp ON fkc.parent_object_id = tp.object_id
      INNER JOIN sys.columns AS cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
      INNER JOIN sys.tables AS tr ON fkc.referenced_object_id = tr.object_id
      INNER JOIN sys.columns AS cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
    `;
    return db.raw(query);
  }

  if (dialect === 'pg') {
    const query = `
      SELECT
          tc.constraint_name, 
          tc.table_name AS parent_table, 
          kcu.column_name AS parent_column, 
          ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `;
    const result = await db.raw(query);
    return result.rows || [];
  }

  return [];
}

export async function getProcedureDependencies(db: DbClient, name?: string): Promise<any[]> {
  const dialect = db.client.config.client;

  if (dialect === 'mssql') {
    let query = `
      SELECT 
          OBJECT_NAME(referencing_id) AS referencing_name,
          referenced_entity_name AS referenced_name,
          o.type_desc AS referencing_type,
          ro.type_desc AS referenced_type
      FROM sys.sql_expression_dependencies sed
      INNER JOIN sys.objects o ON sed.referencing_id = o.object_id
      LEFT JOIN sys.objects ro ON sed.referenced_id = ro.object_id
      WHERE o.type IN ('P', 'V', 'FN', 'IF', 'TF') -- Procedures, Views, Functions
    `;
    
    if (name) {
      query += ` AND sed.referencing_id = OBJECT_ID(?)`;
      const deps = await db.raw(query, [name]);
      
      // Fallback: If no dependencies found via system views, parse code using Regex
      if (deps.length === 0) {
          const code = await getProcedureCode(db, name);
          if (code && code !== 'Not found') {
              const regexDeps = getProcedureDependenciesFromSql(code);
              return regexDeps.map(tbl => ({
                  referencing_name: name,
                  referenced_name: tbl,
                  referencing_type: 'SQL_STORED_PROCEDURE',
                  referenced_type: 'USER_TABLE'
              }));
          }
      }
      return deps;
    }
    
    return db.raw(query);
  }

  return [];
}

/**
 * Robust regex-based dependency extractor for when sys views fail
 */
export function getProcedureDependenciesFromSql(sql: string): string[] {
    const tableMatches = new Set<string>();
    
    // Patterns for FROM, JOIN, UPDATE, INTO (simplified)
    // Matches patterns like [schema].[table], schema.table, or just table
    const patterns = [
        /(?:FROM|JOIN|UPDATE|INTO|TRUNCATE TABLE)\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?/gi,
        /EXEC(?:UTE)?\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?/gi
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(sql)) !== null) {
            const schema = match[1];
            const table = match[2];
            
            // Filter out common keywords and variables
            const blackList = ['SELECT', 'WHERE', 'INSERT', 'GROUP', 'ORDER', 'HAVING', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'JOIN', 'FETCH', 'OFFSET', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'FOR', 'OPEN', 'CLOSE', 'DEOCLARE', 'DECLARE', 'SET'];
            if (table && !table.startsWith('@') && !blackList.includes(table.toUpperCase())) {
                const fullName = schema ? `${schema}.${table}` : table;
                tableMatches.add(fullName);
            }
        }
    }

    return Array.from(tableMatches);
}
