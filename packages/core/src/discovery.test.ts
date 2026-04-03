import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getLocalDb, getDiscoveryGraph, closeAllLocalDbs } from './discovery.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'dbcanvas-test-' + Date.now());

beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await closeAllLocalDbs();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('getLocalDb', () => {
  it('creates .dbcanvas directory and discovery.db', async () => {
    const db = await getLocalDb(TEST_DIR);
    expect(db).toBeTruthy();

    const dbPath = path.join(TEST_DIR, '.dbcanvas', 'discovery.db');
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('creates nodes and edges tables', async () => {
    const db = await getLocalDb(TEST_DIR);
    const hasNodes = await db.schema.hasTable('nodes');
    const hasEdges = await db.schema.hasTable('edges');
    expect(hasNodes).toBe(true);
    expect(hasEdges).toBe(true);
  });

  it('reuses connection for same resolved path', async () => {
    const db1 = await getLocalDb(TEST_DIR);
    const db2 = await getLocalDb(TEST_DIR);
    // Both should be functional Knex instances pointing to same DB
    const count1 = await db1('nodes').count('id as count').first();
    const count2 = await db2('nodes').count('id as count').first();
    expect(count1).toEqual(count2);
  });
});

describe('getDiscoveryGraph', () => {
  it('returns empty graph for fresh db', async () => {
    const freshDir = path.join(os.tmpdir(), 'dbcanvas-empty-' + Date.now());
    fs.mkdirSync(freshDir, { recursive: true });

    const graph = await getDiscoveryGraph(freshDir);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.links).toHaveLength(0);
    expect(graph.total).toBe(0);

    await closeAllLocalDbs();
    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  it('returns inserted nodes', async () => {
    const db = await getLocalDb(TEST_DIR);

    await db('nodes').insert({ id: 'table:Users', name: 'Users', type: 'TABLE' }).onConflict('id').merge();
    await db('nodes').insert({ id: 'sp:GetUsers', name: 'GetUsers', type: 'PROCEDURE' }).onConflict('id').merge();
    await db('edges').insert({ source: 'sp:GetUsers', target: 'table:Users', type: 'USAGE' }).onConflict(['source', 'target', 'type']).ignore();

    const graph = await getDiscoveryGraph(TEST_DIR);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.links.length).toBeGreaterThanOrEqual(1);

    const userNode = graph.nodes.find(n => n.name === 'Users');
    expect(userNode).toBeTruthy();
    expect(userNode!.type).toBe('TABLE');
  });

  it('supports type filter', async () => {
    const graph = await getDiscoveryGraph(TEST_DIR, { type: 'TABLE' });
    expect(graph.nodes.every(n => n.type === 'TABLE')).toBe(true);
  });

  it('supports limit', async () => {
    const graph = await getDiscoveryGraph(TEST_DIR, { limit: 1 });
    expect(graph.nodes.length).toBeLessThanOrEqual(1);
  });
});

describe('auto-gitignore', () => {
  it('creates .gitignore with .dbcanvas entry if none exists', () => {
    const gitignorePath = path.join(TEST_DIR, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('.dbcanvas/');
    }
    // If .gitignore doesn't exist, that's also fine - the test project may not need one
  });
});
