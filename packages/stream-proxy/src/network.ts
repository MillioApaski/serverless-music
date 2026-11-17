import { AppError, type NetworkPolicy, type BridgeRequest, type BridgeResponse } from '../../core/src/index';
import { authorizeTarget,filterHeaders } from '../../source-sdk/src/policy';
export type Fetcher=(request:Request)=>Promise<Response>;
export async function permittedFetch(input:BridgeRequest,policies:NetworkPolicy[],signal:AbortSignal,fetcher:Fetcher=fetch){
 const method=(input.method||'GET').toUpperCase();let current=input.url;
 const initial=authorizeTarget(current,method,policies);
 let headers=filterHeaders(input.headers||{},initial.policy);
 for(let hop=0;hop<=3;hop++){
   authorizeTarget(current,method,policies);
   const response=await fetcher(new Request(current,{method,headers,body:method==='GET'||method==='HEAD'?undefined:input.body,redirect:'manual',signal}));
   if(![301,302,303,307,308].includes(response.status))return response;
   await response.body?.cancel();
   const location=response.headers.get('location');
   if(!location || hop===3)throw new AppError('REDIRECT_DENIED','上游重定向无效',502);
   const next=new URL(location,current);authorizeTarget(next.href,method,policies);
   if(method!=='GET' && method!=='HEAD' && ![307,308].includes(response.status))throw new AppError('REDIRECT_DENIED','不允许请求方法变更',502);
   if(next.origin!==new URL(current).origin)headers=new Headers();
   current=next.href;
 }
 throw new AppError('REDIRECT_DENIED','重定向过多',502);
}
export async function boundedText(response:Response,maxBytes:number){
 const advertised=Number(response.headers.get('content-length'));
 if(advertised>maxBytes){await response.body?.cancel();throw new AppError('RESPONSE_TOO_LARGE','上游响应超过大小限制',502)}
 if(!response.body)return '';
 const reader=response.body.getReader();const decoder=new TextDecoder();let size=0;let result='';
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new AppError('RESPONSE_TOO_LARGE','上游响应超过大小限制',502);result+=decoder.decode(value,{stream:true})}return result+decoder.decode()}
 finally {await reader.cancel().catch(()=>{});reader.releaseLock()}
}
export async function httpBridge(input:BridgeRequest,policies:NetworkPolicy[],clientSignal:AbortSignal,fetcher?:Fetcher):Promise<BridgeResponse>{
 if(input.body && new TextEncoder().encode(input.body).byteLength>65536)throw new AppError('BODY_TOO_LARGE','请求体过大',413);
 const signal=AbortSignal.any([clientSignal,AbortSignal.timeout(Math.min(input.timeout||5000,10000))]);
 const response=await permittedFetch(input,policies,signal,fetcher);
 const body=await boundedText(response,1024*1024);
 const headers:Record<string,string>={};
 for(const key of ['content-type','content-length']){const value=response.headers.get(key);if(value)headers[key]=value}
 return {statusCode:response.status,headers,body};
}
