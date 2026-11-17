import { AppError, type NetworkPolicy } from '../../core/src/index';
// Deliberately no wildcards. Host names must be reviewed operator-owned endpoints.
export function authorizeTarget(raw:string,method:string,policies:NetworkPolicy[]){
  let url:URL; try{url=new URL(raw)}catch{throw new AppError('TARGET_DENIED','目标地址无效',403)}
  if(url.protocol!=='https:' || url.username || url.password || url.hash || (url.port && url.port!=='443')) throw new AppError('TARGET_DENIED','目标地址未获准',403);
  if(/%2f|%5c|%25/i.test(url.pathname))throw new AppError('TARGET_DENIED','目标路径包含歧义编码',403);
  const host=url.hostname.toLowerCase();
  if(!host.includes('.') || host.endsWith('.') || /^(?:\d|\[)/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) throw new AppError('TARGET_DENIED','禁止访问内部或保留地址',403);
  const policy=policies.find(p=>p.host===host && p.methods.includes(method as 'GET') && (p.pathPrefix.endsWith('/') ? url.pathname.startsWith(p.pathPrefix) : url.pathname===p.pathPrefix));
  if(!policy) throw new AppError('TARGET_DENIED','音源网络权限不允许此请求',403);
  return {url,policy};
}
export const forbiddenHeaders=new Set(['authorization','cookie','cf-access-jwt-assertion','cf-access-client-id','cf-access-client-secret','host','connection','proxy-authorization','set-cookie']);
export function filterHeaders(input:Record<string,string>,policy:NetworkPolicy){
 const headers=new Headers();
 for(const [name,value] of Object.entries(input)){const key=name.toLowerCase();if(forbiddenHeaders.has(key) || !policy.headers.includes(key)) throw new AppError('HEADER_DENIED','请求头未获准',403);headers.set(key,value)}
 return headers;
}
