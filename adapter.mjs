// Pi SDK 1.0.0; bounded model capability checks. Never logs credentials.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import './byok-network.mjs';
import {createAgentSession, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager} from '@earendil-works/pi-coding-agent';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
const dir = job.agentDir || process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
const runtime = await ModelRuntime.create({authPath:path.join(dir,'auth.json'), modelsPath:job.builtin?null:path.join(dir,'models.json'), allowModelNetwork:false,refreshOnCreate:false});
if(runtime.getError())throw Error('Configurazione modelli Pi non valida');
if(job.validate){console.log(JSON.stringify({valid:true}));process.exit(0);}
if (job.list) {
  console.log(JSON.stringify(runtime.getModels().map(m=>({provider:m.provider,model:m.id,name:m.name,reasoning:m.reasoning,input:m.input,api:m.api,contextWindow:m.contextWindow,maxTokens:m.maxTokens,
    ...(job.builtin?{definition:Object.fromEntries(['id','name','api','baseUrl','reasoning','input','contextWindow','maxTokens','cost','compat','thinkingLevelMap'].filter(k=>m[k]!==undefined).map(k=>[k,m[k]]))}:{})})),null,2));
  process.exit(0);
}
const model = runtime.getModel(job.provider, job.model);
if (!model) throw Error('Modello non trovato nella configurazione Pi: '+job.provider+'/'+job.model);
if (job.keyEnv && process.env[job.keyEnv]) await runtime.setRuntimeApiKey(job.provider,process.env[job.keyEnv]);
const payloads = [];
const stream = runtime.streamSimple.bind(runtime);
runtime.streamSimple = (m, context, options={}) => {
  if (m.provider !== job.provider || m.id !== job.model) throw Error('Cambio di modello vietato');
  return stream(m, context, {...options, onPayload:async(payload,...rest)=>{
    const previous = await options.onPayload?.(payload,...rest);
    const p = previous ?? payload;
    // Explicit compatibility mode for endpoints using chat template options.
    if (job.transport === 'template-api') {
      if (model.api !== 'openai-completions') throw Error('template-api richiede API openai-completions');
      p.reasoning_effort = job.effort;
      p.chat_template_kwargs = {...p.chat_template_kwargs, enable_thinking:true, preserve_thinking:true};
      delete p.chat_template_kwargs.reasoning_effort;
    }
    const sent = p.chat_template_kwargs?.reasoning_effort ?? p.reasoning_effort ?? p.reasoning?.effort;
    payloads.push({requested:job.effort, sent:sent ?? null, transport:job.transport, model:p.model ?? m.id});
    if (job.transport !== 'auto' && sent !== job.effort) throw Error('Effort non trasmesso come richiesto: '+JSON.stringify(payloads.at(-1)));
    return p;
  }});
};
const customTools = [];
let probeToolCalled=false;
if(job.probe) customTools.push({name:'capability_check',label:'Verifica connessione',description:'Call this tool with value OK to verify tool calling.',
  parameters:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false},
  execute:async(_id,args)=>{probeToolCalled=args.value===(job.probeNonce||'OK');return {content:[{type:'text',text:probeToolCalled?'CHECK_COMPLETE':'CHECK_FAILED'}],details:{ok:probeToolCalled}};}
});
const loader={
  getExtensions:()=>({extensions:[],errors:[],runtime:createExtensionRuntime()}),
  getSkills:()=>({skills:[],diagnostics:[]}),getPrompts:()=>({prompts:[],diagnostics:[]}),getThemes:()=>({themes:[],diagnostics:[]}),
  getAgentsFiles:()=>({agentsFiles:[]}),getSystemPrompt:()=> 'Verifica il ciclo strumenti del modello: esegui capability_check con il valore richiesto, leggi il risultato e rispondi CHECK_COMPLETE.',
  getSystemPromptSource:()=>undefined,getAppendSystemPrompt:()=>[],getAppendSystemPromptSources:()=>[],extendResources:()=>{},reload:async()=>{}
};
let session, timer, turns=0, failure;
const start=Date.now();
try {
  ({session}=await createAgentSession({cwd:job.cwd,agentDir:dir,modelRuntime:runtime,model,thinkingLevel:job.transport==='auto'&&!model.reasoning?'off':job.effort,
    tools:customTools.map(t=>t.name),customTools,resourceLoader:loader,sessionManager:SessionManager.inMemory(job.cwd),
    settingsManager:SettingsManager.inMemory({compaction:{enabled:false},retry:{enabled:false}})}));
  if (job.transport==='native' && session.thinkingLevel!==job.effort) throw Error(`Pi riduce ${job.effort} a ${session.thinkingLevel}; verificare i metadati del modello o il trasporto template-api`);
  timer=setTimeout(()=>{failure='Timeout della sessione';void session.abort();},job.timeoutSeconds*1000);
  session.subscribe(event=>{if(event.type==='turn_start' && ++turns>job.maxTurns){failure='Limite turni';void session.abort();}});
  await session.prompt(job.prompt);
  const messages=session.messages.filter(m=>m.role==='assistant');
  if (!messages.length || messages.some(m=>['error','aborted','length'].includes(m.stopReason))) throw Error(messages.at(-1)?.errorMessage || 'Risposta interrotta o incompleta');
  if (failure) throw Error(failure);
  if (!payloads.length) throw Error('Nessuna richiesta verificata');
  for(const m of messages) if(m.provider!==job.provider || m.model!==job.model) throw Error('Identità del modello diversa da quella configurata');
  if(job.probe&&(!probeToolCalled||messages.length<2))throw Error('Ciclo strumenti non verificato: manca chiamata valida o risposta dopo il risultato');
  if(job.probe&&job.effort!=='off'&&payloads.some(p=>p.sent==null))throw Error('Livello reasoning non trasmesso: serve un preset compatibile con questo endpoint');
  console.log(JSON.stringify({text:session.getLastAssistantText(),requested:job.effort,piLevel:session.thinkingLevel,payloads,probeToolCalled,
    seconds:(Date.now()-start)/1000,turns,usage:messages.map(m=>m.usage)}));
} finally {clearTimeout(timer);session?.dispose();}
