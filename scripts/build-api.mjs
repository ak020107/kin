import {build} from 'esbuild';
await build({stdin:{contents:"export {handleRequest as default} from './server/handler.ts'",resolveDir:process.cwd()},outfile:'api/kin.mjs',bundle:true,platform:'node',format:'esm',target:'node22',packages:'external'});
