import { describe, it, expect } from 'vitest';
import * as schemas from './schemas.js';

describe('SpDefinitionArgs', () => {
  it('validates valid args', () => {
    const result = schemas.SpDefinitionArgs.safeParse({ name: 'SP_Test' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = schemas.SpDefinitionArgs.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = schemas.SpDefinitionArgs.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts optional dbUrl and projectPath', () => {
    const result = schemas.SpDefinitionArgs.safeParse({
      name: 'SP_Test',
      dbUrl: 'Server=localhost;Database=test',
      projectPath: '/home/user/project',
    });
    expect(result.success).toBe(true);
  });
});

describe('QueryDataArgs', () => {
  it('validates valid SELECT', () => {
    const result = schemas.QueryDataArgs.safeParse({ sql: 'SELECT * FROM Users' });
    expect(result.success).toBe(true);
  });

  it('rejects empty sql', () => {
    const result = schemas.QueryDataArgs.safeParse({ sql: '' });
    expect(result.success).toBe(false);
  });
});

describe('FindObjectArgs', () => {
  it('validates partial name search', () => {
    const result = schemas.FindObjectArgs.safeParse({ name: 'User' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = schemas.FindObjectArgs.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('ExploreSpArgs', () => {
  it('validates with only name', () => {
    const result = schemas.ExploreSpArgs.safeParse({ name: 'SP_Test' });
    expect(result.success).toBe(true);
  });

  it('validates with all optional params', () => {
    const result = schemas.ExploreSpArgs.safeParse({
      name: 'SP_Test',
      params: { userId: 42 },
      limit: 100,
      projectPath: '/tmp/project',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative limit', () => {
    const result = schemas.ExploreSpArgs.safeParse({ name: 'SP_Test', limit: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects float limit', () => {
    const result = schemas.ExploreSpArgs.safeParse({ name: 'SP_Test', limit: 10.5 });
    expect(result.success).toBe(false);
  });
});

describe('GetGraphArgs', () => {
  it('validates empty args', () => {
    const result = schemas.GetGraphArgs.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates with type filter', () => {
    const result = schemas.GetGraphArgs.safeParse({ type: 'TABLE' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    const result = schemas.GetGraphArgs.safeParse({ type: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('validates pagination', () => {
    const result = schemas.GetGraphArgs.safeParse({ limit: 50, offset: 10 });
    expect(result.success).toBe(true);
  });
});

describe('TestConnectionArgs', () => {
  it('validates empty args', () => {
    const result = schemas.TestConnectionArgs.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates with dbUrl', () => {
    const result = schemas.TestConnectionArgs.safeParse({ dbUrl: 'postgresql://localhost/test' });
    expect(result.success).toBe(true);
  });
});
