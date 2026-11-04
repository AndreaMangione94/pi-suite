import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Type } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  registerAgentViaEvents,
  registerSubagentCapabilityCeiling,
  registerRequiredChildExtensions,
  SUBAGENT_DELEGATION_REQUEST_EVENT as REQUEST,
  SUBAGENT_DELEGATION_RESPONSE_EVENT as RESPONSE,
  SUBAGENT_DELEGATION_UPDATE_EVENT as UPDATE,
  SUBAGENT_DELEGATION_CANCEL_EVENT as CANCEL
} from './pi-bridge.mjs';
import { chatContext } from './chat-context.mjs';
import { prompt } from './prompts.mjs';
import { CHILD_TOOL_NAMES } from './child-tools.mjs';
import { prepareBatch, taskDigest, applyProposals, TASK_KINDS, RESULT_SCHEMA } from './delegation-core.mjs';
import { isDocumentationDossier } from './documentation-workflow.mjs';
import { evidenceScopeSchema, evidenceReadingSummary } from './evidence-reading.mjs';
import { recordUsage, usageEntry } from './suite-metrics.mjs';

export default function registerDelegation(
  pi: ExtensionAPI,
  root: string,
  home: string,
  contextSources?: (ctx: any) => any[],
  workspace?: (ctx: any) => string
) {
  let registrations: any[] = [],
    ready = false,
    used = 0;
  let delegated = false,
    attempted = false,
    reminded = false;
  const toolNames = CHILD_TOOL_NAMES;
  const launchPath = path.join(process.env.PI_CODING_AGENT_DIR || path.join(home, 'pi-shell'), 'suite-launch.json');
  let sessionConfig: any;
  const config = () => structuredClone(sessionConfig);
  const cleanup = () => {
    for (const r of registrations) r.dispose();
    registrations = [];
    ready = false;
  };
  pi.on('session_start', async (_event, ctx) => {
    cleanup();
    sessionConfig = undefined;
    used = 0;
    delegated = false;
    attempted = false;
    reminded = false;
    if (!fs.existsSync(launchPath)) return;
    sessionConfig = JSON.parse(fs.readFileSync(launchPath, 'utf8'));
    registrations.push(
      registerAgentViaEvents({
        pi,
        name: 'suite-executor',
        definition: {
          description:
            'Subagente generale: esegue l’incarico Markdown del genitore, esplora liberamente il progetto e produce una risposta o proposte di file.',
          systemPrompt: prompt('esecutore'),
          tools: toolNames,
          extensions: [path.join(root, 'suite-child.ts')],
          inheritSkills: false,
          inheritProjectContext: false,
          inheritGlobalContext: false,
          allowNestedSubagents: false,
          defaultContext: 'fresh',
          defaultAsync: false
        }
      })
    );
    registrations.push(
      registerSubagentCapabilityCeiling({
        sessionId: ctx.sessionManager.getSessionId(),
        source: 'pi-suite',
        ceiling: { allowedAgents: ['suite-executor'], allowedTools: toolNames }
      })
    );
    registrations.push(
      registerRequiredChildExtensions({
        sessionId: ctx.sessionManager.getSessionId(),
        extensions: [{ id: 'suite-contract', path: path.join(root, 'suite-child.ts') }],
        requireForAllRunners: true
      })
    );
    ready = true;
  });
  pi.on('session_shutdown', async () => cleanup());
  pi.on('before_agent_start', async () => {
    delegated = false;
    attempted = false;
    reminded = false;
  });
  // A bounded correction catches a model ignoring the delegation instruction.
  // Never retry cancelled/failed runs or spend more calls after a failed child.
  pi.on('agent_before_settle', async (event, ctx) => {
    if (ready && !sessionConfig?.worker) return;
    if (event.outcome !== 'completed' || delegated) return;
    // In modalità auto la delega è una scelta del modello: l'obbligo resta solo per "always" e per i dossier documentali.
    if (sessionConfig?.delegationPolicy !== 'always' && !isDocumentationDossier(workspace ? workspace(ctx) : ctx.cwd))
      return;
    const available = ready && sessionConfig?.worker?.model && used < sessionConfig.maxCalls;
    if (!attempted && !reminded && available) {
      reminded = true;
      return {
        entries: [
          {
            type: 'custom_message',
            customType: 'suite-delegation-required',
            display: true,
            content:
              'Delega obbligatoria: manca la consegna di un subagente per questa richiesta. Chiama ora delegate_tasks con un unico incarico operativo preciso (oppure più incarichi solo se utili), poi verifica il risultato. Non svolgere di nuovo il lavoro al suo posto.'
          }
        ],
        continue: true
      };
    }
    return {
      entries: [
        {
          type: 'custom_message',
          customType: 'suite-delegation-incomplete',
          display: true,
          content:
            'Richiesta senza consegna completata da un subagente: il flusso orchestrato non è completato. Controlla configurazione, limite della sessione ed esiti in Attività e risultati. Nessun ulteriore tentativo automatico.'
        }
      ]
    };
  });
  pi.on('tool_call', async event => {
    if (
      ready &&
      !sessionConfig?.worker &&
      (event.toolName === 'delegate_tasks' ||
        (event.toolName === 'subagent' &&
          !['list', 'status', 'guide'].includes(String((event.input as any)?.action || ''))))
    )
      return {
        block: true,
        reason:
          'Modalità solo orchestratore: nessun modello Subagenti selezionato. Svolgi il lavoro direttamente, senza avviare figli.'
      };
    if (
      event.toolName === 'subagent' &&
      !['list', 'status', 'guide'].includes(String((event.input as any)?.action || ''))
    )
      return {
        block: true,
        reason:
          'Nella suite assegna gli incarichi tramite delegate_tasks: salva INCARICO.md e applica limiti, modello e perimetro. subagent resta disponibile per list/status/guide.'
      };
  });
  const soloPrompt = prompt('solo-orchestratore');
  const alwaysPrompt = prompt('delegazione-sempre');
  const autoPrompt = prompt('delegazione-automatica');
  // Sezione con nome: se la politica cambia (per esempio entrando in un dossier), Pi aggiunge solo la differenza e conserva il prompt in cache.
  pi.on('before_agent_start', async (event, ctx) => {
    event.systemPromptOptions.sections.pi_suite_delegation = (
      ready && !sessionConfig?.worker
        ? soloPrompt
        : sessionConfig?.delegationPolicy === 'always' || isDocumentationDossier(workspace ? workspace(ctx) : ctx.cwd)
          ? alwaysPrompt
          : autoPrompt
    ).trim();
  });
  // Campi brevi e in gran parte facoltativi: i valori mancanti arrivano dai default del kind.
  const text = (max: number) => Type.String({ minLength: 1, maxLength: max });
  pi.registerTool({
    name: 'delegate_tasks',
    label: 'Delega incarichi Markdown',
    description:
      'Delega 1–4 incarichi a subagenti. Campi obbligatori: title, objective, instructions (a elenco), writeFiles (anche []). kind sceglie limiti, criteri e consegna predefiniti; scrivili solo se diversi. refs: percorsi già letti (src/x.ts#L10-L80 o [sourceId:documentId]#L1-L40) che il runtime inserisce nell’incarico. Per l’analisi delle fonti compila evidenceScope.',
    parameters: Type.Object({
      plan: Type.Optional(text(2000)),
      tasks: Type.Array(
        Type.Object({
          kind: Type.Optional(Type.Union(TASK_KINDS.map((k: string) => Type.Literal(k)))),
          title: text(120),
          objective: text(1500),
          instructions: text(6000),
          context: Type.Optional(text(4000)),
          constraints: Type.Optional(text(2000)),
          acceptance: Type.Optional(text(2000)),
          deliverable: Type.Optional(text(1500)),
          writeFiles: Type.Array(Type.String(), { maxItems: 50 }),
          refs: Type.Optional(Type.Array(Type.String({ maxLength: 400 }), { maxItems: 20 })),
          evidenceScope: Type.Optional(Type.Unsafe(evidenceScopeSchema))
        }),
        { minItems: 1, maxItems: 4 }
      )
    }),
    async execute(_id, args, signal, onUpdate, ctx) {
      attempted = true;
      if (!ready) throw Error('Avvia Pi tramite il launcher della suite dopo aver salvato orchestratore e subagenti.');
      const cfg = config();
      const selection = chatContext(workspace ? workspace(ctx) : ctx.cwd);
      for (const name of [
        ...(selection?.graphs?.length ? ['graph-explorer'] : []),
        ...(selection?.documentation?.length ? ['lettura-documentazione-tecnico-funzionale'] : [])
      ]) {
        if (!cfg.skills.some((s: any) => s.name === name))
          cfg.skills.push({
            name,
            description: name,
            content: fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8')
          });
      }
      if (!cfg.worker?.provider || !cfg.worker?.model) throw Error('Configura il modello dei subagenti nel pannello.');
      if (contextSources) cfg.connectedSources = contextSources(ctx);
      if (used + args.tasks.length > cfg.maxCalls) throw Error('Limite di subagenti per questa sessione raggiunto.');
      const { root: batchRoot, batch } = await prepareBatch(
        home,
        workspace ? workspace(ctx) : ctx.cwd,
        args.tasks,
        cfg,
        args.plan || ''
      );
      used += args.tasks.length;
      const persist = () => fs.writeFileSync(path.join(batchRoot, 'batch.json'), JSON.stringify(batch, null, 2));
      let cursor = 0;
      const work = async () => {
        while (cursor < batch.tasks.length) {
          const index = cursor++,
            item = batch.tasks[index];
          if (signal?.aborted) {
            item.state = 'cancelled';
            persist();
            continue;
          }
          item.state = 'running';
          persist();
          const request = {
            requestId: crypto.randomUUID(),
            ownerRunId: batch.id,
            nodeId: String(index + 1),
            agent: 'suite-executor',
            task:
              cfg.resultMode === 'text'
                ? 'Esegui l’unico INCARICO.md fornito nel contesto di sistema. Restituisci la consegna richiesta e segnala eventuali punti bloccanti.'
                : 'Esegui l’unico INCARICO.md fornito nel contesto di sistema. Alla fine consegna con structured_output: status (done/partial/blocked), answer breve, findings con refs, proposals (file proposti e sintesi), gaps, questions, nextTasks.',
            context: 'fresh',
            cwd: item.directory,
            model: cfg.worker.provider + '/' + cfg.worker.model,
            thinking: cfg.worker.effort,
            timeoutMs: 600000,
            toolBudget: { soft: 40, hard: 64 },
            skill: false,
            artifacts: true,
            result: cfg.resultMode === 'text' ? { kind: 'text' } : { kind: 'structured', schema: RESULT_SCHEMA }
          };
          try {
            const result: any = await new Promise((resolve, reject) => {
              let timer: any;
              const finish = (value: any) => {
                clearTimeout(timer);
                offResponse();
                offUpdate();
                signal?.removeEventListener('abort', cancel);
                resolve(value);
              };
              const offResponse = pi.events.on(RESPONSE, (r: any) => {
                if (r.requestId === request.requestId) finish(r);
              });
              const offUpdate = pi.events.on(UPDATE, (r: any) => {
                if (r.requestId === request.requestId)
                  onUpdate?.({
                    content: [
                      { type: 'text', text: item.title + ' · ' + (r.currentTool || r.recentOutput || 'in esecuzione') }
                    ],
                    details: { batch: batch.id }
                  });
              });
              const cancel = () =>
                pi.events.emit(CANCEL, { requestId: request.requestId, ownerRunId: batch.id, nodeId: request.nodeId });
              signal?.addEventListener('abort', cancel, { once: true });
              timer = setTimeout(() => {
                cancel();
                finish({ status: 'timed_out', error: 'Nessun risultato entro la scadenza' });
              }, 630000);
              try {
                pi.events.emit(REQUEST, request);
              } catch (e) {
                clearTimeout(timer);
                offResponse();
                offUpdate();
                signal?.removeEventListener('abort', cancel);
                reject(e);
              }
            });
            item.state = result.status;
            item.result = result;
            fs.writeFileSync(path.join(item.directory, 'result.json'), JSON.stringify(result, null, 2));
            try {
              recordUsage(
                home,
                ctx.sessionManager.getSessionId(),
                usageEntry('child', result.model || cfg.worker.provider + '/' + cfg.worker.model, result.usage, {
                  batch: batch.id,
                  task: index + 1,
                  state: result.status,
                  turns: result.usage?.turns,
                  durationMs: result.usage?.durationMs
                })
              );
            } catch {}
            const contract = JSON.parse(fs.readFileSync(path.join(item.directory, 'contract.json'), 'utf8'));
            item.evidenceReading = evidenceReadingSummary(item.directory, contract);
          } catch (e: any) {
            item.state = 'failed';
            item.error = e.message;
          }
          persist();
        }
      };
      await Promise.all(Array.from({ length: Math.min(cfg.maxParallelWorkers, args.tasks.length) }, work));
      batch.state = batch.tasks.every((t: any) => t.state === 'completed') ? 'completed' : 'needs_attention';
      persist();
      delegated ||= batch.tasks.some((t: any) => t.state === 'completed');
      // Al genitore torna solo un digest compatto; i dettagli completi restano in batch.json/result.json.
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              batch: batch.id,
              state: batch.state,
              tasks: batch.tasks.map(taskDigest),
              next: 'Verifica i risultati. Applica le proposte approvate con apply_proposal(batch, task); per correzioni delega un incarico mirato con i difetti osservati. Dettagli completi nei file indicati.'
            })
          }
        ],
        details: { batch: batch.id }
      };
    }
  });
  pi.registerTool({
    name: 'apply_proposal',
    label: 'Applica proposte dei subagenti',
    description:
      'Copia nel progetto o nel dossier i file proposti da un task, dopo averli verificati: evita di riscriverne il contenuto. Senza files applica tutte le proposte del task. Restituisce righe prima/dopo per ogni file.',
    parameters: Type.Object({
      batch: Type.String(),
      task: Type.Integer({ minimum: 1, maximum: 4 }),
      files: Type.Optional(Type.Array(Type.String(), { maxItems: 50 }))
    }),
    async execute(_id, args, _signal, _update, ctx) {
      return {
        content: [
          { type: 'text', text: JSON.stringify(applyProposals(home, args, workspace ? workspace(ctx) : ctx.cwd)) }
        ],
        details: {}
      };
    }
  });
}
