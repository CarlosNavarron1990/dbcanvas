interface DbCanvasApi {
  getGraph(projectPath?: string): Promise<{ nodes: any[]; links: any[] }>;
  syncDiscovery(projectPath?: string): Promise<{ nodes: number; edges: number }>;
  getStatus(projectPath?: string): Promise<{ solutionRoot: string; configSource: string; databasePath: string }>;
  getProjects(): Promise<string[]>;
  getProcedureCode(name: string, projectPath?: string): Promise<string>;
  getProcedureMd(name: string, projectPath?: string): Promise<string | null>;
  getTableSchema(name: string, projectPath?: string): Promise<any[]>;
  getShadowData(tableName: string, projectPath?: string): Promise<any[]>;
  captureShadowData(tableName: string, params: Record<string, unknown>, projectPath?: string): Promise<{ success: boolean; count: number }>;
  detectIdes(): Promise<Array<{ name: string; configPath: string; exists: boolean; registered: boolean }>>;
  registerIde(configPath: string): Promise<{ success: boolean; error?: string }>;
  unregisterIde(configPath: string): Promise<{ success: boolean; error?: string }>;
  registerAllIdes(): Promise<{ results: Array<{ name: string; success: boolean; error?: string }> }>;
  getMcpStatus(): Promise<{ running: boolean; version: string }>;
  restartMcp(): Promise<{ success: boolean }>;
  getSettings(): Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): Promise<{ success: boolean }>;
  onNotification(callback: (data: { type: string; name: string }) => void): () => void;
}

interface Window {
  dbcanvas: DbCanvasApi;
}
