# DBCanvas — Roadmap

## Completed

- [x] Monorepo restructure (core, mcp-server, desktop, platform, website)
- [x] MCP server with 14 tools + Zod validation
- [x] Electron desktop app with Obsidian-style graph explorer
- [x] ForceGraph2D visualization with custom node rendering
- [x] Command palette (Cmd+K), tree explorer, detail panel
- [x] IPC bridge (preload → main process)
- [x] IDE auto-registration (Claude, Cursor, Windsurf, VS Code, Antigravity, Codex)
- [x] Website (React + Vite) deployed on Vercel
- [x] Platform API (Express 5 + PostgreSQL) deployed on Railway
- [x] GitHub OAuth login/register
- [x] Google OAuth login/register
- [x] Device auth flow for desktop login (Postman-style auto-authorize)
- [x] PayPal subscriptions (Sandbox) — Pro $19, Team $49
- [x] Account panel on website (profile, billing, license, usage)
- [x] Admin panel (view users, grant/revoke Pro/Team without payment)
- [x] 14-day Pro trial
- [x] License renewal cron job
- [x] Electron distributables (macOS arm64/x64, Windows, Linux)
- [x] Auto-updater (electron-updater + GitHub Releases)
- [x] CI/CD: GitHub Actions release workflow (3 OS matrix)
- [x] Desktop login screen + session management
- [x] Account tab in Settings (user info, tier, logout)
- [x] Update notifications in desktop UI
- [x] macOS titlebar drag region + traffic light spacing
- [x] i18n (EN/ES) on website

## In Progress

- [ ] Desktop layout refinements (responsive, margins, user display)

## Pending

### High Priority
- [ ] Apple Developer Program ($99/yr) — macOS code signing + notarization
- [ ] Windows EV Code Signing Certificate — SmartScreen bypass
- [ ] Domain purchase (dbcanvas.dev or dbcanvas.app)
- [ ] PayPal: migrate from Sandbox to Production

### Medium Priority
- [ ] Transactional email (welcome, invoice, license expiration)
- [ ] Client-side feature gating (enforce tier limits in desktop)
- [ ] Dashboard code splitting (chunk >500KB)
- [ ] SP Simulator tool
- [ ] Export: graph as PNG/JSON, schema as SQL DDL, data as CSV

### Low Priority
- [ ] Multi-language support for MCP tools
- [ ] Team management features (shared workspaces, annotations)
- [ ] Usage analytics / telemetry
- [ ] onboarding tutorial / documentation site
