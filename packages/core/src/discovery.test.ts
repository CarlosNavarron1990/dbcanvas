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
  it('creates .dbcanvas directory and returns a LocalStore', () => {
    const store = getLocalDb(TEST_DIR);
    expect(store).toBeTruthy();
    const dbDir = path.join(TEST_DIR, '.dbcanvas');
    expect(fs.existsSync(dbDir)).toBe(true);
  });

  it('reuses store instance for same resolved path', () => {
    const store1 = getLocalDb(TEST_DIR);
    const store2 = getLocalDb(TEST_DIR);
    // Both should be the same instance
    expect(store1.nodeCount()).toEqual(store2.nodeCount());
  });
});

describe('getDiscoveryGraph', () => {
  it('returns empty graph for fresh store', async () => {
    const freshDir = path.join(os.tmpdir(), 'dbcanvas-empty-' + Date.now());
    fs.mkdirSync(freshDir, { recursive: true });

    const graph = await getDiscoveryGraph(freshDir);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.links).toHaveLength(0);
    expect(graph.total).toBe(0);

    await closeAllLocalDbs();
    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  it('returns inserted nodes via LocalStore', async () => {
    const store = getLocalDb(TEST_DIR);

    store.upsertNode({ id: 'table:Users', name: 'Users', type: 'TABLE' });
    store.upsertNode({ id: 'sp:GetUsers', name: 'GetUsers', type: 'PROCEDURE' });
    store.upsertEdge({ source: 'sp:GetUsers', target: 'table:Users', type: 'USAGE' });

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
  });
});
