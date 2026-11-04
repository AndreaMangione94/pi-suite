// Verifica sintattica dei file TypeScript: node --check non la esegue sui moduli .ts.
import {stripTypeScriptTypes} from 'node:module';import fs from 'node:fs';
let failed=false;
for(const file of process.argv.slice(2)){try{stripTypeScriptTypes(fs.readFileSync(file,'utf8'));console.log('OK',file);}catch(error){failed=true;console.log('ERRORE',file,error.message.split('\n')[0]);}}
process.exit(failed?1:0);
