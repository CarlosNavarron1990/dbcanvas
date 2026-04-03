#!/usr/bin/env node
// Redirect: backwards compatibility with IDE configs pointing to build/index.js
// Real MCP server: packages/mcp-server/build/index.js
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
await import(join(__dirname, '..', 'packages', 'mcp-server', 'build', 'index.js'));
