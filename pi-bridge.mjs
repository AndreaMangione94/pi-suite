// Unico punto di contatto con le API di pi-subagents usate dalla suite. Prima di aggiornare pi-subagents o
// pi-coding-agent esegui tests/pi-contract.test.mjs: verifica questi export, gli eventi delle estensioni e i percorsi
// interni che la suite usa (CLI di Pi, estensione e skill di pi-subagents).
export { registerAgentViaEvents } from 'pi-subagents/agents';
export { registerSubagentCapabilityCeiling } from 'pi-subagents/capability-ceiling';
export { registerRequiredChildExtensions } from 'pi-subagents/required-child-extensions';
export {
  SUBAGENT_DELEGATION_REQUEST_EVENT,
  SUBAGENT_DELEGATION_RESPONSE_EVENT,
  SUBAGENT_DELEGATION_UPDATE_EVENT,
  SUBAGENT_DELEGATION_CANCEL_EVENT
} from 'pi-subagents/delegation';
