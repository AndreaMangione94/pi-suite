import fs from 'node:fs';
import path from 'node:path';
import {legacyDocumentation} from './documentation-compat.mjs';

export function isDocumentationDossier(workspace) {
  return fs.existsSync(path.join(workspace,'FONTI.json'))&&
    ['INCARICO-DOCUMENTAZIONE-TECNICO-FUNZIONALE.md',legacyDocumentation.assignment].some(name=>fs.existsSync(path.join(workspace,name)));
}

export function documentationInstructions(workspace) {
  if(!isDocumentationDossier(workspace))return '';
  return fs.readFileSync(new URL('./skills/documentazione-tecnico-funzionale/references/workflow.md',import.meta.url),'utf8');
}

export const documentationChildInstructions='Per questo dossier AS-IS di documentazione tecnico funzionale esegui solo il micro modulo o la funzionalità assegnata. Se l’incarico è di solo censimento iniziale, elenca unità e riferimenti senza stenderne la documentazione. La lettura di fonti adiacenti serve soltanto a chiarire contesto e punti di passaggio: non estendere analisi o stesura ad altre funzionalità. Per esse lascia riferimenti agli ID del piano, input/output di collegamento ed evidenze, senza duplicarne i dettagli. Segnala funzionalità nuove, lacune o necessità di scomposizione come proposte di nuovi task al genitore; non ampliare il tuo incarico e non avviare altri agenti. Documenta nell’ambito assegnato attori, permessi, prerequisiti, azioni e risposte, regole, esiti, varianti, errori e dettagli tecnici pertinenti. Consegna solo la proposta autorizzata, citazioni, riferimenti e punti aperti; l’orchestratore aggiorna il piano, integra i pezzi e assegna le continuazioni.';
