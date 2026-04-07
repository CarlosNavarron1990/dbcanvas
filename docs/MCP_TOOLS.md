# DBCanvas — MCP Tools Reference

## Overview

DBCanvas exposes 14 MCP tools via stdio transport. AI IDEs (Claude, Cursor, Codex, Antigravity, VS Code Copilot, Windsurf) connect to the MCP server and invoke these tools to inspect SQL databases.

## Configuration

```json
{
  "mcpServers": {
    "dbcanvas": {
      "command": "node",
      "args": ["/path/to/packages/mcp-server/build/index.js"]
    }
  }
}
```

Config file locations per IDE:
- **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Code:** `~/.claude/claude_desktop_config.json`
- **Cursor:** `~/.cursor/mcp.json`
- **Windsurf:** `~/.windsurf/mcp.json`
- **Antigravity:** `~/.antigravity/mcp.json`
- **VS Code:** `~/.vscode/mcp.json`
- **Codex:** `~/.codex/mcp.json`

## Tools

### Connection & Config

| Tool | Description | Inputs |
|------|-------------|--------|
| `test_connection` | Validate database connectivity | `projectPath?` |
| `get_effective_config` | Show which config file is being used and its source | `projectPath?` |

### Schema Inspection

| Tool | Description | Inputs |
|------|-------------|--------|
| `get_table_schema` | Get columns, types, constraints for a table. Creates shadow structure in discovery DB | `tableName`, `projectPath?` |
| `get_sp_definition` | Fetch stored procedure source code. Auto-saves as .md in project | `spName`, `projectPath?` |
| `find_object` | Search tables/SPs/views by name pattern across databases | `pattern`, `projectPath?` |

### Data & Queries

| Tool | Description | Inputs |
|------|-------------|--------|
| `query_data` | Execute read-only SELECT queries. Blocks dangerous SQL (INSERT, UPDATE, DELETE, DROP, EXEC, xp_, sp_, DBCC) | `sql`, `projectPath?` |

### Discovery Graph

| Tool | Description | Inputs |
|------|-------------|--------|
| `sync_discovery` | Full schema sync — discovers all tables, SPs, views, FKs, SP dependencies. Stores in local SQLite | `projectPath?` |
| `get_discovery_graph` | Return nodes (TABLE/PROCEDURE/VIEW) and links (FK/USAGE) with pagination | `offset?`, `limit?`, `projectPath?` |
| `list_projects` | List all registered solution/project roots | — |

### Advanced Analysis

| Tool | Description | Inputs |
|------|-------------|--------|
| `explore_and_anchor_sp` | Deep SP exploration: reads source, extracts table references, captures dependency graph | `spName`, `projectPath?` |
| `trace_lineage` | Trace field-level data flow across SPs and tables (READS/WRITES/TRANSFORMS) | `fieldName`, `tableName`, `projectPath?` |
| `sp_diff` | Compare current remote SP code with last locally saved version (line-by-line diff) | `spName`, `projectPath?` |

### AI Annotations

| Tool | Description | Inputs |
|------|-------------|--------|
| `annotate` | Save an AI-generated explanation for a database object | `objectName`, `objectType`, `annotation`, `projectPath?` |
| `get_annotation` | Retrieve a cached AI explanation for a database object | `objectName`, `projectPath?` |

## Security

All tools enforce:
- **SQL injection protection**: identifier whitelist, dangerous pattern blocking
- **Read-only**: no data modification queries allowed
- **Input validation**: Zod schemas on every tool input
- **Query timeout**: 30 seconds max
- **Password masking**: credentials never appear in logs or responses

## Config Discovery

The MCP server auto-discovers database connection strings by walking the directory tree upward from the project root, looking for:
1. `.env` files (DATABASE_URL, DB_HOST, etc.)
2. `web.config` (XML connectionStrings)
3. `appsettings.json` / `appsettings.Development.json`

No need to hardcode credentials — just run in a project directory that has one of these files.
