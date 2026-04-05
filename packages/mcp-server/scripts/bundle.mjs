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
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});

console.log('Bundled MCP server -> build/bundle.mjs');
