import {build} from 'esbuild';
await build({entryPoints:['apps/worker/src/index.ts'],bundle:true,format:'esm',platform:'browser',outfile:'dist/server/index.js',minify:true});
