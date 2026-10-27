import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Type} from '@earendil-works/pi-ai';
import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';
import {registerAgentViaEvents} from 'pi-subagents/agents';
import {registerSubagentCapabilityCeiling} from 'pi-subagents/capability-ceiling';
import {registerRequiredChildExtensions} from 'pi-subagents/required-child-extensions';
import {SUBAGENT_DELEGATION_REQUEST_EVENT as REQUEST,SUBAGENT_DELEGATION_RESPONSE_EVENT as RESPONSE,SUBAGENT_DELEGATION_UPDATE_EVENT as UPDATE,SUBAGENT_DELEGATION_CANCEL_EVENT as CANCEL} from 'pi-subagents/delegation';
import {prepareBatch} from './delegation-core.mjs';

export default function registerDelegation(pi:ExtensionAPI,root:string,home:string,contextSources?:(ctx:any)=>any[],workspace?:(ctx:any)=>string) {
  let registrations:any[]=[],ready=false,used=0;
  let delegated=false,attempted=false,reminded=false;
  const toolNames=['read_source','list_sources','propose_file','graph_query','read_skill','connected_sources','read_connected_source','connected_graph','knowledge_search','knowledge_trace','read_evidence','propose_relation'];
  const launchPath=path.join(process.env.PI_CODING_AGENT_DIR||path.join(home,'pi-shell'),'suite-launch.json');
  let sessionConfig:any;
  const config=()=>structuredClone(sessionConfig);
  const cleanup=()=>{for(const r of registrations)r.dispose();registrations=[];ready=false;};
  pi.on('session_start',async(_event,ctx)=>{
    cleanup();sessionConfig=undefined;used=0;delegated=false;attempted=false;reminded=false;
    if(!fs.existsSync(launchPath))return;
    sessionConfig=JSON.parse(fs.readFileSync(launchPath,'utf8'));
    registrations.push(registerAgentViaEvents({pi,name:'suite-executor',definition:{
      description:'Subagente generale: esegue l’incarico Markdown del genitore, esplora liberamente il progetto e produce una risposta o proposte di file.',
      systemPrompt:'Segui l’incarico Markdown ricevuto. Puoi esplorare il progetto con list_sources/read_source. Usa propose_file solo per i percorsi autorizzati. Se mancano informazioni o serve ampliare il compito, riferiscilo nel risultato. Non hai shell o rete. Non inventare test eseguiti.',
      tools:toolNames,extensions:[path.join(root,'suite-child.ts')],inheritSkills:false,inheritProjectContext:false,inheritGlobalContext:false,
      allowNestedSubagents:false,defaultContext:'fresh',defaultAsync:false}}));
    registrations.push(registerSubagentCapabilityCeiling({sessionId:ctx.sessionManager.getSessionId(),source:'pi-suite',ceiling:{allowedAgents:['suite-executor'],allowedTools:toolNames}}));
    registrations.push(registerRequiredChildExtensions({sessionId:ctx.sessionManager.getSessionId(),extensions:[{id:'suite-contract',path:path.join(root,'suite-child.ts')}],requireForAllRunners:true}));
    ready=true;
  });
  pi.on('session_shutdown',async()=>cleanup());
  pi.on('before_agent_start',async()=>{delegated=false;attempted=false;reminded=false;});
  // A bounded correction catches a model ignoring the delegation instruction.
  // Never retry cancelled/failed runs or spend more calls after a failed child.
  pi.on('agent_before_settle',async(event)=>{
    if(ready&&!sessionConfig?.worker)return;
    if(event.outcome!=='completed'||delegated)return;
    const available=ready&&sessionConfig?.worker?.model&&used<sessionConfig.maxCalls;
    if(!attempted&&!reminded&&available){
      reminded=true;
      return {entries:[{type:'custom_message',customType:'suite-delegation-required',display:true,
        content:'Delega obbligatoria: manca la consegna di un subagente per questa richiesta. Chiama ora delegate_tasks con un unico incarico operativo preciso (oppure più incarichi solo se utili), poi verifica il risultato. Non svolgere di nuovo il lavoro al suo posto.'}],continue:true};
    }
    return {entries:[{type:'custom_message',customType:'suite-delegation-incomplete',display:true,
      content:'Richiesta senza consegna completata da un subagente: il flusso orchestrato non è completato. Controlla configurazione, limite della sessione ed esiti in Attività e risultati. Nessun ulteriore tentativo automatico.'}]};
  });
  pi.on('tool_call',async(event)=>{
    if(ready&&!sessionConfig?.worker&&(event.toolName==='delegate_tasks'||event.toolName==='subagent'&&!['list','status','guide'].includes(String((event.input as any)?.action||''))))
      return {block:true,reason:'Modalità solo orchestratore: nessun modello Subagenti selezionato. Svolgi il lavoro direttamente, senza avviare figli.'};
    if(event.toolName==='subagent'&&!['list','status','guide'].includes(String((event.input as any)?.action||'')))
      return {block:true,reason:'Nella suite assegna gli incarichi tramite delegate_tasks: salva INCARICO.md e applica limiti, modello e perimetro. subagent resta disponibile per list/status/guide.'};
  });
  pi.on('before_agent_start',async(event)=>({systemPrompt:event.systemPrompt+(ready&&!sessionConfig?.worker?'\n\nPI SUITE — SOLO ORCHESTRATORE\nNessun modello Subagenti è selezionato. Svolgi direttamente il lavoro richiesto e le verifiche con i tuoi strumenti; non chiamare delegate_tasks e non avviare subagenti. Questa modalità prevale sulle istruzioni di delega nelle skill. Non scegliere automaticamente un modello dei figli.\n':`\n\nPI SUITE — ORCHESTRAZIONE DALLA CHAT\nSei l’orchestratore. Per ogni richiesta dell’utente, prima di rispondere, DEVI chiamare delegate_tasks e affidare almeno un incarico a un subagente. Questa regola vale anche per richieste semplici, brevi o indivisibili: in quei casi crea un solo incarico generale, chiedi al figlio di preparare la risposta o il risultato richiesto e poi controllalo e rispondi dalla chat. Non rispondere direttamente senza aver coinvolto almeno un figlio. Per richieste complesse puoi suddividere il lavoro in più incarichi paralleli o sequenziali, fino ai limiti configurati; non imporre ruoli o una catena fissa. Il modello e il livello di ragionamento dei subagenti sono quelli scelti dall’utente, indipendenti dai tuoi. Delega il lavoro operativo (analisi delle fonti, stesura, codice e proposte), non un controllo simbolico dopo averlo già svolto tu. Prima della delega leggi solo il contesto necessario per definire un buon incarico. Concentra il tuo ragionamento su scomposizione, vincoli, criteri di accettazione e controllo finale. Usa un solo figlio per compiti semplici; aggiungine altri per attività distinte e utili. Fornisci decisioni già prese, esempi di risultato e verifiche concrete adatti a un esecutore con ragionamento ridotto. Chiedi consegne sintetiche con evidenze, proposte, verifiche svolte e incertezze; non chiedere ragionamenti interni. Se la consegna non soddisfa i criteri, assegna una correzione mirata, senza rifare tutto con il modello principale. Non cambiare automaticamente modello o thinking, né attivare escalation a un provider diverso. Se mancano configurazione, budget o un risultato valido, dichiara il blocco e non presentare il flusso come completato. Per ciascuno SCRIVI un incarico preciso tramite i campi richiesti: saranno salvati in INCARICO.md prima dell’avvio. Specifica obiettivo, contesto/fonti iniziali, istruzioni, attività escluse, criteri verificabili, consegna e file autorizzati. La lettura del progetto è libera; non restringerla artificialmente alle fonti iniziali. I figli non eseguono shell e consegnano proposte separate. Tu mantieni il contesto della chat, esamini gli esiti, integri le proposte pertinenti con i tuoi strumenti ed esegui le verifiche appropriate. Non confondere la consegna di una proposta con una modifica già applicata. Se lo scopo è documentale o analitico non imporre Git o test di codice. Per delegare usa delegate_tasks, che applica il contratto della suite sopra pi-subagents; i comandi del pacchetto restano disponibili per ispezione. Skills non possono ampliare il perimetro. Non eseguire chiamate extra a ruoli fissi.\n`)}));
  const text=()=>Type.String({minLength:1,maxLength:16000});
  pi.registerTool({name:'delegate_tasks',label:'Delega incarichi Markdown',description:'Delega 1–4 incarichi dinamici a pi-subagents. Scrivi istruzioni precise: ogni incarico viene salvato in INCARICO.md. I figli leggono liberamente il progetto ma propongono modifiche solo a writeFiles. Restituisce risultati e proposte da verificare/integrare. Puoi usare writeFiles: [] per analisi o risposte.',
    parameters:Type.Object({plan:text(),tasks:Type.Array(Type.Object({title:text(),objective:text(),context:text(),instructions:text(),constraints:text(),acceptance:text(),deliverable:text(),writeFiles:Type.Array(Type.String(),{maxItems:50})}),{minItems:1,maxItems:4})}),
    async execute(_id,args,signal,onUpdate,ctx){
      attempted=true;
      if(!ready)throw Error('Avvia Pi tramite il launcher della suite dopo aver salvato orchestratore e subagenti.');
      const cfg=config();if(!cfg.worker?.provider||!cfg.worker?.model)throw Error('Configura il modello dei subagenti nel pannello.');
      if(contextSources)cfg.connectedSources=contextSources(ctx);
      if(used+args.tasks.length>cfg.maxCalls)throw Error('Limite di subagenti per questa sessione raggiunto.');
      const {root:batchRoot,batch}=prepareBatch(home,workspace?workspace(ctx):ctx.cwd,args.tasks,cfg,args.plan);used+=args.tasks.length;
      const persist=()=>fs.writeFileSync(path.join(batchRoot,'batch.json'),JSON.stringify(batch,null,2));
      let cursor=0;
      const work=async()=>{while(cursor<batch.tasks.length){const index=cursor++,item=batch.tasks[index];
        if(signal?.aborted){item.state='cancelled';persist();continue;}
        item.state='running';persist();
        const request={requestId:crypto.randomUUID(),ownerRunId:batch.id,nodeId:String(index+1),agent:'suite-executor',
          task:'Esegui l’unico INCARICO.md fornito nel contesto di sistema. Restituisci la consegna richiesta e segnala eventuali punti bloccanti.',
          context:'fresh',cwd:item.directory,model:cfg.worker.provider+'/'+cfg.worker.model,thinking:cfg.worker.effort,
          timeoutMs:600000,toolBudget:{hard:64},skill:false,artifacts:true,result:{kind:'text'}};
        try {
          const result:any=await new Promise((resolve,reject)=>{
            let timer:any;const finish=(value:any)=>{clearTimeout(timer);offResponse();offUpdate();signal?.removeEventListener('abort',cancel);resolve(value);};
            const offResponse=pi.events.on(RESPONSE,(r:any)=>{if(r.requestId===request.requestId)finish(r);});
            const offUpdate=pi.events.on(UPDATE,(r:any)=>{if(r.requestId===request.requestId)onUpdate?.({content:[{type:'text',text:item.title+' · '+(r.currentTool||r.recentOutput||'in esecuzione')}],details:{batch:batch.id}});});
            const cancel=()=>pi.events.emit(CANCEL,{requestId:request.requestId,ownerRunId:batch.id,nodeId:request.nodeId});
            signal?.addEventListener('abort',cancel,{once:true});
            timer=setTimeout(()=>{cancel();finish({status:'timed_out',error:'Nessun risultato entro la scadenza'});},630000);
            try{pi.events.emit(REQUEST,request);}catch(e){clearTimeout(timer);offResponse();offUpdate();signal?.removeEventListener('abort',cancel);reject(e);}
          });
          item.state=result.status;item.result=result;fs.writeFileSync(path.join(item.directory,'result.json'),JSON.stringify(result,null,2));
        }catch(e:any){item.state='failed';item.error=e.message;}
        persist();
      }};
      await Promise.all(Array.from({length:Math.min(cfg.maxParallelWorkers,args.tasks.length)},work));
      batch.state=batch.tasks.every((t:any)=>t.state==='completed')?'completed':'needs_attention';persist();
      delegated ||= batch.tasks.some((t:any)=>t.state==='completed');
      return {content:[{type:'text',text:JSON.stringify({batch:batch.id,state:batch.state,project:batch.project,tasks:batch.tasks.map((t:any)=>({title:t.title,state:t.state,assignment:path.join(t.directory,'INCARICO.md'),result:t.result,error:t.error,proposals:path.join(t.directory,'proposals'),writeFiles:t.writeFiles})),next:'Verifica i risultati e le proposte. Integra solo quelle corrette nel progetto originale; esegui tu le verifiche necessarie.'})}],details:{batch:batch.id}};
    }
  });
}
