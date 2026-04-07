#!/usr/bin/env node

// CRITICAL: MCP uses stdout for JSON-RPC. Redirect ALL console output to stderr.
// This catches any library (knex, tedious, etc.) that calls console.log.
const _origLog = console.log;
const _origWarn = console.warn;
const _origInfo = console.info;
console.log = (...args: any[]) => console.error('[stdout-redirect]', ...args);
console.warn = (...args: any[]) => console.error('[warn]', ...args);
console.info = (...args: any[]) => console.error('[info]', ...args);

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { z, ZodError } from "zod";
import * as schemas from "./schemas.js";
import {
  findObjectAcrossDatabases, getProcedureCode, getTableColumns,
  getProcedureDependencies, executeSafeRead,
  testConnection, createDbClient,
  discoverConnectionString, getRegisteredProjects,
  syncDiscovery, getDiscoveryGraph, discoverObject, captureShadowData,
  closeAllLocalDbs, traceFieldLineage,
  saveAnnotation, getAnnotation,
  captureSpData, simulateSp, compareResults, getLatestCapture,
  generateAgentPrompt, listAgents,
} from "@dbcanvas/core";
import type { DbClient } from "@dbcanvas/core";
import * as http from "http";

function sanitizeFilename(name: string): string {
  return name.replace(/[\[\]]/g, '').replace(/[\/\:\. ]/g, '_');
}

function notifyDashboard(type: string, name: string, retryCount = 0) {
  try {
    const data = JSON.stringify({ type, name });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/notify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 2000
    });
    req.on('error', (e) => {
      if (retryCount < 2) {
        setTimeout(() => notifyDashboard(type, name, retryCount + 1), 1000);
      }
    });
    req.write(data);
    req.end();
  } catch (e) { }
}

// Connection pool with TTL-based cleanup
const POOL_TTL_MS = 10 * 60 * 1000; // 10 minutes
const dbClients: Map<string, { client: DbClient; lastUsed: number }> = new Map();
const PLACEHOLDERS = ['tu_cadena_de_conexion_aqui', 'YOUR_CONNECTION_STRING', 'CHANGE_ME', 'placeholder'];

// Cleanup stale connections every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of dbClients.entries()) {
    if (now - entry.lastUsed > POOL_TTL_MS) {
      entry.client.destroy().catch(() => { });
      dbClients.delete(key);
      console.error(`Pool cleanup: closed stale connection for ${key.substring(0, 30)}...`);
    }
  }
}, 5 * 60 * 1000).unref();

function getActiveContext(projectPathOverride?: string) {
  // Resolve search path: explicit arg > cwd > script directory
  let searchPath = projectPathOverride || process.cwd();

  // If cwd is root or home, fall back to the directory where this script lives
  // (which is inside the DBCanvas project, and findSolutionRoot will walk up to the .sln)
  if (searchPath === '/' || searchPath === process.env.HOME) {
    searchPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  }

  const currentConfig = discoverConnectionString(searchPath);
  const rawEnvDbUrl = process.env.DATABASE_URL;
  const isPlaceholder = rawEnvDbUrl && PLACEHOLDERS.some(p => rawEnvDbUrl.includes(p));
  const envDbUrl = (rawEnvDbUrl && !isPlaceholder) ? rawEnvDbUrl : null;

  const activeUrl = process.argv.find(arg => arg.startsWith('--db-url='))?.split('=')[1] ||
    envDbUrl ||
    currentConfig?.connectionString ||
    null;

  return {
    activeUrl,
    config: currentConfig,
    projectRoot: currentConfig?.solutionRoot || searchPath
  };
}


// Helper to mask passwords in connection strings
function maskPassword(url: string): string {
  try {
    if (url.includes(':') && url.includes('@')) {
      const parts = url.match(/([^:]+:\/\/)([^:]+):([^@]+)(@.+)/);
      if (parts) return `${parts[1]}${parts[2]}:****${parts[4]}`;
    }
    // MSSQL style
    return url.replace(/Password=[^;]+(;|$)/i, 'Password=****$1').replace(/Pwd=[^;]+(;|$)/i, 'Pwd=****$1');
  } catch (e) {
    return 'URL_MASKED';
  }
}

// Auto-reload removed in favor of dynamic every-call discovery to support switching projects in same session


async function getClient(url?: string, projectPath?: string): Promise<DbClient> {
  const context = getActiveContext(projectPath);
  const targetUrl = url || context.activeUrl;
  if (!targetUrl) throw new Error("No database URL provided or discovered. Ensure you have a .env or web.config in the project path: " + (projectPath || process.cwd()));

  const existing = dbClients.get(targetUrl);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.client;
  }

  const client = await createDbClient(targetUrl);
  dbClients.set(targetUrl, { client, lastUsed: Date.now() });
  return client;
}

/** Shared logic: fetch SP code, save .md, register in discovery graph */
async function anchorProcedure(db: DbClient, spName: string, projectRoot: string): Promise<string> {
  const definition = await getProcedureCode(db, spName);

  // Save local .md copy
  try {
    const procDir = path.join(projectRoot, '.dbcanvas', 'procedures');
    if (!fs.existsSync(procDir)) fs.mkdirSync(procDir, { recursive: true });
    const mdContent = `# ${spName}\n\n\`\`\`sql\n${definition}\n\`\`\``;
    fs.writeFileSync(path.join(procDir, `${sanitizeFilename(spName)}.md`), mdContent);
  } catch (e) {
    console.error("Failed to save local MD copy:", e);
  }

  // Register in discovery graph
  await discoverObject(db, spName, 'PROCEDURE', projectRoot).catch((err) => {
    console.error(`Failed to discover object ${spName}:`, err);
  });

  return definition;
}

const server = new Server(
  {
    name: "sql-mcp-agent",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_sp_definition",
        description: "Get the SQL source code of a stored procedure. This tool AUTOMATICALLY saves a local .md copy and syncs its dependencies to the local discovery.db for the dashboard.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the stored procedure" },
            dbUrl: { type: "string", description: "Optional: Specific connection string for this call" },
            projectPath: { type: "string", description: "Optional: Root path of the project to ensure local .dbcanvas anchoring" },
          },
          required: ["name"],
        },
      },
      {
        name: "get_table_schema",
        description: "Get the schema/columns of a table",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the table" },
            dbUrl: { type: "string", description: "Optional: Specific connection string for this call" },
            projectPath: { type: "string", description: "Optional: Root path of the project to ensure local .dbcanvas anchoring" },
          },
          required: ["name"],
        },
      },
      {
        name: "query_data",
        description: "Execute a SELECT query to inspect data (max 10 rows)",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string", description: "The SELECT statement to run" },
            dbUrl: { type: "string", description: "Optional: Specific connection string for this call" },
            projectPath: { type: "string", description: "Optional: Root path of the project to ensure local .dbcanvas anchoring" },
          },
          required: ["sql"],
        },
      },
      {
        name: "test_connection",
        description: "Test a database connection and get detailed diagnostic feedback",
        inputSchema: {
          type: "object",
          properties: {
            dbUrl: { type: "string", description: "The connection string to test. If empty, tests the default active connection." },
            projectPath: { type: "string", description: "Optional: Root path of the project to ensure local .dbcanvas anchoring" },
          }
        }
      },
      {
        name: "get_effective_config",
        description: "View the current active configuration source and masked connection string",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string", description: "Optional: Root path of the project" }
          }
        }
      },
      {
        name: "find_object",
        description: "Search for a table or stored procedure by name across all accessible databases/catalogs",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Partial or full name of the object to search for" },
            projectPath: { type: "string", description: "Optional: Root path of the project" },
          },
          required: ["name"]
        }
      },
      {
        name: "sync_discovery",
        description: "Synchronize database structure (tables, FKs, SP dependencies) to local discovery.db",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string", description: "Optional: Root path of the project" }
          }
        }
      },
      {
        name: "get_discovery_graph",
        description: "Retrieve the local discovery graph (nodes and links) for visualization",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string", description: "Optional: Root path of the project" }
          }
        }
      },
      {
        name: "explore_and_anchor_sp",
        description: "Automatically download a Stored Procedure, extract its schema relationships, and download a sample of data (shadowing) for its dependencies. This tool AUTOMATICALLY saves a local .md copy to the solution root.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the stored procedure to anchor" },
            params: { type: "object", description: "Optional: Parameters passed to the SP in the code to help filter shadow data", additionalProperties: true },
            limit: { type: "number", description: "Optional: Override row limit for shadow data capture. Use if the default limit warns about excess data." },
            projectPath: { type: "string", description: "Optional: Root path of the project to ensure local .dbcanvas anchoring" }
          },
          required: ["name"]
        }
      },
      {
        name: "list_projects",
        description: "List all known solution roots currently registered in Nexus DB",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "trace_lineage",
        description: "Trace the data lineage of a specific field across stored procedures and tables. Shows which SPs read/write the field and how data flows.",
        inputSchema: {
          type: "object",
          properties: {
            field: { type: "string", description: "Name of the field/column to trace" },
            table: { type: "string", description: "Optional: Specific table to focus the lineage on" },
            projectPath: { type: "string", description: "Optional: Root path of the project" },
          },
          required: ["field"]
        }
      },
      {
        name: "sp_diff",
        description: "Compare current stored procedure code with the last locally saved version to detect changes",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the stored procedure" },
            projectPath: { type: "string", description: "Optional: Root path of the project" },
          },
          required: ["name"]
        }
      },
      {
        name: "annotate",
        description: "Save an AI-generated explanation/annotation for a database object (SP, table, view). Use this after analyzing an object to cache your explanation for future reference.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the object" },
            type: { type: "string", enum: ["PROCEDURE", "TABLE", "VIEW"], description: "Type of the object" },
            summary: { type: "string", description: "One-line summary of what the object does" },
            details: { type: "string", description: "Detailed explanation" },
            projectPath: { type: "string", description: "Optional: Root path of the project" },
          },
          required: ["name", "summary"]
        }
      },
      {
        name: "get_annotation",
        description: "Retrieve a previously saved AI annotation for a database object",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the object" },
            type: { type: "string", enum: ["PROCEDURE", "TABLE", "VIEW"], description: "Type of the object" },
            projectPath: { type: "string", description: "Optional: Root path of the project" },
          },
          required: ["name"]
        }
      },
      {
        name: "capture_sp_data",
        description: "CAPTURE MODE: Execute a stored procedure's SELECT queries with given parameters against the REAL database and store the results locally. This creates a snapshot of the data the SP would work with, enabling offline simulation. Run this BEFORE editing an SP.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the stored procedure" },
            params: { type: "object", description: "Parameters the SP receives (e.g. {\"@id_pedido\": 12345, \"@cod_usuario\": \"admin\"})", additionalProperties: true },
            projectPath: { type: "string", description: "Optional: Root path of the project" },
          },
          required: ["name", "params"]
        }
      },
      {
        name: "simulate_sp",
        description: "SIMULATE MODE: Run MODIFIED stored procedure code against LOCALLY captured data (from capture_sp_data). Returns what the modified SP would produce WITHOUT touching the real database. Use this to validate SP edits before deploying.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Original SP name (to find the captured data)" },
            modifiedCode: { type: "string", description: "The full modified SP code to simulate" },
            params: { type: "object", description: "Optional: Override parameters", additionalProperties: true },
            projectPath: { type: "string", description: "Optional: Root path of the project" },
          },
          required: ["name", "modifiedCode"]
        }
      },
      {
        name: "get_capture",
        description: "Retrieve the latest captured data snapshot for a stored procedure. Shows what data was captured and when.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the stored procedure" },
            projectPath: { type: "string", description: "Optional: Root path of the project" },
          },
          required: ["name"]
        }
      },
      {
        name: "analyze",
        description: "Analyze a stored procedure or table from a specific role perspective: tech_lead (SQL optimization, code quality), architect (scalability, security), analyst (business rules, edge cases), or product_owner (business value, user impact). Returns a structured analysis prompt.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the SP or table" },
            perspective: { type: "string", enum: ["tech_lead", "architect", "analyst", "product_owner"], description: "Role perspective for the analysis" },
            projectPath: { type: "string", description: "Optional: Root path of the project" },
          },
          required: ["name"]
        }
      }
    ],
  };
});

function parseArgs<T>(schema: z.ZodType<T>, raw: Record<string, unknown>): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = (result as any).error?.issues || [];
    const msg = issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid arguments: ${msg}`);
  }
  return result.data;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolArgs = (request.params.arguments || {}) as Record<string, unknown>;

  // License check
  const { validateToolAccess } = await import('./license.js');
  const license = await validateToolAccess(request.params.name);
  if (!license.toolAllowed) {
    return {
      content: [{
        type: "text",
        text: `This tool requires a ${license.requiredTier?.toUpperCase() || 'PRO'} license. Current tier: ${license.tier.toUpperCase()}.\n\nUpgrade at: http://localhost:4000/pricing\nOr set DBCANVAS_LICENSE_KEY in your MCP config env.`,
      }],
      isError: true,
    };
  }
  const toolName = request.params.name;

  try {
    switch (toolName) {
      case "get_effective_config": {
        const args = parseArgs(schemas.EffectiveConfigArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              active_source: context.config?.source || 'Environment/CLI',
              config_file: context.config?.filePath || 'None',
              last_modified: context.config?.lastModified,
              effective_db_url: context.activeUrl ? maskPassword(context.activeUrl) : 'None',
              automatic_discovery: !!context.config
            }, null, 2)
          }]
        };
      }

      case "test_connection": {
        const args = parseArgs(schemas.TestConnectionArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const urlToTest = args.dbUrl || context.activeUrl;
        if (!urlToTest) return { content: [{ type: "text", text: "No connection string provided or active." }], isError: true };
        const result = await testConnection(urlToTest);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "find_object": {
        const args = parseArgs(schemas.FindObjectArgs, toolArgs);
        const db = await getClient(undefined, args.projectPath);
        const results = await findObjectAcrossDatabases(db, args.name);
        return { content: [{ type: "text", text: results.length > 0 ? JSON.stringify(results, null, 2) : "No objects found matching that name across databases." }] };
      }

      case "sync_discovery": {
        const args = parseArgs(schemas.SyncDiscoveryArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const db = await getClient(undefined, args.projectPath);
        const result = await syncDiscovery(db, context.projectRoot);
        return { content: [{ type: "text", text: `Sync complete: Created ${result.nodes} nodes and ${result.edges} edges in discovery.db.` }] };
      }

      case "get_discovery_graph": {
        const args = parseArgs(schemas.GetGraphArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const graph = await getDiscoveryGraph(context.projectRoot);
        return { content: [{ type: "text", text: JSON.stringify(graph, null, 2) }] };
      }

      case "get_sp_definition": {
        const args = parseArgs(schemas.SpDefinitionArgs, toolArgs);
        notifyDashboard('PROCEDURE', args.name);
        const context = getActiveContext(args.projectPath);
        const db = await getClient(args.dbUrl, args.projectPath);
        const definition = await anchorProcedure(db, args.name, context.projectRoot);
        return { content: [{ type: "text", text: `Stored Procedure ${args.name} retrieved and anchored locally in ${context.projectRoot}.\n\nDefinition:\n${definition}` }] };
      }

      case "list_projects": {
        const projects = getRegisteredProjects();
        return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
      }

      case "get_table_schema": {
        const args = parseArgs(schemas.TableSchemaArgs, toolArgs);
        notifyDashboard('TABLE', args.name);
        const context = getActiveContext(args.projectPath);
        const db = await getClient(args.dbUrl, args.projectPath);
        const columns = await getTableColumns(db, args.name);
        await discoverObject(db, args.name, 'TABLE', context.projectRoot).catch((err) => {
          console.error(`Failed to discover table ${args.name}:`, err);
        });
        return { content: [{ type: "text", text: JSON.stringify(columns, null, 2) }] };
      }

      case "query_data": {
        const args = parseArgs(schemas.QueryDataArgs, toolArgs);
        const db = await getClient(args.dbUrl, args.projectPath);
        const result = await executeSafeRead(db, args.sql);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "explore_and_anchor_sp": {
        const args = parseArgs(schemas.ExploreSpArgs, toolArgs);
        notifyDashboard('PROCEDURE', args.name);
        const context = getActiveContext(args.projectPath);
        const db = await getClient(undefined, args.projectPath);

        // 1. Anchor (get code + save md + discover)
        const definition = await anchorProcedure(db, args.name, context.projectRoot);

        // 2. Populate shadow data based on dependencies
        let shadowReport = "";
        const childSps: string[] = [];
        try {
          const deps = await getProcedureDependencies(db, args.name);
          for (const dep of deps) {
            if (dep.referenced_type === 'SQL_STORED_PROCEDURE' || dep.referenced_type === 'P') {
              childSps.push(dep.referenced_name);
              continue;
            }
            try {
              const rows = await captureShadowData(db, dep.referenced_name, args.params || {}, args.limit, context.projectRoot);
              shadowReport += `- Captured ${rows} shadow rows for ${dep.referenced_name}\n`;
            } catch (err: any) {
              shadowReport += `- ${err.message?.includes('LIMIT_REQUIRED') ? 'LIMIT_REQUIRED' : 'Warning'}: ${dep.referenced_name} - ${err.message}\n`;
            }
          }
        } catch (e) {
          shadowReport += `Warning: Failed to process dependencies - ${e}\n`;
        }

        let warningMsg = "";
        if (childSps.length > 0) {
          warningMsg = `\nSub-SPs detected: [${childSps.join(', ')}]. Run explore_and_anchor_sp on each if needed.\n`;
        }

        return { content: [{ type: "text", text: `Anchored ${args.name} in ${context.projectRoot}.\n\nSource Code:\n${definition}\n\nData Shadowing:\n${shadowReport}${warningMsg}` }] };
      }

      case "trace_lineage": {
        const args = parseArgs(schemas.TraceLineageArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const db = await getClient(undefined, args.projectPath);
        const lineage = await traceFieldLineage(db, args.field, args.table, context.projectRoot);
        const summary = lineage.nodes.length > 0
          ? `Found ${lineage.nodes.length} nodes and ${lineage.edges.length} relationships for field "${args.field}".`
          : `No lineage found for field "${args.field}". The field may not be referenced in any discovered stored procedures.`;
        return { content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(lineage, null, 2)}` }] };
      }

      case "sp_diff": {
        const args = parseArgs(schemas.SpDiffArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const db = await getClient(undefined, args.projectPath);

        // Get current remote code
        const currentCode = await getProcedureCode(db, args.name);

        // Get locally saved version
        const localPath = path.join(context.projectRoot, '.dbcanvas', 'procedures', `${sanitizeFilename(args.name)}.md`);
        let localCode = '';
        if (fs.existsSync(localPath)) {
          const md = fs.readFileSync(localPath, 'utf8');
          // Extract SQL from markdown code block
          const match = md.match(/```sql\n([\s\S]*?)```/);
          localCode = match ? match[1].trim() : '';
        }

        if (!localCode) {
          // Save current as baseline
          await anchorProcedure(db, args.name, context.projectRoot);
          return { content: [{ type: "text", text: `No previous version found for ${args.name}. Current version has been saved as baseline.` }] };
        }

        const hasChanges = currentCode.trim() !== localCode.trim();
        if (!hasChanges) {
          return { content: [{ type: "text", text: `No changes detected in ${args.name}. Local and remote versions match.` }] };
        }

        // Simple line-by-line diff
        const localLines = localCode.split('\n');
        const currentLines = currentCode.split('\n');
        const diff: string[] = [];
        const maxLines = Math.max(localLines.length, currentLines.length);

        for (let i = 0; i < maxLines; i++) {
          const local = localLines[i] || '';
          const current = currentLines[i] || '';
          if (local !== current) {
            if (local) diff.push(`- ${local}`);
            if (current) diff.push(`+ ${current}`);
          }
        }

        // Update local copy with current version
        await anchorProcedure(db, args.name, context.projectRoot);

        return { content: [{ type: "text", text: `Changes detected in ${args.name}!\n\nDiff (${diff.length} lines changed):\n\`\`\`diff\n${diff.slice(0, 100).join('\n')}\n\`\`\`\n\nLocal copy updated to current version.` }] };
      }

      case "annotate": {
        const args = parseArgs(schemas.AnnotateArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const prefix = args.type === 'TABLE' ? 'table' : args.type === 'VIEW' ? 'view' : 'sp';
        const objectId = `${prefix}:${args.name}`;
        await saveAnnotation(objectId, args.name, args.type, args.summary, args.details || '', context.projectRoot);
        return { content: [{ type: "text", text: `Annotation saved for ${args.name} (${args.type}).` }] };
      }

      case "get_annotation": {
        const args = parseArgs(schemas.GetAnnotationArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const prefix = args.type === 'TABLE' ? 'table' : args.type === 'VIEW' ? 'view' : 'sp';
        const objectId = `${prefix}:${args.name}`;
        const annotation = await getAnnotation(objectId, context.projectRoot);
        if (!annotation) {
          return { content: [{ type: "text", text: `No annotation found for ${args.name}. Use the 'annotate' tool to save one.` }] };
        }
        return { content: [{ type: "text", text: `## ${annotation.objectName} (${annotation.objectType})\n\n**Summary:** ${annotation.summary}\n\n${annotation.details}\n\n_Last updated: ${annotation.updatedAt}_` }] };
      }

      case "analyze": {
        const args = parseArgs(schemas.AnalyzeArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const db = await getClient(undefined, args.projectPath);

        // Get the object content
        const code = await getProcedureCode(db, args.name);
        const issp = code && code !== 'Not found';
        const content = issp ? code : JSON.stringify(await getTableColumns(db, args.name), null, 2);
        const objectType = issp ? 'PROCEDURE' : 'TABLE';

        if (!args.perspective) {
          // Return all 4 perspectives
          const agents = listAgents();
          const analyses = agents.map(a => {
            const prompt = generateAgentPrompt(a.id, args.name, objectType, content);
            return `### ${a.name} (${a.role})\n${prompt}`;
          });
          return { content: [{ type: "text", text: `# Multi-Perspective Analysis: ${args.name}\n\n${analyses.join('\n\n---\n\n')}` }] };
        }

        const prompt = generateAgentPrompt(args.perspective, args.name, objectType, content);
        if (!prompt) {
          return { content: [{ type: "text", text: `Unknown perspective: ${args.perspective}. Available: tech_lead, architect, analyst, product_owner` }] };
        }
        return { content: [{ type: "text", text: prompt }] };
      }

      case "capture_sp_data": {
        const args = parseArgs(schemas.CaptureSpDataArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const db = await getClient(undefined, args.projectPath);
        const result = await captureSpData(db, args.name, args.params, context.projectRoot);

        const tableSummary = result.tables.map(t =>
          `  ${t.name}: ${t.rowCount} rows${t.filterApplied ? ` (filtered: ${t.filterApplied})` : ' (all rows, no filter)'}`
        ).join('\n');

        const paramsSummary = result.allParams.map(p =>
          `  ${p.name} (${p.type}): ${p.provided ? `= ${p.value}` : 'NOT PROVIDED'}`
        ).join('\n');

        const warningsText = result.warnings.length > 0
          ? `\n\nWarnings:\n${result.warnings.map(w => `  - ${w}`).join('\n')}`
          : '';

        return { content: [{ type: "text", text: `## Capture Complete: ${args.name}\n\nCaptured **${result.totalRows} rows** from **${result.tables.length} tables**.\n\n### SP Parameters:\n${paramsSummary}\n\n### Tables Captured:\n${tableSummary}${warningsText}\n\nYou can now edit the SP and use \`simulate_sp\` to test changes against this data.` }] };
      }

      case "simulate_sp": {
        const args = parseArgs(schemas.SimulateSpArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const simResult = await simulateSp(args.modifiedCode, args.name, args.params || {}, context.projectRoot);
        const comparison = await compareResults(args.name, simResult, context.projectRoot);

        const queryDetails = simResult.queries.map(q =>
          `  Q${q.index}: ${q.rowCount} rows${q.error ? ` (ERROR: ${q.error})` : ''}\n    ${q.sql.substring(0, 120)}...`
        ).join('\n');

        return { content: [{ type: "text", text: `## Simulation: ${args.name}\n\n**Status:** ${simResult.success ? 'OK' : 'ERRORS DETECTED'}\n\n### Queries:\n${queryDetails}\n\n### Comparison vs Original:\n${comparison.summary}\n\n${JSON.stringify(comparison.differences, null, 2)}` }] };
      }

      case "get_capture": {
        const args = parseArgs(schemas.GetCaptureArgs, toolArgs);
        const context = getActiveContext(args.projectPath);
        const capture = await getLatestCapture(args.name, context.projectRoot);
        if (!capture) {
          return { content: [{ type: "text", text: `No captured data for '${args.name}'. Use capture_sp_data first with the parameters you want to test.` }] };
        }
        const tableSummary = capture.tables.map(t =>
          `  ${t.name}: ${t.rowCount} rows [${t.columns.slice(0, 5).join(', ')}${t.columns.length > 5 ? '...' : ''}]`
        ).join('\n');
        const warningsText = capture.missingParams.length > 0
          ? `\nMissing params: ${capture.missingParams.join(', ')}`
          : '';
        return { content: [{ type: "text", text: `## Capture: ${args.name}\n\nCaptured: ${capture.capturedAt}\nParams: ${JSON.stringify(capture.inputParams)}\nTotal rows: ${capture.totalRows}${warningsText}\n\n### Tables:\n${tableSummary}\n\n### Sample (${capture.tables[0]?.name}):\n${JSON.stringify(capture.tables[0]?.sampleRows || [], null, 2)}` }] };
      }

      default:
        throw new Error("Unknown tool");
    }
  } catch (err: any) {
    const context = getActiveContext(toolArgs.projectPath as string | undefined);
    const configInfo = `\n\n[Diagnostic Info]\nProject Path: ${context.projectRoot}\nConfig Source: ${context.config?.source || 'Default'}\nLast Modified: ${context.config?.lastModified?.toLocaleString() || 'Unknown'}`;
    const timestamp = new Date().toLocaleString();
    return {
      content: [{ type: "text", text: `Error executing ${toolName} at ${timestamp}: ${err.message}${configInfo}` }],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SQL MCP Agent v1.1.0 running on stdio");

  const context = getActiveContext();
  if (context.activeUrl) {
    console.error(`Configured with: ${maskPassword(context.activeUrl)}`);
    console.error(`Source: ${context.config?.source || 'Environment'}`);
  } else {
    console.error("No database connection configured. Please provide one via --db-url, DATABASE_URL, .env or web.config.");
  }
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

// Graceful shutdown
async function cleanup() {
  console.error('Shutting down MCP server...');
  for (const entry of dbClients.values()) {
    try { await entry.client.destroy(); } catch { }
  }
  dbClients.clear();
  await closeAllLocalDbs();
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
