// Apply transport policy to inference only, leaving unrelated CLI tools unchanged.
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!/\/(chat\/completions|responses(?:\/[^/]+)?|messages)\/?$|:(streamGenerateContent|generateContent)$/.test(url.pathname))return originalFetch(input,init);
  const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
  for(const name of ['authorization','api-key','x-api-key','x-goog-api-key'])if(headers.get(name)==='__PI_SUITE_OMIT_HEADER__')headers.delete(name);
  return originalFetch(input,{...init,headers,redirect:'error'});
};
