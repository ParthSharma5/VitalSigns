import { build } from 'esbuild';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import { gzipSync } from 'node:zlib';

const LOADER_BUDGET = 2048;
const CORE_BUDGET = 5120;

const common = {
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019'],
  legalComments: 'none',
  logLevel: 'warning',
};

for (const f of readdirSync('public')) {
  if (/^v1-core\.[\w-]+\.js$/.test(f)) rmSync(`public/${f}`);
}

const core = await build({
  ...common,
  entryPoints: { 'v1-core': 'snippet/core.ts' },
  entryNames: '[name].[hash]',
  outdir: 'public',
  metafile: true,
});
const coreFile = Object.keys(core.metafile.outputs)[0];

await build({
  ...common,
  entryPoints: ['snippet/loader.ts'],
  outfile: 'public/v1.js',
  define: { __CORE_FILE__: JSON.stringify(basename(coreFile)) },
});

let failed = false;
for (const [file, budget] of [['public/v1.js', LOADER_BUDGET], [coreFile, CORE_BUDGET]]) {
  const code = readFileSync(file);
  const gzip = gzipSync(code, { level: 9 }).length;
  const ok = gzip <= budget;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: ${code.length} B raw, ${gzip} B gzip (budget ${budget} B)`);
}
if (failed) process.exit(1);
