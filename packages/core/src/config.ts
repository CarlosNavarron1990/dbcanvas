import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

export interface DbConfig {
  connectionString: string;
  source: string;
  configDir: string;
  solutionRoot: string;
  filePath?: string;
  lastModified?: Date;
}

const COMMON_ENV_FILES = ['.env', '.env.local', '.env.development', '.env.test'];
const COMMON_CONFIG_FILES = ['web.config', 'Web.config', 'appsettings.json', 'appsettings.Development.json'];

function tryParseConfigFile(configPath: string | null, fileName: string, solutionRoot: string): DbConfig | null {
  if (!configPath) return null;
  try {
    const stats = fs.statSync(configPath);
    const content = fs.readFileSync(configPath, 'utf-8');

    if (fileName.toLowerCase().endsWith('.config')) {
      // Extract all connectionString attributes
      const matches = [...content.matchAll(/connectionString="([^"]+)"/gi)];
      for (const match of matches) {
        let connStr = match[1];
        // Skip Entity Framework metadata strings — extract inner provider connection string
        if (connStr.startsWith('metadata=')) {
          const inner = connStr.match(/provider connection string=&quot;([^&]+)&quot;/i)
            || connStr.match(/provider connection string="([^"]+)"/i);
          if (inner) connStr = inner[1];
          else continue; // Skip if can't extract inner connection
        }
        // Prefer plain ADO.NET strings (have Server= or Data Source= but no metadata=)
        if (connStr.includes('Data Source=') || connStr.includes('data source=') || connStr.includes('Server=')) {
          return { connectionString: connStr, source: `${fileName} (${configPath})`, configDir: path.dirname(configPath), solutionRoot, filePath: configPath, lastModified: stats.mtime };
        }
      }
    } else if (fileName.toLowerCase().endsWith('.json')) {
      const json = JSON.parse(content);
      const connString = json.ConnectionStrings?.DefaultConnection ||
        json.ConnectionStrings?.DATABASE_URL ||
        json.DATABASE_URL;
      if (connString) {
        return { connectionString: connString, source: `${fileName} (${configPath})`, configDir: path.dirname(configPath), solutionRoot, filePath: configPath, lastModified: stats.mtime };
      }
    }
  } catch { }
  return null;
}

export function discoverConnectionString(overridePath?: string): DbConfig | null {
  const currentDir = process.cwd();

  // Use the script location as a fallback for the search start
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const searchStarts = overridePath ? [overridePath] : [currentDir, path.join(scriptDir, '..')];

  for (const start of searchStarts) {
    if (!start || start === '/') continue;

    const solutionRoot = findSolutionRoot(start);

    // 0. Check for .dbcanvas/connection.json
    if (solutionRoot && solutionRoot !== '/') {
      const dbcanvasPath = path.join(solutionRoot, '.dbcanvas', 'connection.json');
      if (fs.existsSync(dbcanvasPath)) {
        try {
          const stats = fs.statSync(dbcanvasPath);
          const configJson = fs.readFileSync(dbcanvasPath, 'utf8');
          // Validate json format
          JSON.parse(configJson); 
          return { connectionString: configJson, source: `connection.json (${dbcanvasPath})`, configDir: path.dirname(dbcanvasPath), solutionRoot, filePath: dbcanvasPath, lastModified: stats.mtime };
        } catch(e) {}
      }
    }

    // 1. Check for .env variations
    for (const fileName of COMMON_ENV_FILES) {
      const envPath = findFileUpwards(start, fileName);
      if (envPath) {
        try {
          const stats = fs.statSync(envPath);
          const envConfig = dotenv.parse(fs.readFileSync(envPath));
          const connectionString = envConfig.DATABASE_URL ||
            envConfig.DB_CONNECTION ||
            envConfig.CONNECTION_STRING ||
            envConfig.DB_URL;
          if (connectionString) {
            return { connectionString, source: `${fileName} (${envPath})`, configDir: path.dirname(envPath), solutionRoot, filePath: envPath, lastModified: stats.mtime };
          }
        } catch (e) { }
      }
    }

    // 2. Check for config files (web.config or appsettings.json) — upwards
    for (const fileName of COMMON_CONFIG_FILES) {
      const configPath = findFileUpwards(start, fileName);
      const result = tryParseConfigFile(configPath, fileName, solutionRoot);
      if (result) return result;
    }

    // 3. Search in subdirectories of solution root (.NET solutions have web.config in subprojects)
    if (solutionRoot && solutionRoot !== '/') {
      try {
        const entries = fs.readdirSync(solutionRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const subDir = path.join(solutionRoot, entry.name);
          for (const fileName of COMMON_CONFIG_FILES) {
            const configPath = path.join(subDir, fileName);
            if (fs.existsSync(configPath)) {
              const result = tryParseConfigFile(configPath, fileName, solutionRoot);
              if (result) return result;
            }
          }
        }
      } catch { }
    }
  }

  return null;
}

function findFileUpwards(startDir: string, fileName: string): string | null {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const fullPath = path.join(currentDir, fileName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Defensive break
    currentDir = parentDir;
  }

  // Check root
  const rootPath = path.join(root, fileName);
  if (fs.existsSync(rootPath)) return rootPath;

  return null;
}

/**
 * Searches for the solution root by looking for markers upwards from startDir.
 * Priority: .sln (highest) > .git > fallback to startDir.
 *
 * Key behavior: keeps walking UP to find the HIGHEST .sln file, so that
 * opening a subproject (e.g. sisGoVari.DataLayer/) still resolves to the
 * solution root (e.g. sisGoVari/) where the .sln lives.
 */
export interface RegisteredProject {
  name: string;
  path: string;
}

export function findSolutionRoot(startDir: string): string {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;
  const home = process.env.HOME || '';

  let slnCandidate: string | null = null;
  let gitCandidate: string | null = null;

  while (current !== root && current !== home && current !== path.dirname(home)) {
    try {
      const files = fs.readdirSync(current);

      // Check for .sln — this is the strongest signal for solution root
      const hasSln = files.some(f => f.toLowerCase().endsWith('.sln'));
      if (hasSln) {
        slnCandidate = current;
      }

      // Check for .git — good signal
      if (!gitCandidate && files.includes('.git')) {
        gitCandidate = current;
      }
    } catch { }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const result = slnCandidate || gitCandidate || path.resolve(startDir);
  registerSolutionRoot(result);
  return result;
}

export function registerSolutionRoot(rootPath: string) {
  try {
    const registryPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dbcanvas_registry.json');
    const registryDir = path.dirname(registryPath);
    if (!fs.existsSync(registryDir)) fs.mkdirSync(registryDir, { recursive: true });

    let projects = getRegisteredProjects();

    if (!projects.find(p => p.path === rootPath)) {
      projects.push({
        name: path.basename(rootPath),
        path: rootPath
      });
      fs.writeFileSync(registryPath, JSON.stringify(projects, null, 2));
    }
  } catch (e) { }
}

export function getRegisteredProjects(): RegisteredProject[] {
  try {
    const registryPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dbcanvas_registry.json');
    if (fs.existsSync(registryPath)) {
      const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

      // Migration: convert string[] to RegisteredProject[]
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
        const migrated = (data as string[]).map(p => ({
          name: path.basename(p),
          path: p
        }));
        fs.writeFileSync(registryPath, JSON.stringify(migrated, null, 2));
        return migrated;
      }
      return data;
    }
  } catch (e) { }
  return [];
}

export function removeProject(projectPath: string) {
  const projects = getRegisteredProjects().filter(p => p.path !== projectPath);
  const registryPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dbcanvas_registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(projects, null, 2));
}

export function updateProjectName(projectPath: string, newName: string) {
  const projects = getRegisteredProjects().map(p =>
    p.path === projectPath ? { ...p, name: newName } : p
  );
  const registryPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dbcanvas_registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(projects, null, 2));
}

/**
 * Discovers projects by scanning for directories containing .dbcanvas
 */
export function discoverLocalProjects(searchPath: string): RegisteredProject[] {
  const discovered: RegisteredProject[] = [];
  const maxDepth = 4;

  function scan(dir: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // Check if this directory is already a project
      if (entries.some(e => e.isDirectory() && e.name === '.dbcanvas')) {
        discovered.push({
          name: path.basename(dir),
          path: dir
        });
        return; // Don't scan deeper into found projects
      }

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'bin' && entry.name !== 'obj') {
          scan(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch { }
  }

  scan(path.resolve(searchPath), 0);

  // Register discovered projects that aren't already registered
  const existing = getRegisteredProjects();
  const existingPaths = new Set(existing.map(p => p.path));

  for (const p of discovered) {
    if (!existingPaths.has(p.path)) {
      registerSolutionRoot(p.path);
    }
  }

  return getRegisteredProjects();
}
