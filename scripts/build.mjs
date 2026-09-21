import {build as viteBuild} from 'vite';
import {build} from 'esbuild';
import {cp,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
// Remove only this project's generated build directory.
const output=resolve('dist');if(output!==resolve(import.meta.dirname,'../dist'))throw Error('Build must run from the project directory.');
await rm(output,{recursive:true,force:true});
await viteBuild();
await build({entryPoints:['server/index.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await mkdir('dist/.openai',{recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/.openai/drizzle',{recursive:true});
