import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'build/bundle.mjs',
  external: [
    'sqlite3',
    'better-sqlite3',
    'tedious',
    'pg-native',
    'mysql',
    'mysql2',
    'oracledb',
    'pg-query-stream',
  ],
  banner: {
    js: `
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname } from "path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`.trim(),
  },
});

console.log('Bundled MCP server -> build/bundle.mjs');
