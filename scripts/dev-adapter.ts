import type { Plugin } from 'vite';
import { app } from '../apps/worker/src/index';
// Local-only adapter. It is never included in the deployed Worker bundle.
export function localApi():Plugin{return {name:'local-worker-api',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(!req.url?.startsWith('/api/'))return next();
 try {
   const headers=new Headers();for(const [k,v]of Object.entries(req.headers)){if(v)headers.set(k,Array.isArray(v)?v.join(','):v)}
   const origin=headers.get('origin');if(origin){if(new URL(origin).host!==req.headers.host){res.statusCode=403;res.end('Origin denied');return}}
   let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>1024*1024){res.statusCode=413;res.end();return}}
   const signal=new AbortController();res.on('close',()=>signal.abort());
   const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method||'GET')?undefined:body,signal:signal.signal});
   const response=await app.fetch(request,{APP_ENV:'local',DEV_IDENTITY:'local-poc-user',STREAM_SECRET:'local-development-secret-32-bytes-only'});
   res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));
   if(response.body){const reader=response.body.getReader();try{while(!signal.signal.aborted){const {done,value}=await reader.read();if(done)break;if(!res.write(value))await new Promise(resolve=>res.once('drain',resolve))}}finally{await reader.cancel().catch(()=>{})}}
   res.end();
 }catch{if(!res.headersSent)res.statusCode=500;res.end('Local adapter failure')}
 })}}}
