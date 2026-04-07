# DBCanvas — Architecture

## Overview

DBCanvas is a commercial SQL database inspector for AI IDEs. It consists of 5 packages in an npm workspaces monorepo.

```
packages/
  core/          → Shared: database client, schema discovery, config finder, logger
  mcp-server/    → Standalone MCP server (14 tools, stdio transport)
  desktop/       → Electron app + Express SSE + React dashboard
    dashboard/   → React SPA with ForceGraph2D graph visualization
  platform/      → SaaS backend API (auth, licensing, admin)
  website/       → Marketing site + user account panel
```

## Package Dependency Graph

```
website (Vercel)  ──HTTP──►  platform (Railway + PostgreSQL)
                                 ▲
desktop (Electron)  ──HTTP──►────┘
    ├── core (local, via IPC)
    └── dashboard (React SPA, loaded via file://)

mcp-server (stdio) ──► core (direct import)
```

## Deployments

| Service | Platform | URL | Auto-deploy |
|---------|----------|-----|-------------|
| Website | Vercel | https://dbcanvas-web.vercel.app | On push to main |
| Platform API | Railway | https://dbcanvasplatform-production.up.railway.app | On push to main |
| Database | Railway PostgreSQL | Internal | — |
| Desktop releases | GitHub Releases | github.com/xaman1990/dbcanvas/releases | On tag `v*` |

## Tech Stack

- **Language:** TypeScript 5.3, ESNext/NodeNext modules
- **Runtime:** Node.js 20+
- **Monorepo:** npm workspaces
- **Database client:** Knex (pg, tedious, sqlite3), 30s query timeout, connection pool TTL
- **MCP:** @modelcontextprotocol/sdk + Zod v4 validation
- **Logging:** Pino (stderr, MCP-compatible)
- **Desktop:** Electron 41, electron-builder, electron-updater
- **Dashboard:** React 19, Vite 8, ForceGraph2D, Zustand, Lucide icons
- **Platform API:** Express 5, pg (PostgreSQL), JWT, bcrypt
- **Website:** React 19, Vite 8, React Router 6, i18n (EN/ES)
- **Auth:** GitHub OAuth, Google OAuth, Device code flow
- **Billing:** PayPal Subscriptions API (Sandbox)
- **CI/CD:** GitHub Actions (3-OS matrix build)
