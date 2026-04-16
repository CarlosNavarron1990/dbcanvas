import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'build/bundle.cjs',
  define: {
    // In CJS bundles, import.meta.url is undefined. Replace it with a CommonJS equivalent.
    'import.meta.url': '__filename_url__',
  },
  banner: {
    // Define the replacement variable at the top of the bundle
    js: `var __filename_url__ = require('url').pathToFileURL(__filename).href;`,
  },
  external: [
    // Native modules — compiled .node binaries, cannot be bundled by esbuild
    'sqlite3',
    'better-sqlite3',
    'tedious',
    'pg-native',
    'mysql',
    'mysql2',
    'oracledb',
    'pg-query-stream',
  ],
});

console.log('Bundled MCP server -> build/bundle.cjs');
