import fs from 'node:fs';
export const legacyDocumentation=JSON.parse(fs.readFileSync(new URL('./documentation-compat.json',import.meta.url),'utf8'));
export const isTechnicalDocumentation=manifest=>['documentation',legacyDocumentation.kind].includes(manifest?.kind);
export function upgradeDocumentationContext(value){
  if(!value)return value;
  const old=legacyDocumentation.workspaceKey;
  if(value[old]!==undefined&&value.documentation===undefined)value.documentation=value[old];
  delete value[old];
  const workspace=value.project?.workspace;
  if(workspace?.[old]!==undefined&&workspace.documentation===undefined)workspace.documentation=workspace[old];
  if(workspace)delete workspace[old];
  return value;
}
