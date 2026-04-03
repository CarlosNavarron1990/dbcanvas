# DBCanvas

Installable desktop app + MCP server that gives AI IDEs (Claude, Cursor, Codex, Antigravity) visibility into SQL databases.

## Architecture (Monorepo)

```
packages/
  core/          → Shared: database, discovery, config, logger
  mcp-server/    → Standalone MCP server (IDEs invoke via stdio)
  desktop/       → Electron app + Express API + React dashboard
    dashboard/   → React SPA with ForceGraph2D visualization
```

- **Electron** is the installable desktop app (Mac .dmg / Win .exe)
- **MCP Server** is a standalone process that IDEs invoke as `node packages/mcp-server/build/index.js`
- **Express** runs inside Electron on 127.0.0.1:3000 for MCP bridge notifications (SSE)
- **IPC Bridge** (preload.ts) connects React dashboard to Electron main process securely
- **IDE Registrar** auto-writes MCP config to `~/.claude/claude_desktop_config.json`, `~/.cursor/mcp.json`, etc.

## Tech Stack

- TypeScript 5.3, Node.js 20+, ESNext/NodeNext modules
- npm workspaces (monorepo)
- Knex (pg, tedious, sqlite3) with 30s query timeout, connection pooling with TTL
- MCP SDK + Zod validation for all tool inputs
- Pino structured logger
- Electron 41 + electron-builder (.dmg, .exe NSIS, AppImage)
- React 19 + Vite 8, ForceGraph2D, Lucide icons

## Commands

```bash
npm run build           # Build all 3 packages (core → mcp → desktop)
npm run build:mcp       # Build core + mcp-server only
npm run build:desktop   # Build core + desktop + dashboard
npm run start:mcp       # Run MCP server (stdio)
npm run start:dashboard # Run Express server on :3000
npm run start:desktop   # Launch Electron app
npm run clean           # Clean all build outputs
```

## Project Structure

```
packages/core/src/
  database.ts     # DB client, queries, SQL injection protection, query timeout
  discovery.ts    # Schema graph (SQLite), shadow tables, pagination
  config.ts       # Config discovery (.env, web.config, appsettings.json)
  logger.ts       # Pino structured logger

packages/mcp-server/src/
  index.ts        # MCP stdio server - 10 tools, Zod validation, connection pool with TTL
  schemas.ts      # Zod schemas for all tool inputs

packages/desktop/src/
  main.ts         # Electron main process, IPC registration, graceful shutdown
  preload.ts      # contextBridge API for renderer
  ipc-handlers.ts # IPC ↔ core bridge
  server.ts       # Express API (SSE bridge, path traversal protection, bind 127.0.0.1)
  ide-registrar.ts # Auto-register MCP in Claude/Cursor/Windsurf/VS Code/Antigravity

packages/desktop/src/
  menu.ts         # Native Electron menu (File, Edit, View, Window, Help)
  tray.ts         # System tray icon with MCP status and quick actions

packages/desktop/dashboard/src/
  App.tsx         # Shell component with onboarding check
  api.ts          # Adapter: IPC (Electron) or HTTP (standalone) fallback
  store/useStore.ts # Zustand store (graph, selection, theme, IDE state)
  components/
    GraphCanvas.tsx      # ForceGraph2D with custom nodeCanvasObject + glow
    DetailPanel.tsx      # Properties, code/schema, data tabs
    TreeExplorer.tsx     # Folder tree sidebar
    CommandPalette.tsx   # Cmd+K search (nodes + actions)
    SettingsView.tsx     # IDE registration + theme toggle
    Toolbar.tsx          # Header bar with Cmd+K button
    Sidebar.tsx          # Left icon nav
    NotificationToast.tsx # MCP signal notifications
    Onboarding.tsx       # First-run wizard (connect, sync, register IDEs)
```

## Security

- SQL injection protection: identifier whitelist, dangerous pattern blocking
- Path traversal protection: sanitizeParam on all route params
- Express bound to 127.0.0.1 with restrictive CORS
- Read-only queries: blocks INSERT/UPDATE/DELETE/DROP/EXEC/xp_/sp_/DBCC
- Connection pool TTL cleanup (10 min)
- Graceful shutdown on SIGTERM/SIGINT
- Password masking in all logs and responses

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

## Key Concepts

- **Discovery Graph**: Nodes (TABLE/PROCEDURE/VIEW) + Edges (FK/USAGE) in local SQLite
- **Shadow Data**: Local copies of remote table data for offline debugging
- **Data Lineage**: Field-level tracing across SPs (READS/WRITES/TRANSFORMS)
- **AI Annotations**: Cached explanations for SPs/tables, stored in discovery.db
- **SP Diff**: Line-by-line comparison of remote vs locally saved SP code
- **Config Discovery**: Walks directory tree up for .env, web.config, appsettings.json
- **IDE Auto-Registration**: Detects installed IDEs and writes MCP config automatically
- **Export**: Graph as PNG/JSON, schema as SQL DDL, data as CSV

## Testing

```bash
npm test               # Run all tests (54 tests across core + mcp-server)
npm test -w @dbcanvas/core        # Core tests only
npm test -w @dbcanvas/mcp-server  # MCP schema tests only
```

## CI/CD

- `.github/workflows/ci.yml` — Build + test on push/PR (Ubuntu, macOS, Windows)
- `.github/workflows/release.yml` — Build Electron distributables on tag push

## Conventions

- Build output in `build/` per package (never commit)
- Local DB in `.dbcanvas/` (gitignored)
- Connection strings from config discovery, never hardcoded
- All MCP tool inputs validated with Zod schemas
- Logging via Pino (stderr, compatible with MCP stdio)
- Tests in `*.test.ts` files alongside source, run with Vitest
