import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mcpReleaseDir = path.join(__dirname, '../mcp-release');

// 1. Clean the release directory
if (fs.existsSync(mcpReleaseDir)) {
  fs.rmSync(mcpReleaseDir, { recursive: true, force: true });
}
fs.mkdirSync(mcpReleaseDir, { recursive: true });

// 2. Copy the bundled entrypoint
const bundleCjs = path.join(__dirname, '../../mcp-server/build/bundle.cjs');
if (fs.existsSync(bundleCjs)) {
  fs.copyFileSync(bundleCjs, path.join(mcpReleaseDir, 'index.cjs'));
} else {
  console.log('No bundle.cjs found. Run npm run bundle in mcp-server first.');
  process.exit(1);
}

// 3. Create a package.json to fetch all native/dynamic database drivers explicitly
const pkg = {
  name: "dbcanvas-mcp-server",
  version: "1.0.0",
  main: "index.cjs",
  dependencies: {
    "tedious": "^16.7.1",
    "sqlite3": "^5.1.7",
    "pg": "^8.11.3",
    "mssql": "^10.0.2"
  }
};
fs.writeFileSync(path.join(mcpReleaseDir, 'package.json'), JSON.stringify(pkg, null, 2));

// 4. Install production dependencies (pure JS and prebuilds where applicable)
console.log('Installing complete plugin dependencies for MCP Server...');
execSync('npm install --omit=dev --no-fund --no-audit', { 
  cwd: mcpReleaseDir, 
  stdio: 'inherit' 
});

console.log('MCP Server release directory prepared successfully.');
