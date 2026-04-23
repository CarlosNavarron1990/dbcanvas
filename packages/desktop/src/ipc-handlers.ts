import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  getDiscoveryGraph, syncDiscovery, getShadowData, captureShadowData,
  createDbClient, discoverConnectionString, getRegisteredProjects,
  getProcedureCode, getTableColumns,
  removeProject, updateProjectName, discoverLocalProjects,
} from '@dbcanvas/core';
import { detectInstalledIdes, registerInIde, unregisterFromIde, registerInAllIdes, getMcpServerPath } from './ide-registrar.js';

export function registerIpcHandlers() {
  ipcMain.handle('dbcanvas:get-projects', async () => {
    return getRegisteredProjects();
  });

  ipcMain.handle('dbcanvas:get-status', async (_event, projectPath?: string) => {
    const config = discoverConnectionString(projectPath);
    return {
      solutionRoot: config?.solutionRoot || projectPath || process.cwd(),
      configSource: config?.source || 'None',
      databasePath: path.join(config?.solutionRoot || projectPath || process.cwd(), '.dbcanvas', 'nodes.json'),
    };
  });

  ipcMain.handle('dbcanvas:get-graph', async (_event, projectPath?: string) => {
    const config = discoverConnectionString(projectPath);
    return getDiscoveryGraph(config?.solutionRoot || projectPath);
  });

  ipcMain.handle('dbcanvas:sync-discovery', async (_event, projectPath?: string) => {
    const config = discoverConnectionString(projectPath);
    if (!config?.connectionString) {
      throw new Error('No database connection string discovered for path: ' + projectPath);
    }
    const db = await createDbClient(config.connectionString);
    try {
      return await syncDiscovery(db, config.solutionRoot);
    } finally {
      await db.destroy();
    }
  });

  ipcMain.handle('dbcanvas:get-procedure-code', async (_event, name: string, projectPath?: string) => {
    const config = discoverConnectionString(projectPath);
    if (!config?.connectionString) throw new Error('No DB config found');
    const db = await createDbClient(config.connectionString);
    try {
      return await getProcedureCode(db, name);
    } finally {
      await db.destroy();
    }
  });

  ipcMain.handle('dbcanvas:get-procedure-md', async (_event, name: string, projectPath?: string) => {
    const config = discoverConnectionString(projectPath);
    const root = config?.solutionRoot || projectPath || process.cwd();
    const procDir = path.join(root, '.dbcanvas', 'procedures');
    
    // Pattern 1: Literal name (e.g. Integracion.Something.md or Integracion_Something.md)
    const mdPath = path.join(procDir, `${name}.md`);
    if (fs.existsSync(mdPath)) {
      return fs.readFileSync(mdPath, 'utf8');
    }

    // Pattern 2: Normalize dot to underscore (e.g. Integracion.Something -> Integracion_Something.md)
    const underscoreName = name.replace('.', '_');
    const mdPathUnderscore = path.join(procDir, `${underscoreName}.md`);
    if (fs.existsSync(mdPathUnderscore)) {
      return fs.readFileSync(mdPathUnderscore, 'utf8');
    }

    return null;
  });

  ipcMain.handle('dbcanvas:get-table-schema', async (_event, name: string, projectPath?: string) => {
    const config = discoverConnectionString(projectPath);
    if (!config?.connectionString) throw new Error('No DB config found');
    const db = await createDbClient(config.connectionString);
    try {
      return await getTableColumns(db, name);
    } finally {
      await db.destroy();
    }
  });

  ipcMain.handle('dbcanvas:get-shadow-data', async (_event, tableName: string, projectPath?: string) => {
    const config = discoverConnectionString(projectPath);
    return getShadowData(tableName, config?.solutionRoot || projectPath);
  });

  ipcMain.handle('dbcanvas:capture-shadow-data', async (_event, tableName: string, params: Record<string, unknown>, projectPath?: string) => {
    const config = discoverConnectionString(projectPath);
    if (!config?.connectionString) throw new Error('No DB config found');
    const db = await createDbClient(config.connectionString);
    try {
      const count = await captureShadowData(db, tableName, params, undefined, config.solutionRoot);
      return { success: true, count };
    } finally {
      await db.destroy();
    }
  });

  ipcMain.handle('dbcanvas:mcp-status', async () => {
    return { running: true, version: '1.1.0' };
  });

  ipcMain.handle('dbcanvas:mcp-restart', async () => {
    return { success: true };
  });

  ipcMain.handle('dbcanvas:get-settings', async () => {
    return {};
  });

  ipcMain.handle('dbcanvas:save-settings', async (_event, settings: Record<string, unknown>) => {
    return { success: true };
  });

  // IDE Registration
  ipcMain.handle('dbcanvas:detect-ides', async () => {
    return detectInstalledIdes();
  });

  ipcMain.handle('dbcanvas:register-ide', async (_event, configPath: string) => {
    return registerInIde(configPath);
  });

  ipcMain.handle('dbcanvas:unregister-ide', async (_event, configPath: string) => {
    return unregisterFromIde(configPath);
  });

  // Project Management
  ipcMain.handle('dbcanvas:delete-project', async (_event, projectPath: string) => {
    return removeProject(projectPath);
  });

  ipcMain.handle('dbcanvas:rename-project', async (_event, projectPath: string, newName: string) => {
    return updateProjectName(projectPath, newName);
  });

  ipcMain.handle('dbcanvas:run-discovery', async (_event, searchPath?: string) => {
    const startPath = searchPath || process.env.HOME || '.';
    return discoverLocalProjects(startPath);
  });

  ipcMain.handle('dbcanvas:get-platform', async () => {
    return process.platform;
  });

  ipcMain.handle('dbcanvas:get-mcp-path', async () => {
    return getMcpServerPath();
  });
}

