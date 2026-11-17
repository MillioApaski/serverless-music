import {Worker} from 'node:worker_threads';
import {it,expect} from 'vitest';
import {SourceRuntime} from '../packages/source-runtime/src/runtime';
it('reclaims a pathological allocating sandbox by terminating its owning Worker',async()=>{
 const worker=new Worker(new URL('./pathological-worker.ts',import.meta.url),{execArgv:['--import','tsx'],stderr:true});
 let diagnostic='';worker.stderr.on('data',chunk=>{diagnostic+=String(chunk)});
 try{
  const result=await new Promise<any>((resolve,reject)=>{const watchdog=setTimeout(()=>{void worker.terminate();reject(new Error('Owning Worker watchdog exceeded'))},5000);worker.once('message',value=>{clearTimeout(watchdog);resolve(value)});worker.once('error',error=>{clearTimeout(watchdog);reject(error)})});
  expect(result.unexpected).not.toBe(true);expect(result.error).toMatch(/interrupt|timeout|memory|Fatal sandbox/i);
 }finally{await worker.terminate()}
 const next=await SourceRuntime.create("lx.on('request',async()=>42);lx.send('inited',{sources:{local:{type:'music',actions:['musicUrl'],qualitys:[]}}});",async()=>({statusCode:200,headers:{},body:''}));
 try{expect(await next.request({source:'local',action:'musicUrl',info:{}})).toBe(42)}finally{next.dispose()}
});
