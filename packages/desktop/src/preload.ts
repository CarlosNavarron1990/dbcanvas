import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposes a safe API to the renderer process via contextBridge.
 * The renderer can call window.dbcanvas.* without direct Node access.
 */
contextBridge.exposeInMainWorld('dbcanvas', {
  // Graph & Discovery
  getGraph: (projectPath?: string) =>
    ipcRenderer.invoke('dbcanvas:get-graph', projectPath),
  syncDiscovery: (projectPath?: string) =>
    ipcRenderer.invoke('dbcanvas:sync-discovery', projectPath),
  getStatus: (projectPath?: string) =>
    ipcRenderer.invoke('dbcanvas:get-status', projectPath),
  getProjects: () =>
    ipcRenderer.invoke('dbcanvas:get-projects'),

  // Procedures
  getProcedureCode: (name: string, projectPath?: string) =>
    ipcRenderer.invoke('dbcanvas:get-procedure-code', name, projectPath),
  getProcedureMd: (name: string, projectPath?: string) =>
    ipcRenderer.invoke('dbcanvas:get-procedure-md', name, projectPath),

  // Tables
  getTableSchema: (name: string, projectPath?: string) =>
    ipcRenderer.invoke('dbcanvas:get-table-schema', name, projectPath),
  getShadowData: (tableName: string, projectPath?: string) =>
    ipcRenderer.invoke('dbcanvas:get-shadow-data', tableName, projectPath),
  captureShadowData: (tableName: string, params: Record<string, unknown>, projectPath?: string) =>
    ipcRenderer.invoke('dbcanvas:capture-shadow-data', tableName, params, projectPath),

  // MCP Server Management
  getMcpStatus: () =>
    ipcRenderer.invoke('dbcanvas:mcp-status'),
  restartMcp: () =>
    ipcRenderer.invoke('dbcanvas:mcp-restart'),

  // Settings
  getSettings: () =>
    ipcRenderer.invoke('dbcanvas:get-settings'),
  saveSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke('dbcanvas:save-settings'),

  // IDE Registration
  detectIdes: () =>
    ipcRenderer.invoke('dbcanvas:detect-ides'),
  registerIde: (configPath: string) =>
    ipcRenderer.invoke('dbcanvas:register-ide', configPath),
  unregisterIde: (configPath: string) =>
    ipcRenderer.invoke('dbcanvas:unregister-ide', configPath),
  registerAllIdes: () =>
    ipcRenderer.invoke('dbcanvas:register-all-ides'),

  // Auth
  getSession: () => ipcRenderer.invoke('dbcanvas:auth-get-session'),
  startLogin: () => ipcRenderer.invoke('dbcanvas:auth-start-login'),
  pollAuth: (deviceCode: string) => ipcRenderer.invoke('dbcanvas:auth-poll', deviceCode),
  logout: () => ipcRenderer.invoke('dbcanvas:auth-logout'),

  // Updates
  installUpdate: () => ipcRenderer.invoke('dbcanvas:install-update'),

  // Project Management (New)
  deleteProject: (projectPath: string) => 
    ipcRenderer.invoke('dbcanvas:delete-project', projectPath),
  renameProject: (projectPath: string, newName: string) => 
    ipcRenderer.invoke('dbcanvas:rename-project', projectPath, newName),
  runDiscovery: (searchPath?: string) => 
    ipcRenderer.invoke('dbcanvas:run-discovery', searchPath),

  onUpdateAvailable: (callback: (info: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('dbcanvas:update-available', handler);
    return () => ipcRenderer.removeListener('dbcanvas:update-available', handler);
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('dbcanvas:update-downloaded', handler);
    return () => ipcRenderer.removeListener('dbcanvas:update-downloaded', handler);
  },

  // Events from main process
  onNotification: (callback: (data: { type: string; name: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { type: string; name: string }) => callback(data);
    ipcRenderer.on('dbcanvas:notification', handler);
    return () => ipcRenderer.removeListener('dbcanvas:notification', handler);
  },
});
