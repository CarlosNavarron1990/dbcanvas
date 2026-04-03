import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';

interface IdeConfig {
  name: string;
  configPath: string;
  exists: boolean;
  registered: boolean;
}

interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

const HOME = os.homedir();

/**
 * All known IDE config file locations for MCP server registration.
 * Format is identical across all IDEs: { mcpServers: { "name": { command, args, env } } }
 */
function getIdeConfigPaths(): { name: string; path: string }[] {
  const platform = process.platform;
  const configs: { name: string; path: string }[] = [];

  // Claude Desktop
  configs.push({ name: 'Claude Desktop', path: path.join(HOME, '.claude', 'claude_desktop_config.json') });
  if (platform === 'darwin') {
    configs.push({ name: 'Claude Desktop (App Support)', path: path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json') });
  } else if (platform === 'win32') {
    configs.push({ name: 'Claude Desktop (AppData)', path: path.join(HOME, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json') });
  }

  // Cursor
  configs.push({ name: 'Cursor', path: path.join(HOME, '.cursor', 'mcp.json') });

  // Windsurf (Codeium)
  configs.push({ name: 'Windsurf', path: path.join(HOME, '.windsurf', 'mcp.json') });

  // Antigravity
  configs.push({ name: 'Antigravity', path: path.join(HOME, '.antigravity', 'mcp.json') });

  // VS Code (Copilot MCP support)
  configs.push({ name: 'VS Code', path: path.join(HOME, '.vscode', 'mcp.json') });

  return configs;
}

/** Get the path to the MCP server entry point */
function getMcpServerPath(): string {
  if (app.isPackaged) {
    // In packaged app, MCP server is in resources/mcp-server
    return path.join(process.resourcesPath, 'mcp-server', 'index.js');
  }
  // In development, point to the workspace build
  return path.resolve(path.join(__dirname, '..', '..', 'mcp-server', 'build', 'index.js'));
}

/** Build the MCP server entry for IDE config files */
function buildMcpEntry(): McpServerEntry {
  return {
    command: 'node',
    args: [getMcpServerPath()],
  };
}

/** Detect which IDEs are installed (config directory exists) */
export function detectInstalledIdes(): IdeConfig[] {
  const configs = getIdeConfigPaths();
  return configs.map(cfg => {
    const configDir = path.dirname(cfg.path);
    const dirExists = fs.existsSync(configDir);
    let registered = false;

    if (fs.existsSync(cfg.path)) {
      try {
        const content = JSON.parse(fs.readFileSync(cfg.path, 'utf8'));
        registered = !!(content.mcpServers?.['dbcanvas']);
      } catch {}
    }

    return {
      name: cfg.name,
      configPath: cfg.path,
      exists: dirExists,
      registered,
    };
  });
}

/** Register DBCanvas MCP server in a specific IDE config file */
export function registerInIde(configPath: string): { success: boolean; error?: string } {
  try {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      return { success: false, error: `IDE directory not found: ${configDir}` };
    }

    let config: Record<string, any> = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        // File exists but isn't valid JSON — back it up and start fresh
        fs.copyFileSync(configPath, configPath + '.bak');
      }
    }

    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    config.mcpServers['dbcanvas'] = buildMcpEntry();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Unregister DBCanvas MCP server from a specific IDE config file */
export function unregisterFromIde(configPath: string): { success: boolean; error?: string } {
  try {
    if (!fs.existsSync(configPath)) {
      return { success: true }; // Nothing to unregister
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.mcpServers?.['dbcanvas']) {
      delete config.mcpServers['dbcanvas'];
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Register in all detected IDEs at once */
export function registerInAllIdes(): { results: Array<{ name: string; success: boolean; error?: string }> } {
  const ides = detectInstalledIdes();
  const results = ides
    .filter(ide => ide.exists && !ide.registered)
    .map(ide => ({
      name: ide.name,
      ...registerInIde(ide.configPath),
    }));

  return { results };
}
