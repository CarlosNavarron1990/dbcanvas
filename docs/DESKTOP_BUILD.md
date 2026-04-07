# DBCanvas — Desktop Build & Distribution

## Build Pipeline

```bash
# 1. Build TypeScript (all packages)
npm run build

# 2. Bundle MCP server as single file (for packaging inside Electron)
npm run bundle -w @dbcanvas/mcp-server

# 3. Build dashboard React app
cd packages/desktop/dashboard && npm install && npm run build

# 4. Build Electron distributables
cd packages/desktop && npx electron-builder --mac --publish always
```

## Output Artifacts

| Platform | File | Size |
|----------|------|------|
| macOS Apple Silicon | `DBCanvas-arm64.dmg` | ~128 MB |
| macOS Intel | `DBCanvas-x64.dmg` | ~133 MB |
| Windows | `DBCanvas-Setup.exe` | ~109 MB |
| Linux | `DBCanvas.AppImage` | ~128 MB |

## Critical Build Notes

### 1. Preload must be CJS

Electron preload scripts do not support ESM. The project uses `"type": "module"`, so TypeScript compiles to ESM. The build step re-bundles preload.ts as CommonJS:

```json
"build": "tsc && npx esbuild src/preload.ts --bundle --platform=node --format=cjs --outfile=build/preload.js --external:electron"
```

**Symptom if broken:** `window.dbcanvas` is undefined → login screen never shows, IPC calls fail silently.

### 2. MCP Server Bundle (Cross-Platform)

The `--banner:js='...'` CLI syntax fails on Windows. Use the esbuild Node.js API instead:

```javascript
// packages/mcp-server/scripts/bundle.mjs
import { build } from 'esbuild';
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'build/bundle.mjs',
  external: ['sqlite3', 'better-sqlite3', 'tedious', 'pg-native', ...],
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);'
  }
});
```

### 3. Vite Base Path

Dashboard Vite config must use `base: './'` for Electron's `file://` protocol:

```typescript
// packages/desktop/dashboard/vite.config.ts
export default defineConfig({
  plugins: [react()],
  base: './',
});
```

### 4. macOS Titlebar

Uses `titleBarStyle: 'hiddenInset'` with a CSS drag region:

```css
.titlebar-drag {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 38px;
  -webkit-app-region: drag;
  z-index: 9999;
}
```

All sidebar/toolbar content needs `padding-top: ~40px` to avoid overlap with macOS traffic lights.

### 5. Extra Resources (Packaging)

The MCP server bundle and native modules are packed as `extraResources`:

```json
"extraResources": [
  { "from": "../../packages/mcp-server/build/bundle.mjs", "to": "mcp-server/index.mjs" },
  { "from": "../../node_modules/sqlite3", "to": "mcp-server/node_modules/sqlite3" },
  { "from": "../../node_modules/tedious", "to": "mcp-server/node_modules/tedious" }
]
```

Native `.node` files are unpacked from asar: `"asarUnpack": ["**/node_modules/sqlite3/**", "**/*.node"]`

## Auto-Updater

Uses `electron-updater` with GitHub Releases as provider:

```json
"publish": { "provider": "github", "owner": "xaman1990", "repo": "dbcanvas" }
```

- Checks on startup (3s delay) and every 4 hours
- Auto-downloads updates
- Dashboard shows update notification in Settings > Account > Updates
- IPC: `dbcanvas:install-update` triggers `quitAndInstall()`

**Important:** Release must be **published** (not draft) for auto-updater to detect it.

## Code Signing (TODO)

### macOS
- Requires Apple Developer Program ($99/year)
- Need: Developer ID Application certificate
- electron-builder handles signing + notarization when env vars are set:
  - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
  - `CSC_LINK` (p12 cert base64), `CSC_KEY_PASSWORD`

### Windows
- EV Code Signing Certificate ($200-400/year) for SmartScreen bypass
- Without it: "Unknown publisher" warning (app still installs)

## CI/CD (GitHub Actions)

`.github/workflows/release.yml` — Triggered on tag push `v*`:

```yaml
strategy:
  matrix:
    include:
      - os: macos-latest    # → .dmg (arm64 + x64)
        target: mac
      - os: windows-latest   # → .exe (NSIS)
        target: win
      - os: ubuntu-latest    # → .AppImage
        target: linux
```

### Release Process

```bash
# 1. Commit changes
git add . && git commit -m "feat: ..."

# 2. Push to main
git push origin main

# 3. Create and push tag
git tag v1.0.0-beta.6
git push origin v1.0.0-beta.6

# 4. Monitor: https://github.com/xaman1990/dbcanvas/actions

# 5. Publish the draft release on GitHub Releases page
```

## Dev Testing

```bash
# Kill previous instances + clear session
pkill -f "electron"
rm -f ~/.dbcanvas_session.json
rm -rf ~/Library/Application\ Support/DBCanvas/

# Build
npm run build -w @dbcanvas/desktop
cd packages/desktop/dashboard && npm run build && cd -

# Launch with logging
ELECTRON_ENABLE_LOGGING=1 ./node_modules/.bin/electron packages/desktop/build/main.js
```
