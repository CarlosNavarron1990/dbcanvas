# DBCanvas

Commercial SQL database inspector for AI IDEs. Installable desktop app + MCP server + SaaS platform.

## Architecture (Monorepo)

```
packages/
  core/          → Shared: database, discovery, config, logger
  mcp-server/    → Standalone MCP server (IDEs invoke via stdio)
  desktop/       → Electron app + Express API + React dashboard
    dashboard/   → React SPA with ForceGraph2D visualization
  platform/      → SaaS backend API (auth, licensing, admin) — deployed on Railway
  website/       → Marketing site + account panel — deployed on Vercel
```

### Package Responsibilities

- **core** — DB client (Knex), schema discovery (SQLite), config finder, Pino logger
- **mcp-server** — Standalone stdio MCP server with 14 tools, Zod validation
- **desktop** — Electron 41 app with IPC bridge, Express SSE on 127.0.0.1:3000, auto-updater
- **platform** — Express 5 REST API: GitHub/Google OAuth, device auth, PayPal subscriptions, admin panel, PostgreSQL on Railway
- **website** — React 19 + Vite 8 SPA: landing page, download page, auth pages, account panel (i18n EN/ES)

### Key Integrations

- **Electron ↔ Dashboard**: preload.ts (CJS bundle via esbuild) exposes `window.dbcanvas.*` via contextBridge
- **Desktop ↔ Platform**: Device auth flow (GitHub-style) for login; polling-based authorization
- **Platform ↔ Website**: OAuth callbacks redirect to Vercel frontend; API calls go to Railway backend
- **Auto-updater**: electron-updater reads `latest*.yml` from GitHub Releases; checks every 4h

## Tech Stack

- TypeScript 5.3, Node.js 20+, ESNext/NodeNext modules
- npm workspaces (monorepo)
- Knex (pg, tedious, sqlite3) with 30s query timeout, connection pooling with TTL
- MCP SDK + Zod v4 validation for all tool inputs
- Pino structured logger (stderr, MCP-compatible)
- Electron 41 + electron-builder (.dmg x64/arm64, .exe NSIS, .AppImage)
- React 19 + Vite 8, ForceGraph2D, Zustand, Lucide icons
- PostgreSQL (Railway) for platform persistence
- PayPal Subscriptions API (Sandbox) for billing
- GitHub + Google OAuth for authentication

## Deployments

| Service | Platform | URL |
|---------|----------|-----|
| Website | Vercel | https://dbcanvas-web.vercel.app |
| Platform API | Railway | https://dbcanvasplatform-production.up.railway.app |
| Database | Railway PostgreSQL | Internal connection |
| Desktop releases | GitHub Releases | https://github.com/xaman1990/dbcanvas/releases |

## Commands

```bash
# Build
npm run build              # Build all packages (core → mcp → desktop → platform)
npm run build:mcp          # Build core + mcp-server only
npm run build:desktop      # Build core + desktop + dashboard
npm run bundle -w @dbcanvas/mcp-server  # Bundle MCP as single .mjs (for Electron packaging)

# Run
npm run start:mcp          # Run MCP server (stdio)
npm run start:dashboard    # Run Express server on :3000
npm run start:desktop      # Launch Electron app
npm run start:platform     # Run platform API

# Test
npm test                   # Run all tests (core + mcp-server)
npm test -w @dbcanvas/core
npm test -w @dbcanvas/mcp-server

# Other
npm run clean              # Clean all build outputs
npm run format             # Prettier
```

## Project Structure

```
packages/core/src/
  database.ts       # DB client, queries, SQL injection protection, query timeout
  discovery.ts      # Schema graph (SQLite), shadow tables, pagination
  config.ts         # Config discovery (.env, web.config, appsettings.json)
  logger.ts         # Pino structured logger

packages/mcp-server/src/
  index.ts          # MCP stdio server - 14 tools, Zod validation, connection pool
  schemas.ts        # Zod schemas for all tool inputs
  scripts/bundle.mjs # esbuild JS API bundle (cross-platform, avoids shell quoting)

packages/desktop/src/
  main.ts           # Electron main: window, auto-updater, single-instance lock
  preload.ts        # contextBridge API (bundled as CJS via esbuild)
  ipc-handlers.ts   # IPC ↔ core bridge
  server.ts         # Express API (SSE bridge, path traversal protection)
  device-auth.ts    # Device auth flow (login via Vercel website)
  ide-registrar.ts  # Auto-register MCP in Claude/Cursor/Windsurf/VS Code/Antigravity
  menu.ts           # Native Electron menu
  tray.ts           # System tray icon

packages/desktop/dashboard/src/
  App.tsx           # Shell: auth check → login → onboarding → main app
  api.ts            # Adapter: IPC (Electron) or HTTP (standalone) fallback
  store/useStore.ts # Zustand store (graph, session, theme, updates, IDE state)
  components/
    GraphCanvas.tsx       # ForceGraph2D with custom node rendering
    DetailPanel.tsx       # Properties, code/schema, data tabs
    TreeExplorer.tsx      # Folder tree sidebar
    CommandPalette.tsx    # Cmd+K search
    SettingsView.tsx      # Account, IDE registration, auto-register, theme
    Toolbar.tsx           # Header bar
    Sidebar.tsx           # Left icon nav + user avatar
    LoginScreen.tsx       # Device auth login screen
    Onboarding.tsx        # First-run wizard
    NotificationToast.tsx # MCP signal notifications

packages/platform/src/
  index.ts          # Express 5 server entry
  db.ts             # PostgreSQL connection (pg)
  middleware/auth.ts # JWT auth + token generation
  routes/
    auth.ts         # GitHub/Google OAuth
    device-auth.ts  # Device code flow for desktop
    users.ts        # User CRUD + admin
    licenses.ts     # License management + admin grant
    subscriptions.ts # PayPal subscription webhooks
    admin.ts        # Admin panel endpoints

packages/website/src/
  App.tsx           # React Router: landing, download, auth, account
  pages/
    Landing.tsx     # Marketing landing page
    Download.tsx    # Platform download cards (macOS arm64/x64, Windows, Linux)
    DeviceAuth.tsx  # Auto-authorize device (reads ?code= from URL)
    Account.tsx     # Obsidian-style account panel (profile, billing, license)
  useI18n.ts        # i18n hook (EN/ES auto-detect)
```

## Security

- SQL injection protection: identifier whitelist, dangerous pattern blocking
- Path traversal protection: sanitizeParam on all route params
- Express bound to 127.0.0.1 with restrictive CORS
- Read-only queries: blocks INSERT/UPDATE/DELETE/DROP/EXEC/xp_/sp_/DBCC
- Connection pool TTL cleanup (10 min)
- Graceful shutdown on SIGTERM/SIGINT
- Password masking in all logs and responses
- Electron preload: contextIsolation + nodeIntegration disabled
- JWT tokens for API auth, device codes expire in 10 minutes

## MCP Tools (14 total)

| Tool | Purpose |
|------|---------|
| `test_connection` | Validate DB connectivity |
| `get_effective_config` | Show active config source |
| `get_sp_definition` | Fetch SP source, auto-save as .md |
| `get_table_schema` | Return columns/types, create shadow structure |
| `query_data` | Execute SELECT (blocks dangerous SQL) |
| `find_object` | Search tables/SPs by name across databases |
| `sync_discovery` | Full schema sync to local SQLite |
| `get_discovery_graph` | Return nodes/links with pagination |
| `explore_and_anchor_sp` | Deep SP exploration with dependency capture |
| `list_projects` | List registered solution roots |
| `trace_lineage` | Trace field data flow across SPs and tables |
| `sp_diff` | Compare current SP code with last saved version |
| `annotate` | Save AI-generated explanation for a DB object |
| `get_annotation` | Retrieve cached AI explanation |

## Licensing Model

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Basic MCP tools, 1 database |
| Pro | $19/mo | All tools, unlimited databases, priority support |
| Team | $49/mo | Pro + team management, shared annotations |

- PayPal Subscriptions API (Sandbox mode currently)
- Admin can grant Pro/Team without payment via admin panel
- 14-day trial for Pro tier

## CI/CD

- `.github/workflows/ci.yml` — Build + test on push/PR (Ubuntu, macOS, Windows)
- `.github/workflows/release.yml` — Build Electron distributables on tag push (`v*`)
  - Builds on 3 OS matrix (macos-latest, windows-latest, ubuntu-latest)
  - Publishes to GitHub Releases with `--publish always`
  - Artifacts: DBCanvas-arm64.dmg, DBCanvas-x64.dmg, DBCanvas-Setup.exe, DBCanvas.AppImage

## Desktop Build Notes

- **preload.ts must be CJS**: Electron preload doesn't support ESM. Build step uses esbuild to bundle as CJS.
- **MCP server bundled as single .mjs**: `scripts/bundle.mjs` uses esbuild JS API (not CLI) to avoid Windows shell quoting issues.
- **macOS unsigned**: Currently no Apple Developer cert. Users need `xattr -cr` or Gatekeeper bypass. Apple Developer ($99/yr) needed for production.
- **Dashboard base path**: Vite config uses `base: './'` for file:// protocol compatibility in Electron.
- **macOS titlebar**: Uses `titleBarStyle: 'hiddenInset'` with CSS drag region (38px top).

## Conventions

- Build output in `build/` per package (never commit)
- Local DB in `.dbcanvas/` or `.nexusdb/` (gitignored)
- Connection strings from config discovery, never hardcoded
- All MCP tool inputs validated with Zod schemas
- Logging via Pino (stderr, compatible with MCP stdio)
- Tests in `*.test.ts` files alongside source, run with Vitest
- Commits: conventional commits style (feat/fix/chore)
- Release tags: `v*` pattern triggers CI build
