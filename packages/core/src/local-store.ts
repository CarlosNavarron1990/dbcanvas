/**
 * LocalStore — zero-dependency JSON persistence layer.
 *
 * Replaces sqlite3/knex for local .dbcanvas storage so the MCP server
 * works on ANY platform without native binaries (bindings, node-gyp, etc.)
 *
 * Schema:
 *   .dbcanvas/nodes.json    — discovery nodes (tables, SPs, views)
 *   .dbcanvas/edges.json    — discovery edges (FK & USAGE)
 *   .dbcanvas/captures.json — SP data captures (sim mode)
 *   .dbcanvas/annotations.json — AI annotations
 */
import fs from 'fs';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoreNode {
  id: string;
  name: string;
  type: 'TABLE' | 'PROCEDURE' | 'VIEW';
  details?: string;
  updated_at?: string;
}

export interface StoreEdge {
  source: string;
  target: string;
  type: 'FK' | 'USAGE';
  label?: string;
}

export interface StoreCapture {
  id: number;
  sp_name: string;
  params_json: string;
  tables_json: string;
  total_rows: number;
  missing_params: string;
  warnings_json: string;
  captured_at: string;
}

export interface StoreAnnotation {
  objectId: string;
  objectName: string;
  objectType: string;
  summary: string;
  details: string;
  updatedAt: string;
}

// ─── Store class ─────────────────────────────────────────────────────────────

export class LocalStore {
  private dir: string;

  constructor(dbcanvasDir: string) {
    this.dir = dbcanvasDir;
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private filePath(name: string): string {
    return path.join(this.dir, `${name}.json`);
  }

  private read<T>(name: string): T[] {
    const p = this.filePath(name);
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* corrupt file — start fresh */ }
    return [];
  }

  private write<T>(name: string, data: T[]): void {
    fs.writeFileSync(this.filePath(name), JSON.stringify(data, null, 2));
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  getNodes(type?: string): StoreNode[] {
    const nodes = this.read<StoreNode>('nodes');
    return type ? nodes.filter(n => n.type === type) : nodes;
  }

  upsertNode(node: StoreNode): void {
    const nodes = this.read<StoreNode>('nodes');
    const i = nodes.findIndex(n => n.id === node.id);
    const record = { ...node, updated_at: new Date().toISOString() };
    if (i >= 0) { nodes[i] = record; } else { nodes.push(record); }
    this.write('nodes', nodes);
  }

  nodeCount(): number { return this.read<StoreNode>('nodes').length; }

  // ── Edges ─────────────────────────────────────────────────────────────────

  getEdges(nodeIds?: string[]): StoreEdge[] {
    const edges = this.read<StoreEdge>('edges');
    if (!nodeIds) return edges;
    return edges.filter(e => nodeIds.includes(e.source) || nodeIds.includes(e.target));
  }

  upsertEdge(edge: StoreEdge): void {
    const edges = this.read<StoreEdge>('edges');
    const exists = edges.some(
      e => e.source === edge.source && e.target === edge.target && e.type === edge.type
    );
    if (!exists) {
      edges.push(edge);
      this.write('edges', edges);
    }
  }

  edgeCount(): number { return this.read<StoreEdge>('edges').length; }

  // ── Shadow tables (simple JSON maps) ──────────────────────────────────────

  getShadowRows(tableName: string): Record<string, unknown>[] {
    return this.read<Record<string, unknown>>(`shadow_${tableName}`);
  }

  setShadowRows(tableName: string, rows: Record<string, unknown>[]): void {
    this.write(`shadow_${tableName}`, rows);
  }

  hasShadowTable(tableName: string): boolean {
    return fs.existsSync(this.filePath(`shadow_${tableName}`));
  }

  // ── Captures ──────────────────────────────────────────────────────────────

  saveCapture(capture: Omit<StoreCapture, 'id' | 'captured_at'>): void {
    const captures = this.read<StoreCapture>('captures');
    const id = captures.length > 0 ? Math.max(...captures.map(c => c.id)) + 1 : 1;
    captures.push({
      ...capture,
      id,
      captured_at: new Date().toISOString(),
    });
    this.write('captures', captures);
  }

  getLatestCapture(spName: string): StoreCapture | null {
    const captures = this.read<StoreCapture>('captures');
    const matches = captures.filter(c => c.sp_name === spName);
    if (matches.length === 0) return null;
    return matches.sort((a, b) => b.id - a.id)[0];
  }

  // ── Annotations ───────────────────────────────────────────────────────────

  saveAnnotation(annotation: StoreAnnotation): void {
    const annotations = this.read<StoreAnnotation>('annotations');
    const i = annotations.findIndex(a => a.objectId === annotation.objectId);
    if (i >= 0) { annotations[i] = annotation; } else { annotations.push(annotation); }
    this.write('annotations', annotations);
  }

  getAnnotation(objectId: string): StoreAnnotation | null {
    return this.read<StoreAnnotation>('annotations').find(a => a.objectId === objectId) ?? null;
  }
}

// ─── Store registry (one per project root) ───────────────────────────────────

const stores = new Map<string, LocalStore>();

export function getStore(dbcanvasDir: string): LocalStore {
  if (!stores.has(dbcanvasDir)) {
    stores.set(dbcanvasDir, new LocalStore(dbcanvasDir));
  }
  return stores.get(dbcanvasDir)!;
}

export function closeAllStores(): void {
  stores.clear(); // Pure JS — nothing to close
}
