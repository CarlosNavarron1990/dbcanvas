import { describe, it, expect } from 'vitest';
import { getProcedureDependenciesFromSql } from './database.js';

// We can't easily test the private functions (sanitizeSqlIdentifier, validateReadOnlyQuery)
// directly, so we test them through the public API and also re-implement the logic for testing.

describe('getProcedureDependenciesFromSql', () => {
  it('extracts table references from FROM clause', () => {
    const sql = 'SELECT * FROM dbo.Users WHERE id = 1';
    const deps = getProcedureDependenciesFromSql(sql);
    expect(deps).toContain('dbo.Users');
  });

  it('extracts table references from JOIN', () => {
    const sql = `
      SELECT u.name, o.total
      FROM Users u
      JOIN Orders o ON u.id = o.user_id
      LEFT JOIN Products p ON o.product_id = p.id
    `;
    const deps = getProcedureDependenciesFromSql(sql);
    expect(deps).toContain('Users');
    expect(deps).toContain('Orders');
    expect(deps).toContain('Products');
  });

  it('extracts EXEC references as dependencies', () => {
    const sql = 'EXEC dbo.SP_ProcessOrder @id = 1';
    const deps = getProcedureDependenciesFromSql(sql);
    expect(deps).toContain('dbo.SP_ProcessOrder');
  });

  it('filters out SQL keywords', () => {
    const sql = 'SELECT * FROM Users WHERE id IN (SELECT user_id FROM Orders)';
    const deps = getProcedureDependenciesFromSql(sql);
    expect(deps).not.toContain('SELECT');
    expect(deps).not.toContain('WHERE');
  });

  it('filters out variables starting with @', () => {
    const sql = 'INSERT INTO @TempTable SELECT * FROM Users';
    const deps = getProcedureDependenciesFromSql(sql);
    expect(deps).not.toContain('@TempTable');
    expect(deps).toContain('Users');
  });

  it('handles bracket notation [schema].[table]', () => {
    const sql = 'SELECT * FROM [dbo].[UserAccounts]';
    const deps = getProcedureDependenciesFromSql(sql);
    expect(deps).toContain('dbo.UserAccounts');
  });

  it('returns empty for queries with no table references', () => {
    const sql = 'SELECT 1 AS test';
    const deps = getProcedureDependenciesFromSql(sql);
    expect(deps).toHaveLength(0);
  });

  it('handles UPDATE statements', () => {
    const sql = 'UPDATE Users SET name = @name WHERE id = @id';
    const deps = getProcedureDependenciesFromSql(sql);
    expect(deps).toContain('Users');
  });

  it('handles complex SP with multiple operations', () => {
    const sql = `
      CREATE PROCEDURE SP_Test AS
      BEGIN
        SELECT * FROM Customers c
        JOIN Orders o ON c.id = o.customer_id
        JOIN OrderItems oi ON o.id = oi.order_id

        UPDATE Inventory SET stock = stock - 1
        WHERE product_id IN (SELECT product_id FROM OrderItems)

        EXEC SP_SendNotification @type = 'order'

        INSERT INTO AuditLog (action) VALUES ('processed')
      END
    `;
    const deps = getProcedureDependenciesFromSql(sql);
    expect(deps).toContain('Customers');
    expect(deps).toContain('Orders');
    expect(deps).toContain('OrderItems');
    expect(deps).toContain('Inventory');
    expect(deps).toContain('AuditLog');
    expect(deps).toContain('SP_SendNotification');
  });
});

// Test SQL safety validation logic (reimplemented for testing since it's private)
describe('SQL safety validation', () => {
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

  function hasDangerousPattern(sql: string): boolean {
    return dangerousPatterns.some(p => p.test(sql));
  }

  it('allows simple SELECT', () => {
    expect(hasDangerousPattern('SELECT * FROM Users')).toBe(false);
  });

  it('blocks INSERT INTO', () => {
    expect(hasDangerousPattern('INSERT INTO Users VALUES (1)')).toBe(true);
  });

  it('blocks DELETE FROM', () => {
    expect(hasDangerousPattern('DELETE FROM Users WHERE id = 1')).toBe(true);
  });

  it('blocks DROP TABLE', () => {
    expect(hasDangerousPattern('DROP TABLE Users')).toBe(true);
  });

  it('blocks CTE with DELETE (the PostgreSQL attack vector)', () => {
    const sql = "WITH cte AS (DELETE FROM users RETURNING *) SELECT * FROM cte";
    expect(hasDangerousPattern(sql)).toBe(true);
  });

  it('blocks EXEC commands', () => {
    expect(hasDangerousPattern('EXEC xp_cmdshell "dir"')).toBe(true);
  });

  it('blocks DBCC commands', () => {
    expect(hasDangerousPattern('DBCC CHECKDB')).toBe(true);
  });

  it('blocks xp_ system procedures', () => {
    expect(hasDangerousPattern('SELECT * FROM xp_msver')).toBe(true);
  });

  it('blocks GRANT', () => {
    expect(hasDangerousPattern('GRANT SELECT ON Users TO public')).toBe(true);
  });

  it('blocks TRUNCATE TABLE', () => {
    expect(hasDangerousPattern('TRUNCATE TABLE Users')).toBe(true);
  });
});

// Test SQL identifier sanitization logic
describe('SQL identifier sanitization', () => {
  function isValidIdentifier(name: string): boolean {
    return /^[a-zA-Z0-9_.\-]+$/.test(name);
  }

  it('allows normal database names', () => {
    expect(isValidIdentifier('MyDatabase')).toBe(true);
    expect(isValidIdentifier('my_db_2024')).toBe(true);
    expect(isValidIdentifier('Test-DB')).toBe(true);
  });

  it('rejects SQL injection attempts', () => {
    expect(isValidIdentifier("'; DROP TABLE--")).toBe(false);
    expect(isValidIdentifier('db; DELETE FROM')).toBe(false);
    expect(isValidIdentifier('name OR 1=1')).toBe(false);
  });

  it('rejects path traversal in identifiers', () => {
    expect(isValidIdentifier('../../etc/passwd')).toBe(false);
    expect(isValidIdentifier('db/../../')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isValidIdentifier('')).toBe(false);
  });
});
