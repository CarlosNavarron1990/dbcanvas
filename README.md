# DBCanvas

MCP server + desktop app that gives AI IDEs full visibility into SQL databases. Built for debugging applications with stored procedure logic.

**Supported IDEs:** Claude Desktop, Claude Code, Cursor, Antigravity, Windsurf, VS Code (Copilot), Codex

**Supported Databases:** SQL Server, PostgreSQL, SQLite

## Quick Install

```bash
git clone https://github.com/xmn-services/dbcanvas.git
cd dbcanvas
npm install
npm run build
```

### Register in your IDE

Add this to your IDE's MCP config file:

```json
{
  "mcpServers": {
    "dbcanvas": {
      "command": "node",
      "args": ["/path/to/dbcanvas/packages/mcp-server/build/index.js"]
    }
  }
}
```

| IDE | Config file |
|-----|------------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Code | `~/.claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Antigravity | `~/.antigravity/mcp.json` |
| Windsurf | `~/.windsurf/mcp.json` |
| VS Code | `~/.vscode/mcp.json` |

DBCanvas auto-discovers your database connection from `.env`, `web.config`, or `appsettings.json` in the project directory. No credentials needed in the MCP config.

## 17 MCP Tools

### Core
| Tool | What it does |
|------|-------------|
| `test_connection` | Validate DB connectivity |
| `get_effective_config` | Show active config source |
| `find_object` | Search tables/SPs by name across databases |
| `sync_discovery` | Full schema sync to local cache |

### Exploration
| Tool | What it does |
|------|-------------|
| `get_sp_definition` | Fetch SP code, auto-save as .md |
| `get_table_schema` | Return columns/types |
| `query_data` | Execute safe SELECT queries |
| `explore_and_anchor_sp` | Deep SP exploration with dependency capture |
| `get_discovery_graph` | Return relationship graph |

### SP Simulator (core feature)
| Tool | What it does |
|------|-------------|
| `capture_sp_data` | Capture SP's SELECT results with real params for offline testing |
| `simulate_sp` | Run modified SP code against captured data — no real DB needed |
| `get_capture` | View latest captured data snapshot |

### Analysis
| Tool | What it does |
|------|-------------|
| `trace_lineage` | Trace field data flow across SPs and tables |
| `sp_diff` | Compare current SP with last saved version |
| `annotate` | Save AI-generated explanation for a DB object |
| `get_annotation` | Retrieve cached explanation |
| `list_projects` | List registered solution roots |

## SP Simulator — How it works

The killer feature: test SP modifications without touching production.

```
1. CAPTURE:  Tell the AI what SP you'll edit and with what params
             → Executes the SP's SELECTs against real DB, stores results locally

2. EDIT:     Modify the SP code in your IDE as usual

3. SIMULATE: Ask the AI to simulate your changes
             → Runs modified queries against local data, shows results + diff

4. DEPLOY:   Only push to real DB after validating the simulation
```

## Dashboard

```bash
npm run start:dashboard   # http://localhost:3000
```

- Force-directed graph visualization of database relationships
- Obsidian-style controls (repel force, link distance, center force)
- Hover to highlight connections
- Click tables to see schema, click SPs to see code
- Dark/Light theme, Command Palette (Cmd+K)
- Export as PNG, JSON, SQL DDL, CSV

## Architecture

```
packages/
  core/          Shared: database, discovery, config, simulator, logger
  mcp-server/    Standalone MCP server (17 tools, Zod validation)
  desktop/       Electron app + Express API + React dashboard
```

## License

MIT
