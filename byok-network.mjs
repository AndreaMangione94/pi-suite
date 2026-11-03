// Apply transport policy to inference only, leaving unrelated CLI tools unchanged.
// Le chiavi protette non sono nell'ambiente: Pi invia il segnaposto pi-suite-credential:<variabile> e qui la chiave,
// letta una volta per processo con suite_credentials.py, entra solo nelle richieste verso l'origine della connessione.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const PREFIX='pi-suite-credential:',PLACEHOLDER=/pi-suite-credential:(PI_SUITE_KEY_[A-Z0-9_]+)/g;
const INFERENCE=/\/(chat\/completions|responses(?:\/[^/]+)?|messages)\/?$|:(streamGenerateContent|generateContent)$/;
const secrets=new Map(),originalFetch=globalThis.fetch;
let inner=originalFetch;
function credential(name,origin){
  let origins={};try{origins=JSON.parse(process.env.PI_SUITE_CREDENTIAL_ORIGINS||'{}');}catch{}
  if(!origins[name]?.includes(origin))throw Error('Pi Suite: la credenziale '+name+' non può essere inviata a '+origin+' (origini della connessione: '+(origins[name]?.join(', ')||'nessuna')+')');
  if(!secrets.has(name)){
    const python=process.env.PI_SUITE_PYTHON||path.join(root,'.venv','Scripts','python.exe');
    const result=spawnSync(python,['-E','-s',path.join(root,'suite_credentials.py'),name],{encoding:'utf8',windowsHide:true,timeout:15000});
    const value=result.status===0?result.stdout.trim():'';
    if(!value)throw Error('Pi Suite: credenziale '+name+' non disponibile: '+((result.stderr||result.error?.message||'').trim().slice(-300)||'errore sconosciuto'));
    secrets.set(name,value);
  }
  return secrets.get(name);
}
const policyFetch=async(input,init)=>{
  const request=typeof input==='object'&&!(input instanceof URL)?input:null;
  const url=new URL(request?request.url:input);
  const headers=new Headers(init?.headers??request?.headers);
  const placeholders=[...headers].filter(([,value])=>value.includes(PREFIX));
  if(!INFERENCE.test(url.pathname)&&!placeholders.length)return inner(input,init);
  for(const name of ['authorization','api-key','x-api-key','x-goog-api-key'])if(headers.get(name)==='__PI_SUITE_OMIT_HEADER__')headers.delete(name);
  for(const [name,value] of placeholders)headers.set(name,value.replace(PLACEHOLDER,(_match,key)=>credential(key,url.origin)));
  return inner(input,{...init,headers,redirect:'error'});
};
// Pi 1.0 installa all'avvio il proprio undici con globalThis.fetch=...: la proprietà resta questa politica e
// un'assegnazione cambia solo l'implementazione interna; riassegnare la politica ripristina il fetch di Node.
Object.defineProperty(globalThis,'fetch',{configurable:true,enumerable:true,get:()=>policyFetch,set:value=>{inner=value===policyFetch?originalFetch:value;}});
