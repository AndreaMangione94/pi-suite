import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { scopedTools, assignmentSystemPrompt } from './delegation-core.mjs';
import { CHILD_TOOLS } from './child-tools.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { evidenceReadingSummary } from './evidence-reading.mjs';

export default function (pi: ExtensionAPI) {
  // Every operation resolves from this child's own cwd, never a process-global scope.
  for (const [name, tool] of Object.entries(CHILD_TOOLS) as any)
    pi.registerTool({
      name,
      label: name,
      description: tool.description,
      parameters: tool.parameters,
      async execute(id, args, signal, _update, ctx) {
        return scopedTools(ctx.cwd)
          .find((t: any) => t.name === name)
          .execute(id, args, signal);
      }
    });
  pi.on('session_start', async (_event, ctx) => {
    scopedTools(ctx.cwd);
  });
  pi.on('before_agent_start', async (event, ctx) => ({
    systemPrompt: assignmentSystemPrompt(event.systemPrompt, ctx.cwd)
  }));
  const readingReminders = new Set<string>();
  pi.on('agent_before_settle', async (event, ctx) => {
    if (event.outcome !== 'completed' || readingReminders.has(ctx.cwd)) return;
    const contract = JSON.parse(fs.readFileSync(path.join(ctx.cwd, 'contract.json'), 'utf8'));
    const reading = evidenceReadingSummary(ctx.cwd, contract);
    if (
      !contract.evidenceScope ||
      (!reading.readCalls && contract.evidenceScope.origin !== 'explicit') ||
      (!reading.reportMissing && !reading.declarationStale)
    )
      return;
    readingReminders.add(ctx.cwd);
    return {
      entries: [
        {
          type: 'custom_message',
          customType: 'suite-evidence-reading-required',
          display: true,
          content:
            'Prima di concludere chiama report_evidence_reading. Riporta sintesi, citazioni, documenti iniziali non letti con motivi, dubbi e richieste di ampliamento. La copertura sarà calcolata sulle letture effettive; non dichiarare completo un documento letto solo in parte.'
        }
      ],
      continue: true
    };
  });
}
