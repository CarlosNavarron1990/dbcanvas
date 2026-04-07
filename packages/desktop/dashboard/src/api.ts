/**
 * API adapter: Uses IPC bridge when running in Electron, falls back to HTTP for standalone dev.
 */
const isElectron = typeof window !== 'undefined' && !!(window as any).dbcanvas;

function getProjectPath(): string {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('projectPath') || '';
}

export interface RegisteredProject {
  name: string;
  path: string;
}

export async function getProjects(): Promise<RegisteredProject[]> {
  if (isElectron) return window.dbcanvas.getProjects();
  const res = await fetch('/api/projects');
  return res.json();
}

export async function deleteProject(projectPath: string) {
  if (isElectron) return window.dbcanvas.deleteProject(projectPath);
  return { success: true };
}

export async function renameProject(projectPath: string, newName: string) {
  if (isElectron) return window.dbcanvas.renameProject(projectPath, newName);
  return { success: true };
}

export async function runDiscovery(searchPath?: string) {
  if (isElectron) return window.dbcanvas.runDiscovery(searchPath);
  return [];
}

export async function getStatus(projectPath?: string) {
  const pp = projectPath || getProjectPath();
  if (isElectron) return window.dbcanvas.getStatus(pp);
  const res = await fetch(`/api/status?projectPath=${encodeURIComponent(pp)}`);
  return res.json();
}

export async function getGraph(projectPath?: string) {
  const pp = projectPath || getProjectPath();
  if (isElectron) return window.dbcanvas.getGraph(pp);
  const res = await fetch(`/api/graph?projectPath=${encodeURIComponent(pp)}`);
  return res.json();
}

export async function syncDiscovery(projectPath?: string) {
  const pp = projectPath || getProjectPath();
  if (isElectron) return window.dbcanvas.syncDiscovery(pp);
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: pp }),
  });
  return res.json();
}

export async function getProcedureCode(name: string, projectPath?: string) {
  const pp = projectPath || getProjectPath();
  if (isElectron) return window.dbcanvas.getProcedureCode(name, pp);
  const res = await fetch(`/api/procedure/${encodeURIComponent(name)}?projectPath=${encodeURIComponent(pp)}`);
  const json = await res.json();
  return json.code || '-- No code available';
}

export async function getProcedureMd(name: string, projectPath?: string) {
  const pp = projectPath || getProjectPath();
  if (isElectron) return window.dbcanvas.getProcedureMd(name, pp);
  try {
    const res = await fetch(`/api/procedure/${encodeURIComponent(name)}/md?projectPath=${encodeURIComponent(pp)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.content || null;
  } catch {
    return null;
  }
}

export async function getTableSchema(name: string, projectPath?: string) {
  const pp = projectPath || getProjectPath();
  if (isElectron) return window.dbcanvas.getTableSchema(name, pp);
  const res = await fetch(`/api/table/${encodeURIComponent(name)}/schema?projectPath=${encodeURIComponent(pp)}`);
  return res.json();
}

export async function getShadowData(tableName: string, projectPath?: string) {
  const pp = projectPath || getProjectPath();
  if (isElectron) return window.dbcanvas.getShadowData(tableName, pp);
  const res = await fetch(`/api/shadow/${encodeURIComponent(tableName)}?projectPath=${encodeURIComponent(pp)}`);
  return res.json();
}

export async function captureShadowData(tableName: string, params: Record<string, unknown>, projectPath?: string) {
  const pp = projectPath || getProjectPath();
  if (isElectron) return window.dbcanvas.captureShadowData(tableName, params, pp);
  const res = await fetch('/api/shadow/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, params, projectPath: pp }),
  });
  return res.json();
}

// IDE Registration (Electron only)
export async function detectIdes() {
  if (!isElectron) return [];
  return window.dbcanvas.detectIdes();
}

export async function registerIde(configPath: string) {
  if (!isElectron) return { success: false, error: 'Not in Electron' };
  return window.dbcanvas.registerIde(configPath);
}

export async function unregisterIde(configPath: string) {
  if (!isElectron) return { success: false, error: 'Not in Electron' };
  return window.dbcanvas.unregisterIde(configPath);
}

export async function registerAllIdes() {
  if (!isElectron) return { results: [] };
  return window.dbcanvas.registerAllIdes();
}

/** Subscribe to notifications - uses IPC in Electron, SSE in browser */
export function onNotification(callback: (data: { type: string; name: string }) => void): () => void {
  if (isElectron) {
    return window.dbcanvas.onNotification(callback);
  }

  // Fallback: SSE
  const eventSource = new EventSource('/api/events');
  eventSource.onmessage = (event) => {
    try {
      callback(JSON.parse(event.data));
    } catch {}
  };
  return () => eventSource.close();
}

export { isElectron, getProjectPath };
